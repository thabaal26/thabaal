import "server-only";
import type { WhatsAppNumber } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "./db";

// Meta caps how many different people a business can start conversations with in any
// rolling 24 hours, and lowers that cap when quality drops. Limits now apply to the whole
// business portfolio, so usage is counted across all of a client's numbers.

const TIERS: Record<string, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: null,
};

export const DAY_MS = 86_400_000;

/** People per 24 hours Meta allows at this tier; null is unlimited. Unknown tiers assume the new-number 250. */
export function tierLimit(tier: string | null | undefined): number | null {
  return tier && tier in TIERS ? TIERS[tier] : 250;
}

export function tierLabel(tier: string | null | undefined) {
  const n = tierLimit(tier);
  return n === null ? "Unlimited" : n >= 1000 ? `${n / 1000}K` : String(n);
}

type LimitFields = Pick<WhatsAppNumber, "id" | "clientId" | "messagingTier" | "dailyCap" | "qualityRating">;

// Like Meta, a message to someone who wrote to the business in the 24 hours before it doesn't count (that's an open
// customer service window, not business-initiated).
const NOT_IN_SERVICE_WINDOW = Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "Reply" r
        WHERE r."customerId" = m."customerId" AND r."receivedAt" <= m."sentAt" AND r."receivedAt" > m."sentAt" - interval '24 hours'
      )`;

type Usage = { day: number; week: number; month: number; perNumber: Map<string, number> };

/**
 * Different customers this business started a conversation with through its numbers (what Meta's limit counts), in
 * one query: in the last 24 hours (sent, delivered or read; all numbers and each number), and delivered or read in
 * the last 7 and 30 days (what the next tier needs).
 */
async function usage(clientId: string): Promise<Usage> {
  const now = Date.now();
  const day = new Date(now - DAY_MS), week = new Date(now - 7 * DAY_MS), month = new Date(now - 30 * DAY_MS);
  const rows = await db.$queryRaw<{ g: number; sender: string | null; day: number; week: number; month: number }[]>`
    SELECT GROUPING(m."senderId")::int AS g, m."senderId" AS sender,
      (count(DISTINCT m."customerId") FILTER (WHERE m."sentAt" >= ${day}))::int AS day,
      (count(DISTINCT m."customerId") FILTER (WHERE m."sentAt" >= ${week} AND m.status IN ('DELIVERED', 'READ')))::int AS week,
      (count(DISTINCT m."customerId") FILTER (WHERE m.status IN ('DELIVERED', 'READ')))::int AS month
    FROM "Message" m
    WHERE m."senderId" IN (SELECT w.id FROM "WhatsAppNumber" w WHERE w."clientId" = ${clientId})
      AND m."sentAt" >= ${month} AND m.status IN ('SENT', 'DELIVERED', 'READ')
      AND ${NOT_IN_SERVICE_WINDOW}
    GROUP BY GROUPING SETS ((), (m."senderId"))`;
  const all = rows.find((r) => r.g === 1);
  return {
    day: all?.day ?? 0,
    week: all?.week ?? 0,
    month: all?.month ?? 0,
    perNumber: new Map(rows.filter((r) => r.g === 0 && r.sender).map((r) => [r.sender as string, r.day])),
  };
}

const LADDER = ["TIER_250", "TIER_2K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"];

type TierFields = Pick<WhatsAppNumber, "messagingTier" | "qualityRating">;

/** estimateTier's rule on numbers and counts already read; saves a raise like estimateTier. */
async function estimateFrom(clientId: string, numbers: TierFields[], { week, month }: Pick<Usage, "week" | "month">) {
  if (!numbers.length) return null;
  const known = numbers.map((n) => LADDER.indexOf(n.messagingTier ?? "")).filter((i) => i >= 0);
  const start = known.length ? Math.max(...known) : 0;
  const lowQuality = numbers.some((n) => n.qualityRating === "RED" || n.qualityRating === "YELLOW");
  let step = start;
  if (step === 0 && month >= 2_000) step = 1;
  else if (step >= 1 && step < LADDER.length - 1 && !lowQuality) {
    const limit = tierLimit(LADDER[step]) ?? Infinity;
    if (week >= limit / 2) step += 1;
  }
  const tier = LADDER[step];
  if (step > start) await db.whatsAppNumber.updateMany({ where: { clientId }, data: { messagingTier: tier } });
  const limit = tierLimit(tier);
  const next = step < LADDER.length - 1 ? (step === 0 ? { tier: LADDER[1], need: 2_000, have: month, days: 30 } : { tier: LADDER[step + 1], need: Math.ceil((limit ?? 0) / 2), have: week, days: 7 }) : null;
  return { tier, week, month, next, raised: step > start };
}

/**
 * Works out the business's Meta limit from its own sends, the way Meta raises it (developers.facebook.com, Messaging
 * limits): from 250 to 2,000 after 2,000 different people got a message in 30 days; above that, one step up once half
 * of the current limit was reached in the last 7 days with no low quality. It starts at 250 for a number new to the
 * Cloud API, or at what was said or Meta answered, and only goes up: a lower limit comes only from Meta itself.
 * Counts are our own messages delivered (or read); Meta's own count can be a little different.
 */
export async function estimateTier(clientId: string) {
  const [numbers, counts] = await Promise.all([
    db.whatsAppNumber.findMany({ where: { clientId }, select: { id: true, messagingTier: true, qualityRating: true } }),
    usage(clientId),
  ]);
  return estimateFrom(clientId, numbers, counts);
}

/**
 * How many more new people this number may message right now, and when the window frees up
 * if none. Meta's tier is shared by the client's numbers; a warm-up cap is per number.
 */
export async function allowance(n: LimitFields) {
  // People reached in the last 24 hours by all the client's numbers and by this one, in one query.
  const [row] = await db.$queryRaw<{ client: number; number: number }[]>`
    SELECT (count(DISTINCT m."customerId"))::int AS client,
      (count(DISTINCT m."customerId") FILTER (WHERE m."senderId" = ${n.id}))::int AS number
    FROM "Message" m
    WHERE m."senderId" IN (SELECT w.id FROM "WhatsAppNumber" w WHERE w."clientId" = ${n.clientId})
      AND m."sentAt" >= ${new Date(Date.now() - DAY_MS)} AND m.status IN ('SENT', 'DELIVERED', 'READ')
      AND ${NOT_IN_SERVICE_WINDOW}`;
  const clientUsed = row?.client ?? 0;
  const numberUsed = n.dailyCap != null ? (row?.number ?? 0) : 0;
  // Meta's limit is shown, never enforced here: Meta itself holds back what goes over it. Only a warm-up cap the admin
  // set on a number stops sends.
  const left = n.dailyCap != null ? n.dailyCap - numberUsed : Infinity;
  return { left: Math.max(0, left), clientUsed, numberUsed, unlimited: left === Infinity };
}

/** When the oldest send in the window turns 24 hours old, so a full number can resume. */
export async function windowFreesAt(numberIds: string[]) {
  const oldest = await db.message.findFirst({
    where: { senderId: { in: numberIds }, sentAt: { gte: new Date(Date.now() - DAY_MS) }, status: { in: ["SENT", "DELIVERED", "READ"] } },
    orderBy: { sentAt: "asc" },
    select: { sentAt: true },
  });
  return oldest?.sentAt ? new Date(oldest.sentAt.getTime() + DAY_MS + 60_000) : new Date(Date.now() + 30 * 60_000);
}

/**
 * The business portfolio's limit from Meta's answer. Meta now sets limits per portfolio and reports them in
 * `whatsapp_business_manager_messaging_limit` (`messaging_limit_tier` is deprecated), e.g. "TIER_250".
 * https://developers.facebook.com/docs/whatsapp/messaging-limits
 */
export function tierFromMeta(j: { whatsapp_business_manager_messaging_limit?: unknown; messaging_limit_tier?: unknown }): string | null {
  const lim = j.whatsapp_business_manager_messaging_limit;
  const fromNew = typeof lim === "string" ? lim : lim && typeof lim === "object" ? ((lim as Record<string, unknown>).tier ?? (lim as Record<string, unknown>).current_limit) : null;
  const tier = typeof fromNew === "string" ? fromNew : typeof j.messaging_limit_tier === "string" ? j.messaging_limit_tier : null;
  return tier?.toUpperCase() ?? null;
}

/** Pulls quality and limit tier from Meta. Failures leave the stored values alone. */
export async function refreshNumberStatus(n: Pick<WhatsAppNumber, "id" | "phoneNumberId" | "token">, clientToken: string | null) {
  return (await checkNumberStatus(n, clientToken)).row;
}

// When Meta last refused a number, per server instance: a page that polls doesn't ask Meta again for 10 minutes.
const lastRefused = new Map<string, number>();

/** Same as refreshNumberStatus, and says why Meta refused (for the admin's Refresh button). */
export async function checkNumberStatus(n: Pick<WhatsAppNumber, "id" | "phoneNumberId" | "token">, clientToken: string | null) {
  const token = n.token ?? clientToken;
  if (!token) return { row: null, error: "No access token saved for this number." };
  const get = (fields: string) =>
    fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/${n.phoneNumberId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    })
      .then((r) => r.json())
      .catch(() => null);
  const base = "quality_rating,display_phone_number,verified_name";
  // One field per try: asking for a field Meta has removed fails the whole request. The portfolio limit first, then
  // the deprecated per-number one, then quality alone.
  let j = await get(`${base},whatsapp_business_manager_messaging_limit`);
  if (!j || j.error) j = await get(`${base},messaging_limit_tier`);
  if (!j || j.error) j = await get(base);
  if (!j || j.error) {
    lastRefused.set(n.id, Date.now());
    const why = j?.error ? `Meta: ${String(j.error.message ?? "refused").slice(0, 160)}${j.error.code ? ` (code ${j.error.code})` : ""}` : "Meta didn't answer.";
    console.warn(`[limits] couldn't refresh number ${n.id}: ${why}`);
    return { row: null, error: why };
  }
  lastRefused.delete(n.id);
  const row = await db.whatsAppNumber.update({
    where: { id: n.id },
    data: {
      qualityRating: j.quality_rating ?? null,
      // Meta didn't say: keep what we know, or the limit would fall back to 250.
      messagingTier: tierFromMeta(j) ?? undefined,
      ...(j.display_phone_number && { displayPhone: j.display_phone_number }),
      ...(j.verified_name && { verifiedName: j.verified_name }),
      statusCheckedAt: new Date(),
    },
  });
  return { row, error: null };
}

/** How old a number's limit may be before a campaign form, the Home card or a send asks Meta again. */
export const LIMIT_FRESH_MS = 10 * 60_000;

/** Numbers whose limit was checked longer ago than maxAgeMs and that Meta didn't just refuse (as freshenNumbers picks). */
const dueForRefresh = <T extends Pick<WhatsAppNumber, "id" | "statusCheckedAt">>(rows: T[], maxAgeMs: number) =>
  rows.filter((n) => (!n.statusCheckedAt || n.statusCheckedAt.getTime() < Date.now() - maxAgeMs) && Date.now() - (lastRefused.get(n.id) ?? 0) > maxAgeMs);

/**
 * Asks Meta again for numbers whose limit was checked longer ago than maxAgeMs, so a raised limit (250, 2K, 10K, 100K,
 * unlimited) shows and is used within minutes. Never throws; on a failure the stored values stay.
 */
export async function freshenNumbers(where: { clientId: string } | { ids: string[] }, maxAgeMs = LIMIT_FRESH_MS) {
  const old = await db.whatsAppNumber.findMany({
    where: {
      ...("clientId" in where ? { clientId: where.clientId } : { id: { in: where.ids } }),
      OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: new Date(Date.now() - maxAgeMs) } }],
    },
    include: { client: { select: { waToken: true } } },
  });
  const due = old.filter((n) => Date.now() - (lastRefused.get(n.id) ?? 0) > maxAgeMs);
  await Promise.all(due.map((n) => refreshNumberStatus(n, n.client.waToken).catch(() => null)));
  return due.length;
}

/** Refreshes numbers not checked in the last few hours; called by the scheduler. */
export async function refreshStaleNumbers(maxAgeMs = 3 * 60 * 60_000) {
  const stale = await db.whatsAppNumber.findMany({
    where: { OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: new Date(Date.now() - maxAgeMs) } }] },
    include: { client: { select: { waToken: true } } },
    take: 20,
  });
  // All at once (each is one request to Meta); one number's failure doesn't stop the others.
  await Promise.all(stale.map((n) => refreshNumberStatus(n, n.client.waToken).catch((e) => console.error("Could not refresh number status", n.id, e))));
  return stale.length;
}

/**
 * A client's numbers (limits asked again when old, as freshenNumbers does) and the people reached, read in one round;
 * then the limit estimated from them (estimateTier) and each number's figures.
 */
async function healthRound(clientId: string) {
  const [read, counts] = await Promise.all([
    db.whatsAppNumber.findMany({ where: { clientId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], include: { client: { select: { waToken: true } } } }),
    usage(clientId),
  ]);
  const due = dueForRefresh(read, LIMIT_FRESH_MS);
  const refreshed = await Promise.all(due.map((n) => refreshNumberStatus(n, n.client.waToken).catch(() => null)));
  const fresh = new Map(refreshed.flatMap((r) => (r ? [[r.id, r] as const] : [])));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the token stays out of the result
  const numbers = read.map(({ client, ...n }) => fresh.get(n.id) ?? n);
  const est = await estimateFrom(clientId, numbers, counts);
  if (est?.raised) for (const n of numbers) n.messagingTier = est.tier;
  const health = numbers.map((n) => {
    const meta = tierLimit(n.messagingTier);
    const used = n.dailyCap != null ? (counts.perNumber.get(n.id) ?? 0) : counts.day;
    const limit = n.dailyCap != null ? Math.min(n.dailyCap, meta ?? Infinity) : meta;
    // tierKnown: Meta told us the limit; otherwise the 250 above is only the safe assumption for sending.
    // Shown left is exact (limit minus people reached in 24 hours); sending keeps its small safety margin.
    return { ...n, used, limit, left: limit === null ? null : Math.max(0, limit - used), tier: tierLabel(n.messagingTier), tierKnown: Boolean(n.messagingTier && n.messagingTier.toUpperCase() in TIERS) };
  });
  return { numbers, counts, health };
}

/** Each of a client's numbers with quality, limits and today's usage, for display. */
export async function numberHealth(clientId: string) {
  return (await healthRound(clientId)).health;
}

/** numberHealth, then estimateTier once more on the same reads (what the Campaigns limit card shows). */
export async function numberHealthAndTier(clientId: string) {
  const { numbers, counts, health } = await healthRound(clientId);
  return { health, est: await estimateFrom(clientId, numbers, counts) };
}
