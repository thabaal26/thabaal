import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { affordableMessages } from "./wallet";
import { allowance } from "./limits";
import { explainError, metaError, PAUSING_KINDS } from "./meta-errors";
import { deliver, getSettings, readiness, templateSendable } from "./provider";
import { applyFailure, quietUntil, recentlyMarketed } from "./rules";
import { senderFor } from "./senders";
import { INACTIVE_TAG } from "./schedule";
import { MetaError } from "./whatsapp";

// When Meta holds a marketing message back (131049: the person gets too much marketing), the message isn't lost
// for good. Meta: "wait at least 24 hours before resending"; sooner gets the same error. So:
//  - campaigns skip the customer for SKIP_DAYS, so a regular send doesn't hit the limit again,
//  - after RETRY_AFTER_HOURS the campaign page suggests sending it once more, and the business decides,
//  - and if Meta holds it back again, it stays failed (and the page suggests Inactive).
// 130472 (Meta's marketing experiment) is skipped the same way, but never retried: Meta says resending gets the
// same error, with no end date. No extra columns: a retry is a second message for the same customer in the same
// campaign run, and Meta doesn't charge for held-back messages.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

/** Held back for now, can be sent again later. */
export const HELD_CODES = [131049];
/** Campaigns skip the customer for a while after these. */
export const SKIP_CODES = [131049, 130472];
export const SKIP_DAYS = 3;
export const RETRY_AFTER_HOURS = 24;
/** Offers go stale (a Deepavali offer a fortnight later), so a retry is offered only this long. */
export const RETRY_UNTIL_DAYS = 7;

export const STOP_CONFIRM = "Stop this run? Queued messages won't be sent.";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Marks a retry row from creation until Meta returns the real message id; also stops two scheduler calls retrying the same message. */
const RETRY_MARK = "retry:";

export const isHeld = (code: number | null | undefined) => code != null && HELD_CODES.includes(code);

/** Of these customers, whose marketing Meta is holding back right now, and until when. */
export async function marketingPaused(customerIds: string[], now = new Date()) {
  const paused = new Map<string, Date>();
  if (!customerIds.length) return paused;
  const rows = await db.message.findMany({
    where: { customerId: { in: customerIds }, status: "FAILED", errorCode: { in: SKIP_CODES }, failedAt: { gt: new Date(now.getTime() - SKIP_DAYS * DAY) } },
    select: { customerId: true, failedAt: true },
    orderBy: { failedAt: "desc" },
  });
  for (const r of rows) if (!paused.has(r.customerId)) paused.set(r.customerId, new Date(r.failedAt!.getTime() + SKIP_DAYS * DAY));
  return paused;
}

type Candidate = { id: string; runId: string; customerId: string; campaignId: string };

/**
 * Held-back campaign messages ready for their one retry: the first message to that customer in that run, not
 * retried yet, held at least RETRY_AFTER_HOURS and not gone stale. A stopped run's count too: the retry is the
 * business's own choice. Inactive customers are left alone.
 */
async function candidates(now: Date, campaignId: string) {
  const readyBy = new Date(now.getTime() - RETRY_AFTER_HOURS * HOUR);
  const staleBy = new Date(now.getTime() - RETRY_UNTIL_DAYS * DAY);
  return db.$queryRaw<Candidate[]>`
    SELECT m.id, m."runId", m."customerId", r."campaignId"
    FROM "Message" m
    JOIN "CampaignRun" r ON r.id = m."runId"
    JOIN "Customer" c ON c.id = m."customerId"
    WHERE m.status = 'FAILED' AND m."errorCode" IN (${Prisma.join(HELD_CODES)})
      AND m."failedAt" <= ${readyBy} AND m."failedAt" > ${staleBy}
      AND c."optedOut" = false AND c.unreachable = false AND NOT (${INACTIVE_TAG} = ANY(c.tags))
      AND r."campaignId" = ${campaignId}
      AND NOT EXISTS (SELECT 1 FROM "Message" o WHERE o."runId" = m."runId" AND o."customerId" = m."customerId" AND o.id <> m.id)
    ORDER BY m."failedAt" ASC
    LIMIT 200`;
}

export type RetryResult = { retried: number; failed: number; waiting: string[] };

/**
 * Sends this campaign's ready held-back messages once more (the business asked, from the campaign page), with the
 * same rules as a normal batch: approved template, connected number, quiet hours, quality, the 24-hour limit and
 * the gap between offers. Anything blocked right now stays ready for another try.
 */
export async function retryHeldBack({ now = new Date(), deadline = Date.now() + 40_000, campaignId }: { now?: Date; deadline?: number; campaignId: string }): Promise<RetryResult> {
  const result: RetryResult = { retried: 0, failed: 0, waiting: [] };
  const ready = await candidates(now, campaignId);
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
    // Thabaal-wallet clients with no balance left: retries wait for a recharge.
    if ((await affordableMessages(campaign.clientId, t.category)) <= 0) continue;
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
        // Too fast, Meta briefly down, or a token/account problem: give the slot back and try on a later call.
        if (kind === "rate" || kind === "temporary" || (kind && PAUSING_KINDS.includes(kind))) {
          await db.message.delete({ where: { id: row.id } });
          result.waiting.push(kind === "rate" ? "Meta asked to slow down" : kind === "temporary" ? "Meta is briefly unavailable" : (metaError(code)?.title ?? "there's an account problem"));
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

/**
 * ready: can be sent again now. waiting: not yet (readyAt is the first one's time). retriedOk / heldTwice: the retry
 * went through / was held again. expired: too old to retry, or a retry that didn't finish. inactive: moved to
 * Inactive before a retry.
 */
export type HeldSummary = { ready: number; waiting: number; readyAt: Date | null; retriedOk: number; heldTwice: number; expired: number; inactive: number };

/** Where each held-back message of these runs stands. */
export async function heldSummary(runIds: string[], now = new Date()): Promise<HeldSummary> {
  const summary: HeldSummary = { ready: 0, waiting: 0, readyAt: null, retriedOk: 0, heldTwice: 0, expired: 0, inactive: 0 };
  if (!runIds.length) return summary;
  const rows = await db.$queryRaw<{ failedAt: Date; retryStatus: string | null; inactive: boolean }[]>`
    SELECT m."failedAt", rt.status::text AS "retryStatus", (${INACTIVE_TAG} = ANY(c.tags)) AS inactive
    FROM "Message" m
    JOIN "Customer" c ON c.id = m."customerId"
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
    else if (r.inactive) summary.inactive++;
    else if (r.failedAt.getTime() <= now.getTime() - RETRY_UNTIL_DAYS * DAY) summary.expired++;
    else {
      const at = new Date(r.failedAt.getTime() + RETRY_AFTER_HOURS * HOUR);
      if (at <= now) summary.ready++;
      else {
        summary.waiting++;
        if (!summary.readyAt || at < summary.readyAt) summary.readyAt = at;
      }
    }
  }
  return summary;
}
