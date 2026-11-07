import "server-only";
import { estimateTier, numberHealth, tierLimit } from "./limits";

export type LimitSummary = {
  limit: number | null;
  left: number | null;
  known: boolean;
  checkedAt: string | null;
  /** When Meta last answered, in India time: the time today, or date and time before today. */
  checkedLabel: string | null;
  /** Meta hasn't answered for over an hour (the token or number may need a look). */
  stale: boolean;
  /** People reached in the last 24 hours (what the limit counts). */
  used: number;
  /** Different people a message was delivered to in the last 7 days, and what the next limit needs. */
  week: number;
  next: { limit: number | null; need: number; have: number; days: number } | null;
} | null;

/**
 * Today's Meta limit for one business, for the Campaigns page. Meta sets it per business portfolio, so the default
 * number's figures stand for all its numbers. Asks Meta again when the stored value is over 10 minutes old.
 */
export async function limitSummary(clientId: string | null | undefined): Promise<LimitSummary> {
  if (!clientId) return null;
  const health = await numberHealth(clientId);
  const est = await estimateTier(clientId);
  const n = health.find((h) => h.isDefault) ?? health[0];
  if (!n) return null;
  const at = n.statusCheckedAt;
  const ist = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...o });
  const today = at && ist(at, { dateStyle: "short" }) === ist(new Date(), { dateStyle: "short" });
  return {
    limit: n.limit,
    left: n.left,
    known: n.tierKnown,
    checkedAt: at?.toISOString() ?? null,
    checkedLabel: at ? ist(at, today ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null,
    stale: !at || Date.now() - at.getTime() > 60 * 60_000,
    used: n.used,
    week: est?.week ?? 0,
    next: est?.next ? { limit: tierLimit(est.next.tier), need: est.next.need, have: est.next.have, days: est.next.days } : null,
  };
}
