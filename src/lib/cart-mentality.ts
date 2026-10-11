import type { OrderItem } from "./orders";

export type PriorCartSnapshot = {
  id: string;
  number: number;
  total: number;
  currency: string;
  status: string;
  items: OrderItem[];
  internalNote: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

export type CartMentalityAnalysis = {
  /** Total number of carts in this buying session (1 = first cart, 2 = 2nd revised cart, etc.) */
  attemptCount: number;
  /** Earlier unpaid/superseded carts that led up to this current cart, newest first */
  previousCarts: PriorCartSnapshot[];
  /** What kind of buyer mentality shift happened between the previous cart and the latest cart */
  behavior: "first_cart" | "downsized" | "upsized" | "swapped" | "duplicate_retry";
  /** Human-readable headline explaining the customer's mentality */
  headline: string;
  /** Difference in total vs. the first/previous cart in this session (e.g., -220 means reduced budget by ₹220) */
  deltaAmount: number;
  /** Items the customer originally added to an earlier cart in this session, then removed in the latest cart */
  droppedItems: { name: string; quantity: number; price: number }[];
  /** Items the customer kept across their earlier cart and the latest cart (high conviction) */
  keptItems: { name: string; quantity: number; price: number }[];
  /** Items newly added in the latest cart that weren't in their earlier cart */
  addedItems: { name: string; quantity: number; price: number }[];
};

const normName = (i: { id?: string; name?: string }) =>
  (i.name ?? i.id ?? "item").trim().toLowerCase();

const displayName = (i: { id?: string; name?: string }) =>
  (i.name ?? i.id ?? "Item").trim();

/**
 * Analyzes a customer's current order against their earlier unpaid/superseded carts within the same
 * buying window (up to 7 days prior, after their last paid/delivered order).
 */
export function analyzeCartMentality(
  current: {
    id: string;
    number: number;
    total: number;
    currency: string;
    items: OrderItem[];
    createdAt: Date;
  },
  customerOrders: PriorCartSnapshot[],
): CartMentalityAnalysis {
  // Sort chronological oldest -> newest
  const sorted = [...customerOrders].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Find earlier orders before `current` that belong to the same shopping session:
  // Any unpaid / cancelled cart created within 7 days before `current`, after the customer's last completed/paid purchase.
  const windowStart = current.createdAt.getTime() - 7 * 86_400_000;
  const sessionPrior: PriorCartSnapshot[] = [];

  for (const o of sorted) {
    if (o.id === current.id) break;
    if (o.createdAt.getTime() > current.createdAt.getTime()) continue;
    // If the customer completed & paid an earlier order, a new shopping session starts after it
    if (
      o.paidAt !== null ||
      o.status === "PAID" ||
      o.status === "DISPATCHED" ||
      o.status === "DELIVERED"
    ) {
      sessionPrior.length = 0;
      continue;
    }
    if (o.createdAt.getTime() >= windowStart) {
      sessionPrior.push(o);
    }
  }

  if (sessionPrior.length === 0) {
    return {
      attemptCount: 1,
      previousCarts: [],
      behavior: "first_cart",
      headline: "Direct cart",
      deltaAmount: 0,
      droppedItems: [],
      keptItems: [],
      addedItems: [],
    };
  }

  const previousCarts = [...sessionPrior].reverse(); // newest prior cart first
  const immediatelyPrevious = previousCarts[0];

  // Collect all items across all prior carts in this session
  const priorItemMap = new Map<string, { name: string; quantity: number; price: number }>();
  for (const po of sessionPrior) {
    for (const item of po.items ?? []) {
      const key = normName(item);
      const existing = priorItemMap.get(key);
      if (!existing || item.quantity > existing.quantity) {
        priorItemMap.set(key, {
          name: displayName(item),
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
        });
      }
    }
  }

  const currentItemMap = new Map<string, { name: string; quantity: number; price: number }>();
  for (const item of current.items ?? []) {
    const key = normName(item);
    currentItemMap.set(key, {
      name: displayName(item),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
    });
  }

  const droppedItems: { name: string; quantity: number; price: number }[] = [];
  const keptItems: { name: string; quantity: number; price: number }[] = [];
  const addedItems: { name: string; quantity: number; price: number }[] = [];

  for (const [key, pItem] of priorItemMap.entries()) {
    const cItem = currentItemMap.get(key);
    if (!cItem) {
      droppedItems.push(pItem);
    } else {
      keptItems.push(cItem);
    }
  }

  for (const [key, cItem] of currentItemMap.entries()) {
    if (!priorItemMap.has(key)) {
      addedItems.push(cItem);
    }
  }

  const deltaAmount = Math.round(current.total - immediatelyPrevious.total);
  const sameItems =
    droppedItems.length === 0 &&
    addedItems.length === 0 &&
    Math.abs(deltaAmount) < 1;

  let behavior: CartMentalityAnalysis["behavior"] = "swapped";
  let headline = `Revised cart (#${sessionPrior.length + 1}) · Replaced RG-${1000 + immediatelyPrevious.number}`;

  if (sameItems) {
    behavior = "duplicate_retry";
    headline = `Retried same cart (#${sessionPrior.length + 1}) · Replaced RG-${1000 + immediatelyPrevious.number}`;
  } else if (deltaAmount < -10) {
    behavior = "downsized";
    headline = `Downsized budget by ₹${Math.abs(deltaAmount)} (RG-${1000 + immediatelyPrevious.number} ₹${immediatelyPrevious.total} → ₹${current.total})`;
  } else if (deltaAmount > 10) {
    behavior = "upsized";
    headline = `Expanded cart by +₹${deltaAmount} (RG-${1000 + immediatelyPrevious.number} ₹${immediatelyPrevious.total} → ₹${current.total})`;
  } else {
    behavior = "swapped";
    headline = `Swapped products (RG-${1000 + immediatelyPrevious.number} → RG-${1000 + current.number})`;
  }

  return {
    attemptCount: sessionPrior.length + 1,
    previousCarts,
    behavior,
    headline,
    deltaAmount,
    droppedItems,
    keptItems,
    addedItems,
  };
}
