/**
 * Order steps: the stages a client's orders pass through, picked once in Settings → Order steps.
 * Every flow uses the same order statuses underneath (plus Order.packedAt for "Packed"), so changing the
 * choice never touches existing orders. A step a flow leaves out is treated as done once a later one is.
 */

export type StageKey = "NEW" | "CONFIRMED" | "PAID" | "PACKED" | "DISPATCHED" | "DELIVERED";
export type FlowStep = { key: StageKey; label: string };
export type OrderFlowKey = "pickup" | "deliver" | "courier" | "service";

export const ORDER_FLOWS: Record<OrderFlowKey, { label: string; hint: string; steps: FlowStep[] }> = {
  pickup: {
    label: "Counter or pickup",
    hint: "The customer takes it at the shop. Two taps and done.",
    steps: [
      { key: "NEW", label: "New" },
      { key: "PAID", label: "Paid" },
      { key: "DELIVERED", label: "Collected" },
    ],
  },
  deliver: {
    label: "I deliver myself",
    hint: "You pack and your own person drops it.",
    steps: [
      { key: "NEW", label: "New" },
      { key: "CONFIRMED", label: "Confirmed" },
      { key: "PAID", label: "Paid / COD" },
      { key: "PACKED", label: "Packed" },
      { key: "DISPATCHED", label: "Dispatched" },
      { key: "DELIVERED", label: "Delivered" },
    ],
  },
  courier: {
    label: "I send by courier",
    hint: "You pack and hand it to a courier with a tracking number.",
    steps: [
      { key: "NEW", label: "New" },
      { key: "CONFIRMED", label: "Confirmed" },
      { key: "PAID", label: "Paid / COD" },
      { key: "PACKED", label: "Packed" },
      { key: "DISPATCHED", label: "Shipped" },
      { key: "DELIVERED", label: "Delivered" },
    ],
  },
  service: {
    label: "Service or booking",
    hint: "Salon, repairs, tailoring. Nothing to pack or send.",
    steps: [
      { key: "NEW", label: "New" },
      { key: "CONFIRMED", label: "Confirmed" },
      { key: "PAID", label: "Paid" },
      { key: "DELIVERED", label: "Done" },
    ],
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
export const stepLabel = (flow: OrderFlowKey, key: StageKey) => ORDER_FLOWS[flow].steps.find((s) => s.key === key)?.label ?? null;

const RANK: Record<StageKey, number> = { NEW: 0, CONFIRMED: 1, PAID: 2, PACKED: 3, DISPATCHED: 4, DELIVERED: 5 };

/** How far an order has got on the full stage ladder (0 = new … 5 = delivered); -1 for cancelled. */
export function stageRank(o: { status: string; packedAt?: Date | null; paid: boolean; cod: boolean }): number {
  if (o.status === "CANCELLED") return -1;
  if (o.status === "DELIVERED") return RANK.DELIVERED;
  if (o.status === "DISPATCHED") return RANK.DISPATCHED;
  if (o.packedAt) return RANK.PACKED;
  if (o.status === "PAID" || o.paid || o.cod) return RANK.PAID;
  if (o.status === "CONFIRMED") return RANK.CONFIRMED;
  return RANK.NEW;
}

/** Index of the last step in this flow the order has reached (steps the flow skips count as done). */
export function reachedIndex(flow: OrderFlowKey, rank: number): number {
  const steps = ORDER_FLOWS[flow].steps;
  let at = -1;
  steps.forEach((s, i) => {
    if (RANK[s.key] <= rank) at = i;
  });
  return at;
}
