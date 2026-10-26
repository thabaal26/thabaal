// What the account page shows about plan periods and payments. Built on the server (page.tsx) from PlanPurchase
// rows: every date and label here comes from stored timestamps, never from the browser.

import type { BillingCycle, PlanKey } from "@/lib/account-plans";
import type { PurchasePhase } from "@/lib/subscription-core";

export type PeriodView = {
  id: string;
  plan: PlanKey;
  cycle: BillingCycle;
  amount: number;
  startsLabel: string;
  endsLabel: string;
};

export type HistoryRow = {
  id: string;
  plan: PlanKey;
  cycle: BillingCycle;
  amount: number;
  phase: PurchasePhase;
  method: string;
  submittedLabel: string;
  utr: string | null;
  payApp: string | null;
  paidOn: string | null;
  startsLabel: string | null;
  endsLabel: string | null;
  billNo: string | null;
  billDateLabel: string | null;
  note: string | null;
};

export type BillingView = {
  status: "active" | "expired" | "none";
  active: (PeriodView & { leftLabel: string; leftDays: number }) | null;
  scheduled: PeriodView | null;
  pending: { id: string; plan: PlanKey; cycle: BillingCycle; amount: number; utr: string | null; payApp: string | null; paidOn: string | null; submittedLabel: string } | null;
  lastEnded: PeriodView | null;
  /** Why another payment can't be started now (one at a time). */
  block: { code: "pending" | "scheduled"; message: string } | null;
  /** When a payment verified now would start, if that is fixed (the end of the running period); null = when verified. */
  nextStartLabel: string | null;
  /** The matching end date for each cycle when the start is fixed. */
  nextEndLabels: Record<BillingCycle, string> | null;
  history: HistoryRow[];
  canPay: boolean;
  todayLabel: string;
};

export type AdminPendingRow = {
  id: string;
  clientId: string;
  clientName: string;
  plan: PlanKey;
  cycle: BillingCycle;
  amount: number;
  utr: string | null;
  payApp: string | null;
  paidOn: string | null;
  submittedBy: string | null;
  submittedLabel: string;
  /** False for a business with no verified period on record: verifying then needs a decision. */
  hasHistory: boolean;
  /** Where the period would sit if verified now. */
  startsLabel: string;
  endsLabel: string;
};
