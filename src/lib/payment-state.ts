// Where an order's money stands, worked out from its fields. Pure, so pages, actions and reports
// all agree on what "paid", "COD to collect", "claimed" or "refund due" mean.

export const PAYMENT_METHODS = [
  { value: "upi_whatsapp", label: "UPI on WhatsApp", short: "UPI" },
  { value: "upi", label: "UPI (GPay / PhonePe / shop QR)", short: "UPI" },
  { value: "cod", label: "Cash on delivery", short: "COD" },
  { value: "cash", label: "Cash (at the shop)", short: "Cash" },
  { value: "bank", label: "Bank transfer", short: "Bank" },
  { value: "card", label: "Card", short: "Card" },
  { value: "other", label: "Other", short: "Other" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const isPaymentMethod = (v: unknown): v is PaymentMethod => PAYMENT_METHODS.some((m) => m.value === v);
export const methodLabel = (m: string | null | undefined, short = false) => {
  const hit = PAYMENT_METHODS.find((x) => x.value === m);
  return hit ? (short ? hit.short : hit.label) : "Not decided";
};

export const SOURCE_LABEL: Record<string, string> = {
  meta: "confirmed by WhatsApp",
  utr: "UPI reference from the customer",
  screenshot: "payment screenshot",
  staff: "recorded by staff",
  verified: "checked by staff",
};

/** Orders without a recorded method: a team note saying "COD" or "cash on delivery" means cash on delivery. */
export const COD_NOTE_RE = /\b(cod|cash\s+on\s+delivery)\b/i;

export type PayFields = {
  status: string;
  total: number;
  paidAt: Date | null;
  paymentMethod?: string | null;
  paidAmount?: number | null;
  paymentRequestedAt?: Date | null;
  paymentClaimedAt?: Date | null;
  paymentFailedAt?: Date | null;
  refundedAt?: Date | null;
  refundAmount?: number | null;
  internalNote?: string | null;
};

export type PayState =
  | "paid"
  | "part_paid"
  | "cod_due"
  | "claimed"
  | "failed"
  | "requested"
  | "unpaid"
  | "refund_due"
  | "refunded"
  | "none";

/** The order's payment method, reading old free-text notes ("COD") when none was recorded. */
export function methodOf(o: PayFields): string | null {
  if (o.paymentMethod) return o.paymentMethod;
  if (COD_NOTE_RE.test(o.internalNote ?? "")) return "cod";
  return null;
}

/** Money received so far (part payments count). */
export const receivedOf = (o: PayFields) => (o.paidAt ? (o.paidAmount ?? o.total) : (o.paidAmount ?? 0));
/** What is still owed by the customer. */
export const dueOf = (o: PayFields) => (o.status === "CANCELLED" ? 0 : Math.max(0, Math.round((o.total - receivedOf(o)) * 100) / 100));

export function paymentState(o: PayFields): PayState {
  const paid = Boolean(o.paidAt) || o.status === "PAID";
  if (o.status === "CANCELLED") {
    if (o.refundedAt) return "refunded";
    return paid || (o.paidAmount ?? 0) > 0 ? "refund_due" : "none";
  }
  if (paid) return (o.paidAmount ?? o.total) + 0.5 < o.total ? "part_paid" : "paid";
  if ((o.paidAmount ?? 0) > 0) return "part_paid";
  if (o.paymentClaimedAt) return "claimed";
  if (methodOf(o) === "cod") return "cod_due";
  if (o.paymentFailedAt && (!o.paymentRequestedAt || o.paymentFailedAt >= o.paymentRequestedAt)) return "failed";
  if (o.paymentRequestedAt) return "requested";
  return "unpaid";
}

export const STATE_LABEL: Record<PayState, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  cod_due: "Cash on delivery",
  claimed: "Customer says paid · verify",
  failed: "Payment failed",
  requested: "Pay link sent",
  unpaid: "Not paid",
  refund_due: "Refund due",
  refunded: "Refunded",
  none: "No payment",
};

export const STATE_TONE: Record<PayState, "green" | "amber" | "red" | "blue" | "gray" | "violet"> = {
  paid: "green",
  part_paid: "amber",
  cod_due: "violet",
  claimed: "amber",
  failed: "red",
  requested: "blue",
  unpaid: "gray",
  refund_due: "red",
  refunded: "gray",
  none: "gray",
};

/** An order that shouldn't leave the shop yet: not (fully) paid, and not cash on delivery. */
export const holdBeforeDispatch = (o: PayFields) =>
  ["unpaid", "requested", "failed", "claimed"].includes(paymentState(o)) || (paymentState(o) === "part_paid" && methodOf(o) !== "cod" && dueOf(o) > 0);

/** For packing slips and exports: what the delivery person must do about money, and how much to collect. */
export function slipPay(o: PayFields, shownTotal = o.total): { label: string; collect: number } {
  const state = paymentState(o);
  const due = Math.max(0, Math.round((shownTotal - receivedOf(o)) * 100) / 100);
  if (state === "paid") return { label: "PAID", collect: 0 };
  if (state === "cod_due") return { label: "COD · COLLECT CASH", collect: due };
  if (state === "part_paid") return { label: "PART PAID · COLLECT", collect: due };
  if (state === "claimed") return { label: "CHECK PAYMENT", collect: due };
  if (state === "refund_due" || state === "refunded" || state === "none") return { label: "CANCELLED", collect: 0 };
  return { label: "NOT PAID", collect: due };
}

/**
 * A payment staff may take back (recorded by mistake). Not one WhatsApp confirmed: older orders without a
 * recorded source count as WhatsApp-confirmed when they carry a transaction id that isn't a customer's UTR.
 */
export function canUndoPayment(o: PayFields & { paymentSource?: string | null; paymentTxnId?: string | null }) {
  if (receivedOf(o) <= 0) return false;
  if (o.paymentSource) return o.paymentSource !== "meta";
  return !o.paymentTxnId || o.paymentTxnId.startsWith("UTR-");
}
