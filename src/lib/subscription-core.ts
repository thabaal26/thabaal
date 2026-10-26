// Pure rules for Thabaal plan periods: no database, so the account page, the server and the tests share them.
//
// How a plan becomes active: a period is only ever created by a verified payment (lib/subscription.ts), which
// fixes its startsAt and endsAt. "Active" is not stored: it is the verified period with startsAt <= now < endsAt,
// worked out on every read. A period paid early is verified with startsAt = the end of the client's last verified
// period, so it waits its turn; when that moment passes it becomes the active one with nothing to run, and an
// ended period stops counting by itself.

import { addMonths } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { PLANS, type BillingCycle, type PlanDef, type PlanKey } from "./account-plans";

export const CYCLES: readonly BillingCycle[] = ["m", "q", "y"];
export const CYCLE_MONTHS: Record<BillingCycle, number> = { m: 1, q: 3, y: 12 };

export type PurchaseStatus = "PENDING" | "VERIFIED" | "REJECTED" | "CANCELLED";

/** What a purchase means right now, for the screen. */
export type PurchasePhase = "awaiting_verification" | "scheduled" | "active" | "ended" | "rejected" | "cancelled";

export type PurchaseLike = {
  id: string;
  plan: string;
  cycle: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

export const isPlanKey = (v: unknown): v is PlanKey => typeof v === "string" && PLANS.some((p) => p.k === v);
export const isCycle = (v: unknown): v is BillingCycle => v === "m" || v === "q" || v === "y";
export const planDef = (k: string): PlanDef | undefined => PLANS.find((p) => p.k === k);
export const planIndex = (k: string | null | undefined) => PLANS.findIndex((p) => p.k === k);

/** The plan's price for the cycle, in paise. */
export function pricePaise(plan: PlanKey, cycle: BillingCycle): number {
  const def = planDef(plan);
  if (!def) throw new Error(`Unknown plan ${plan}`);
  return Math.round(def.p[cycle] * 100);
}

/**
 * When a period that starts at `start` ends: the same wall-clock time `CYCLE_MONTHS` calendar months later in the
 * app's time zone. A day that doesn't exist in the end month falls back to that month's last day
 * (31 Jan + 1 month = 28 Feb, or 29 Feb in a leap year; 29 Feb + 12 months = 28 Feb).
 */
export function periodEnd(start: Date, cycle: BillingCycle, tz: string): Date {
  const wall = toZonedTime(start, tz);
  return fromZonedTime(addMonths(wall, CYCLE_MONTHS[cycle]), tz);
}

/** Verified periods, oldest first. Rows without both dates are ignored (they can't be verified ones). */
function verifiedPeriods<T extends PurchaseLike>(rows: T[]) {
  return rows
    .filter((r) => r.status === "VERIFIED" && r.startsAt && r.endsAt)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime()) as (T & { startsAt: Date; endsAt: Date })[];
}

export function phaseOf(r: PurchaseLike, now: Date): PurchasePhase {
  if (r.status === "PENDING") return "awaiting_verification";
  if (r.status === "REJECTED") return "rejected";
  if (r.status === "CANCELLED") return "cancelled";
  if (!r.startsAt || !r.endsAt) return "awaiting_verification";
  if (now < r.startsAt) return "scheduled";
  if (now < r.endsAt) return "active";
  return "ended";
}

/** The end of the client's last verified period, if any. */
export function paidThrough(rows: PurchaseLike[]): Date | null {
  let end: Date | null = null;
  for (const r of verifiedPeriods(rows)) if (!end || r.endsAt > end) end = r.endsAt;
  return end;
}

/**
 * When a payment verified at `now` starts: right after the last verified period if that is still running or
 * scheduled, otherwise now. Never earlier than now, so an early payment can't shorten or overlap a paid term.
 */
export function nextStart(rows: PurchaseLike[], now: Date): Date {
  const end = paidThrough(rows);
  return end && end > now ? end : now;
}

export type SubscriptionSummary<T extends PurchaseLike> = {
  /** "active": a verified period covers now. "expired": the client has paid before but nothing covers now.
   *  "none": no verified period on record (a client set up before plans were tracked, or a new one). */
  status: "active" | "expired" | "none";
  active: (T & { startsAt: Date; endsAt: Date }) | null;
  /** The next verified period that hasn't started yet. */
  scheduled: (T & { startsAt: Date; endsAt: Date }) | null;
  /** A payment reference waiting to be checked. */
  pending: T | null;
  /** The most recent verified period that has ended. */
  lastEnded: (T & { startsAt: Date; endsAt: Date }) | null;
  paidThrough: Date | null;
};

export function summarize<T extends PurchaseLike>(rows: T[], now: Date): SubscriptionSummary<T> {
  const periods = verifiedPeriods(rows);
  const active = periods.find((r) => r.startsAt <= now && now < r.endsAt) ?? null;
  const scheduled = periods.find((r) => r.startsAt > now) ?? null;
  const ended = periods.filter((r) => r.endsAt <= now);
  const lastEnded = ended.length ? ended[ended.length - 1] : null;
  const pending = rows.filter((r) => r.status === "PENDING").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  return {
    status: active ? "active" : periods.length ? "expired" : "none",
    active,
    scheduled,
    pending,
    lastEnded,
    paidThrough: paidThrough(rows),
  };
}

/**
 * Why a client can't start another purchase right now, or null when they can. One payment at a time:
 * a reference still being checked, or a paid period still waiting to start, must settle first.
 */
export function purchaseBlock(rows: PurchaseLike[], now: Date): { code: "pending" | "scheduled"; message: string } | null {
  const s = summarize(rows, now);
  if (s.pending)
    return {
      code: "pending",
      message: "We are still checking your last payment. You can pay for another period once it is verified or turned down.",
    };
  if (s.scheduled)
    return {
      code: "scheduled",
      message: "Your next period is already paid and waiting to start. You can pay for the one after it once it begins.",
    };
  return null;
}

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Time left until `end`, from the stored timestamp: whole days and the hours after them. */
export function timeLeft(end: Date, now: Date): { ms: number; days: number; hours: number } {
  const ms = Math.max(0, end.getTime() - now.getTime());
  return { ms, days: Math.floor(ms / DAY_MS), hours: Math.floor((ms % DAY_MS) / HOUR_MS) };
}

export function timeLeftLabel(end: Date, now: Date): string {
  const { ms, days, hours } = timeLeft(end, now);
  if (ms <= 0) return "Ended";
  if (days === 0) return hours <= 1 ? "Less than 2 hours left" : `${hours} hours left`;
  return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} hour${hours === 1 ? "" : "s"}` : ""} left`;
}
