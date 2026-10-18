import { methodOf } from "./payment-state";

/**
 * Order steps. Every order goes: Order received › Payment processing › Payment verification › Order confirmed
 * › Dispatched › Delivered. An order is confirmed only once its payment is verified (Meta's payment update, or
 * staff checking a UTR or screenshot and recording the money). Cash on delivery skips the two payment steps: it is
 * confirmed when the customer (or staff) confirms COD, and the cash is recorded at delivery. Packing is a tick
 * inside "Order confirmed" (Order.packedAt), not a step of its own.
 *
 * The step is worked out from the order's status and payment fields, so every existing order falls into the right
 * step with no data change. The shop's choice in Settings › Order steps only names the steps and leaves out the
 * ones it doesn't use (no dispatch for pickup or services).
 */

export type StageKey = "RECEIVED" | "PAYMENT" | "VERIFY" | "CONFIRMED" | "DISPATCHED" | "DELIVERED";
export type FlowStep = { key: StageKey; label: string; ta: string };
export type OrderFlowKey = "pickup" | "deliver" | "courier" | "service";

const PAY_STEPS: FlowStep[] = [
  { key: "RECEIVED", label: "Order received", ta: "ஆர்டர் வந்தது" },
  { key: "PAYMENT", label: "Payment processing", ta: "பணம் செலுத்துதல்" },
  { key: "VERIFY", label: "Payment verification", ta: "பணம் சரிபார்ப்பு" },
];

export const ORDER_FLOWS: Record<OrderFlowKey, { label: string; hint: string; pack: boolean; steps: FlowStep[] }> = {
  pickup: {
    label: "Counter or pickup",
    hint: "The customer pays and takes it at the shop.",
    pack: false,
    steps: [...PAY_STEPS, { key: "CONFIRMED", label: "Ready for pickup", ta: "எடுக்கத் தயார்" }, { key: "DELIVERED", label: "Collected", ta: "பெற்றுக்கொண்டார்" }],
  },
  deliver: {
    label: "I deliver myself",
    hint: "You pack and your own person drops it.",
    pack: true,
    steps: [
      ...PAY_STEPS,
      { key: "CONFIRMED", label: "Order confirmed", ta: "ஆர்டர் உறுதியானது" },
      { key: "DISPATCHED", label: "Dispatched", ta: "அனுப்பப்பட்டது" },
      { key: "DELIVERED", label: "Delivered", ta: "டெலிவரி ஆனது" },
    ],
  },
  courier: {
    label: "I send by courier",
    hint: "You pack and hand it to a courier with a tracking number.",
    pack: true,
    steps: [
      ...PAY_STEPS,
      { key: "CONFIRMED", label: "Order confirmed", ta: "ஆர்டர் உறுதியானது" },
      { key: "DISPATCHED", label: "Shipped", ta: "கொரியரில் அனுப்பப்பட்டது" },
      { key: "DELIVERED", label: "Delivered", ta: "டெலிவரி ஆனது" },
    ],
  },
  service: {
    label: "Service or booking",
    hint: "Salon, repairs, tailoring. Nothing to pack or send.",
    pack: false,
    steps: [...PAY_STEPS, { key: "CONFIRMED", label: "Booking confirmed", ta: "முன்பதிவு உறுதியானது" }, { key: "DELIVERED", label: "Done", ta: "முடிந்தது" }],
  },
};

export const FLOW_KEYS = Object.keys(ORDER_FLOWS) as OrderFlowKey[];
/** Clients that never chose get the full delivery flow. */
export const DEFAULT_FLOW: OrderFlowKey = "deliver";

export function readFlow(v: string | null | undefined): OrderFlowKey {
  return v && v in ORDER_FLOWS ? (v as OrderFlowKey) : DEFAULT_FLOW;
}

export const flowSteps = (flow: OrderFlowKey) => ORDER_FLOWS[flow].steps;
export const flowHas = (flow: OrderFlowKey, key: StageKey) => ORDER_FLOWS[flow].steps.some((s) => s.key === key);
/** Deliver and courier shops tick "Packed" inside Order confirmed. */
export const flowPacks = (flow: OrderFlowKey) => ORDER_FLOWS[flow].pack;
export const stepLabel = (flow: OrderFlowKey, key: StageKey) => ORDER_FLOWS[flow].steps.find((s) => s.key === key)?.label ?? null;
export const stepLabelTa = (flow: OrderFlowKey, key: StageKey) => ORDER_FLOWS[flow].steps.find((s) => s.key === key)?.ta ?? null;

export const RANK: Record<StageKey, number> = { RECEIVED: 0, PAYMENT: 1, VERIFY: 2, CONFIRMED: 3, DISPATCHED: 4, DELIVERED: 5 };

/** What the step needs from an order (a subset of the Order row). */
export type StageFields = {
  status: string;
  paidAt?: Date | string | null;
  paidAmount?: number | null;
  paymentMethod?: string | null;
  internalNote?: string | null;
  paymentRequestedAt?: Date | string | null;
  paymentClaimedAt?: Date | string | null;
};

/** Paid in full (WhatsApp payment, or money staff recorded or verified). */
export const isPaidOrder = (o: StageFields) => Boolean(o.paidAt) || o.status === "PAID";
/** Cash on delivery (chosen on the order, or an older order whose note says COD), not yet paid. */
export const isCodOrder = (o: StageFields) => !isPaidOrder(o) && methodOf({ status: o.status, total: 0, paidAt: null, paymentMethod: o.paymentMethod, internalNote: o.internalNote }) === "cod";

/** The order's step, or "CANCELLED". */
export function orderStage(o: StageFields): StageKey | "CANCELLED" {
  if (o.status === "CANCELLED") return "CANCELLED";
  if (o.status === "DELIVERED") return "DELIVERED";
  if (o.status === "DISPATCHED") return "DISPATCHED";
  if (isPaidOrder(o)) return "CONFIRMED";
  // Cash on delivery: no payment steps; confirmed once the customer or staff confirms it.
  if (isCodOrder(o)) return o.status === "CONFIRMED" ? "CONFIRMED" : "RECEIVED";
  if (o.paymentClaimedAt) return "VERIFY";
  if (o.paymentRequestedAt || (o.paidAmount ?? 0) > 0) return "PAYMENT";
  return "RECEIVED";
}

/** 0 (received) … 5 (delivered); -1 for cancelled. */
export function stageRank(o: StageFields): number {
  const s = orderStage(o);
  return s === "CANCELLED" ? -1 : RANK[s];
}

/** The order may be packed, dispatched or finished: payment verified, or cash on delivery confirmed. */
export const isConfirmedOrLater = (o: StageFields) => stageRank(o) >= RANK.CONFIRMED;

/** Index of the last step in this flow the order has reached (steps the flow skips count as done). */
export function reachedIndex(flow: OrderFlowKey, rank: number): number {
  const steps = ORDER_FLOWS[flow].steps;
  let at = -1;
  steps.forEach((s, i) => {
    if (RANK[s.key] <= rank) at = i;
  });
  return at;
}

/** Why an order can't move to `to` yet, or null when it can. Shared by every server action that moves orders. */
export function stepBlocked(o: StageFields, to: "CONFIRMED" | "PACKED" | "DISPATCHED" | "DELIVERED"): string | null {
  if (o.status === "CANCELLED") return "This order is cancelled.";
  if (isConfirmedOrLater(o)) return null;
  if (to === "CONFIRMED")
    return isCodOrder(o)
      ? null
      : "An order is confirmed once its payment is verified. Send the payment link, or record the payment when the money is in.";
  const what = to === "PACKED" ? "packed" : to === "DISPATCHED" ? "dispatched" : "finished";
  return isCodOrder(o)
    ? `Confirm this cash on delivery order before it is ${what}.`
    : `This order isn't paid yet, so it can't be ${what}. Record the payment once it is verified, or set it as cash on delivery.`;
}
