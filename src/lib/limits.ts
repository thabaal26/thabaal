import "server-only";
import type { WhatsAppNumber } from "@prisma/client";
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

/** Stays a little under Meta's limit so retries and replies never tip a number over it. */
function withMargin(limit: number) {
  return limit - Math.max(1, Math.ceil(limit * 0.04));
}

type LimitFields = Pick<WhatsAppNumber, "id" | "clientId" | "messagingTier" | "dailyCap" | "qualityRating">;

/** Different customers messaged in the last 24 hours, through the given numbers. */
async function contacted(where: { senderId: string } | { senderId: { in: string[] } }) {
  const rows = await db.message.groupBy({
    by: ["customerId"],
    where: { ...where, sentAt: { gte: new Date(Date.now() - DAY_MS) }, status: { in: ["SENT", "DELIVERED", "READ"] } },
  });
  return rows.length;
}

/**
 * How many more new people this number may message right now, and when the window frees up
 * if none. Meta's tier is shared by the client's numbers; a warm-up cap is per number.
 */
export async function allowance(n: LimitFields) {
  const siblings = await db.whatsAppNumber.findMany({ where: { clientId: n.clientId }, select: { id: true } });
  const [clientUsed, numberUsed] = await Promise.all([
    contacted({ senderId: { in: siblings.map((s) => s.id) } }),
    n.dailyCap != null ? contacted({ senderId: n.id }) : Promise.resolve(0),
  ]);
  const meta = tierLimit(n.messagingTier);
  const left = Math.min(
    meta === null ? Infinity : withMargin(meta) - clientUsed,
    n.dailyCap != null ? n.dailyCap - numberUsed : Infinity,
  );
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
  for (const n of stale) await refreshNumberStatus(n, n.client.waToken);
  return stale.length;
}

/** Each of a client's numbers with quality, limits and today's usage, for display. */
export async function numberHealth(clientId: string) {
  await freshenNumbers({ clientId });
  const numbers = await db.whatsAppNumber.findMany({ where: { clientId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return Promise.all(
    numbers.map(async (n) => {
      const a = await allowance(n);
      const meta = tierLimit(n.messagingTier);
      const used = n.dailyCap != null ? a.numberUsed : a.clientUsed;
      const limit = n.dailyCap != null ? Math.min(n.dailyCap, meta ?? Infinity) : meta;
      // tierKnown: Meta told us the limit; otherwise the 250 above is only the safe assumption for sending.
      // Shown left is exact (limit minus people reached in 24 hours); sending keeps its small safety margin.
      return { ...n, used, limit, left: a.unlimited || limit === null ? null : Math.max(0, limit - used), tier: tierLabel(n.messagingTier), tierKnown: Boolean(n.messagingTier && n.messagingTier.toUpperCase() in TIERS) };
    }),
  );
}
