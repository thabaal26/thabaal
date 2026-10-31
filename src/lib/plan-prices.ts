// Plan prices: the list in account-plans.ts is the starting point; Thabaal can change them from the admin panel
// (Setting.planPrices). Pure, so the server, the website, My account and the tests share one rule.
//
// A new price applies to new subscriptions only. A running Razorpay subscription keeps the amount it was made
// with (RazorpayRecord.amountPaise), and every paid period keeps the amount actually paid (PlanPurchase.amountPaise).

import { PLANS, type BillingCycle, type PlanDef, type PlanKey } from "./account-plans";

export type CyclePrices = { m: number; q: number; y: number };
export type PriceTable = Record<PlanKey, CyclePrices>;

const KEYS = PLANS.map((p) => p.k);
const CYCLE_KEYS: BillingCycle[] = ["m", "q", "y"];
export const MAX_PRICE = 500_000;

export const DEFAULT_PRICES: PriceTable = Object.fromEntries(PLANS.map((p) => [p.k, { ...p.p }])) as PriceTable;

const whole = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PRICE ? v : null);

/** Prices saved in the database, with anything missing or broken taken from the list in the code. */
export function readPrices(saved: unknown): PriceTable {
  const out = structuredClone(DEFAULT_PRICES);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;
  for (const k of KEYS) {
    const row = (saved as Record<string, unknown>)[k];
    if (!row || typeof row !== "object") continue;
    const next = { ...out[k] };
    for (const c of CYCLE_KEYS) next[c] = whole((row as Record<string, unknown>)[c]) ?? next[c];
    // A saved row that breaks the rules below (hand-edited database) falls back as a whole, never half.
    if (!rowProblem(next)) out[k] = next;
  }
  return out;
}

function rowProblem(p: CyclePrices): string | null {
  if (p.q <= p.m) return "the 3-month price must be more than the monthly price";
  if (p.y <= p.q) return "the 12-month price must be more than the 3-month price";
  if (p.q > p.m * 3) return "3 months can't cost more than 3 monthly payments";
  if (p.y > p.m * 12) return "12 months can't cost more than 12 monthly payments";
  return null;
}

/** Checks prices typed in the admin panel. Whole rupees, GST included. */
export function checkPrices(input: unknown): { ok: true; prices: PriceTable } | { ok: false; message: string } {
  if (!input || typeof input !== "object") return { ok: false, message: "Enter the prices." };
  const out = {} as PriceTable;
  for (const plan of PLANS) {
    const row = (input as Record<string, unknown>)[plan.k] as Record<string, unknown> | undefined;
    const p = {} as CyclePrices;
    for (const c of CYCLE_KEYS) {
      const raw = row?.[c];
      const v = whole(typeof raw === "string" && raw.trim() !== "" ? Number(raw.replace(/[,\s₹]/g, "")) : raw);
      if (v === null) return { ok: false, message: `${plan.n}: enter whole rupees from ₹1 to ₹${MAX_PRICE.toLocaleString("en-IN")}.` };
      p[c] = v;
    }
    const why = rowProblem(p);
    if (why) return { ok: false, message: `${plan.n}: ${why}.` };
    out[plan.k] = p;
  }
  return { ok: true, prices: out };
}

/** The plan list with these prices in place of the ones in the code. */
export function plansWith(prices: PriceTable): PlanDef[] {
  return PLANS.map((p) => ({ ...p, p: { ...prices[p.k] } }));
}

/** Whether these are the prices in the code (nothing changed from the admin panel). */
export const isDefault = (prices: PriceTable) => KEYS.every((k) => CYCLE_KEYS.every((c) => prices[k][c] === DEFAULT_PRICES[k][c]));

/** Percent saved against paying monthly for the same months, rounded (10 for 3,237 against 3 × 1,199). */
export function savePercent(p: CyclePrices, cycle: "q" | "y") {
  const months = cycle === "q" ? 3 : 12;
  return Math.max(0, Math.round((1 - p[cycle] / (p.m * months)) * 100));
}
