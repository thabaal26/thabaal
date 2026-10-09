import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { allowance } from "./limits";
import { explainError, metaError } from "./meta-errors";
import { deliver, getSettings, readiness, templateSendable } from "./provider";
import { applyFailure, quietUntil, recentlyMarketed } from "./rules";
import { senderFor } from "./senders";
import { MetaError } from "./whatsapp";

// When Meta holds a marketing message back (131049: the person gets too much marketing;
// 130472: they're in Meta's marketing experiment), the message isn't lost for good. Meta's
// advice is to try again in a few days, so:
//  - the customer's marketing is paused for RETRY_AFTER_DAYS (campaigns skip them meanwhile),
//  - then the campaign message is sent once more, automatically,
//  - and if Meta holds it back again, it stays failed. Retrying harder hurts the number's quality.
// No extra columns: a retry is a second message for the same customer in the same campaign run,
// and Meta doesn't charge for held-back messages.

export const HELD_CODES = [131049, 130472];
export const RETRY_AFTER_DAYS = 3;
/** Offers go stale (a Deepavali offer a fortnight later), so a retry that couldn't go out by then is dropped. */
export const RETRY_UNTIL_DAYS = 7;

const DAY = 86_400_000;
/** Marks a retry row from creation until Meta returns the real message id; also stops two scheduler calls retrying the same message. */
const RETRY_MARK = "retry:";

export const isHeld = (code: number | null | undefined) => code != null && HELD_CODES.includes(code);

/** Of these customers, whose marketing Meta is holding back right now, and until when. */
export async function marketingPaused(customerIds: string[], now = new Date()) {
  const paused = new Map<string, Date>();
  if (!customerIds.length) return paused;
  const rows = await db.message.findMany({
    where: { customerId: { in: customerIds }, status: "FAILED", errorCode: { in: HELD_CODES }, failedAt: { gt: new Date(now.getTime() - RETRY_AFTER_DAYS * DAY) } },
    select: { customerId: true, failedAt: true },
    orderBy: { failedAt: "desc" },
  });
  for (const r of rows) if (!paused.has(r.customerId)) paused.set(r.customerId, new Date(r.failedAt!.getTime() + RETRY_AFTER_DAYS * DAY));
  return paused;
}

type Candidate = { id: string; runId: string; customerId: string; campaignId: string };

/**
 * Held-back campaign messages ready for their one retry: the first message to that customer in
 * that run, not retried yet, held long enough (unless `ignoreWait`) and not gone stale.
 */
async function candidates(now: Date, campaignId?: string, ignoreWait = false) {
  const readyBy = new Date(now.getTime() - (ignoreWait ? 0 : RETRY_AFTER_DAYS) * DAY);
  const staleBy = new Date(now.getTime() - RETRY_UNTIL_DAYS * DAY);
  return db.$queryRaw<Candidate[]>`
    SELECT m.id, m."runId", m."customerId", r."campaignId"
    FROM "Message" m
    JOIN "CampaignRun" r ON r.id = m."runId"
    JOIN "Customer" c ON c.id = m."customerId"
    WHERE m.status = 'FAILED' AND m."errorCode" IN (${Prisma.join(HELD_CODES)})
      AND m."failedAt" <= ${readyBy} AND m."failedAt" > ${staleBy}
      AND r.status <> 'CANCELLED'
      AND c."optedOut" = false AND c.unreachable = false
      AND (${campaignId ?? null}::text IS NULL OR r."campaignId" = ${campaignId ?? null})
      AND NOT EXISTS (SELECT 1 FROM "Message" o WHERE o."runId" = m."runId" AND o."customerId" = m."customerId" AND o.id <> m.id)
    ORDER BY m."failedAt" ASC
    LIMIT 200`;
}

export type RetryResult = { retried: number; failed: number; waiting: string[] };

/**
 * Sends each ready held-back message once more, from its campaign, with the same rules as a
 * normal batch: approved template, connected number, quiet hours, quality, the 24-hour limit
 * and the gap between offers. Anything blocked right now is simply tried on a later call.
 */
export async function retryHeldBack({ now = new Date(), deadline = Date.now() + 40_000, campaignId, ignoreWait = false }: { now?: Date; deadline?: number; campaignId?: string; ignoreWait?: boolean } = {}): Promise<RetryResult> {
  const result: RetryResult = { retried: 0, failed: 0, waiting: [] };
  const ready = await candidates(now, campaignId, ignoreWait);
  if (!ready.length) return result;

  const settings = await getSettings();
  const byCampaign = new Map<string, Candidate[]>();
  for (const c of ready) byCampaign.set(c.campaignId, [...(byCampaign.get(c.campaignId) ?? []), c]);

  for (const [id, list] of byCampaign) {
    if (Date.now() > deadline) break;
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: { template: true, client: { select: { marketingGapHours: true, quietFrom: true, quietTo: true } } },
    });
    if (!campaign) continue;
    const t = campaign.template;
    const { number, cfg } = await senderFor(campaign.clientId, campaign.senderId);
    const wrongAccount = settings.provider === "META" && t.businessAccountId && number && t.businessAccountId !== number.businessAccountId;
    if (!templateSendable(settings, t) || wrongAccount) {
      result.waiting.push("the template isn't approved for this number");
      continue;
    }
    if (!(await readiness(settings, cfg)).ok) {
      result.waiting.push("the WhatsApp connection is down");
      continue;
    }
    const marketing = t.category === "MARKETING";
    if (marketing && quietUntil(campaign.client, new Date())) {
      result.waiting.push("it's quiet hours");
      continue;
    }
    let take = list.length;
    if (settings.provider === "META" && number && cfg.live) {
      if (number.qualityRating === "RED") {
        result.waiting.push("the number's quality is low");
        continue;
      }
      const a = await allowance(number);
      if (!a.unlimited) take = Math.min(take, Math.max(0, a.left));
      if (take <= 0) {
        result.waiting.push("the number reached its 24-hour limit");
        continue;
      }
    }

    // Someone who got another offer meanwhile waits for the gap, like any campaign send.
    const recent = marketing ? await recentlyMarketed(list.map((c) => c.customerId), campaign.client.marketingGapHours) : new Map<string, Date>();
    const due = list.filter((c) => !recent.has(c.customerId)).slice(0, take);
    const customers = new Map((await db.customer.findMany({ where: { id: { in: due.map((c) => c.customerId) } } })).map((c) => [c.id, c]));

    for (const c of due) {
      if (Date.now() > deadline) break;
      const customer = customers.get(c.customerId);
      if (!customer) continue;
      // Claim the retry: the unique placeholder id makes a second, overlapping call skip it. It starts
      // as SKIPPED (not QUEUED) so a run that's still sending never picks it up and sends it twice.
      let row: { id: string };
      try {
        row = await db.message.create({
          data: {
            runId: c.runId,
            customerId: c.customerId,
            templateId: t.id,
            templateName: t.name,
            status: "SKIPPED",
            error: "Retry of a held-back message didn't finish",
            waMessageId: `${RETRY_MARK}${c.id}`,
          },
          select: { id: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      try {
        const res = await deliver(settings, t, customer, cfg);
        await db.message.update({
          where: { id: row.id },
          data: {
            status: "SENT",
            error: null,
            waMessageId: res.id,
            simulated: res.simulated,
            provider: res.provider,
            body: res.text,
            senderId: settings.provider === "META" ? (number?.id ?? null) : null,
            sentAt: new Date(),
          },
        });
        result.retried++;
      } catch (e) {
        const code = e instanceof MetaError ? (e.code ?? null) : null;
        const kind = metaError(code)?.kind;
        // Too fast: give the slot back and try on a later call.
        if (kind === "rate") {
          await db.message.delete({ where: { id: row.id } });
          result.waiting.push("Meta asked to slow down");
          break;
        }
        await db.message.update({
          where: { id: row.id },
          data: { status: "FAILED", provider: settings.provider, errorCode: code, error: explainError(code, e instanceof Error ? e.message : String(e)), failedAt: new Date() },
        });
        await applyFailure(c.customerId, code);
        result.failed++;
        if (kind === "number-restricted") break;
      }
    }
  }
  return result;
}

/** expired: too old to retry, or a retry that didn't finish. */
export type HeldSummary = { waiting: number; nextRetry: Date | null; retriedOk: number; heldTwice: number; expired: number };

/** Where each held-back message of these runs stands: waiting for its retry, retried, held twice, or too old. */
export async function heldSummary(runIds: string[], now = new Date()): Promise<HeldSummary> {
  const summary: HeldSummary = { waiting: 0, nextRetry: null, retriedOk: 0, heldTwice: 0, expired: 0 };
  if (!runIds.length) return summary;
  const rows = await db.$queryRaw<{ failedAt: Date; retryStatus: string | null }[]>`
    SELECT m."failedAt", rt.status::text AS "retryStatus"
    FROM "Message" m
    LEFT JOIN LATERAL (
      SELECT o.status FROM "Message" o
      WHERE o."runId" = m."runId" AND o."customerId" = m."customerId" AND o."createdAt" > m."createdAt"
      ORDER BY o."createdAt" ASC LIMIT 1
    ) rt ON true
    WHERE m."runId" IN (${Prisma.join(runIds)}) AND m.status = 'FAILED' AND m."errorCode" IN (${Prisma.join(HELD_CODES)})
      AND NOT EXISTS (SELECT 1 FROM "Message" e WHERE e."runId" = m."runId" AND e."customerId" = m."customerId" AND e."createdAt" < m."createdAt")`;
  for (const r of rows) {
    if (r.retryStatus === "FAILED") summary.heldTwice++;
    else if (r.retryStatus === "SENT" || r.retryStatus === "DELIVERED" || r.retryStatus === "READ") summary.retriedOk++;
    else if (r.retryStatus) summary.expired++; // a retry that was interrupted
    else if (r.failedAt.getTime() <= now.getTime() - RETRY_UNTIL_DAYS * DAY) summary.expired++;
    else {
      summary.waiting++;
      const at = new Date(r.failedAt.getTime() + RETRY_AFTER_DAYS * DAY);
      if (!summary.nextRetry || at < summary.nextRetry) summary.nextRetry = at;
    }
  }
  return summary;
}
