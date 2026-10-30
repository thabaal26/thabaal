import { db } from "@/lib/db";
import { isBoughtOrder, RUPEES_PER_POINT } from "@/lib/loyalty";
import { orderRef } from "@/lib/order-ref";

/** One line of Customers › Loyalty › Point history. */
export type PointEvent = {
  id: string;
  at: string;
  customerId: string;
  name: string;
  /** "auto": given by the rule on a paid order; "hand": given by hand; "used": used on an order or a bill; "back": taken back. */
  kind: "auto" | "hand" | "used" | "back";
  what: string;
  why: string;
  points: number;
  by: string;
};

/**
 * Every points change for a client's customers, newest first: points the rule gave on each bought order
 * (1 per ₹100, +50 from the second order), points used on orders that still stand, and the hand changes
 * saved in LoyaltyEntry. Worked out from the same rows as the balance, so the two agree.
 */
export async function loyaltyHistory(clientId: string, limit = 400): Promise<PointEvent[]> {
  const [orders, entries] = await Promise.all([
    db.order.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      select: { id: true, number: true, ref: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, createdAt: true, pointsRedeemed: true, customer: { select: { id: true, name: true } } },
    }),
    // Before the history table exists on a database (it's added by an additive script), there are no hand changes to show.
    db.loyaltyEntry
      .findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: limit, include: { customer: { select: { name: true } } } })
      .catch(() => []),
  ]);

  const events: PointEvent[] = [];
  const boughtSoFar = new Map<string, number>();
  for (const o of orders) {
    const ref = orderRef(o);
    if (isBoughtOrder(o)) {
      const n = (boughtSoFar.get(o.customer.id) ?? 0) + 1;
      boughtSoFar.set(o.customer.id, n);
      const pts = Math.floor(o.total / RUPEES_PER_POINT) + (n > 1 ? 50 : 0);
      if (pts > 0)
        events.push({
          id: `e-${o.id}`,
          at: (o.paidAt ?? o.createdAt).toISOString(),
          customerId: o.customer.id,
          name: o.customer.name,
          kind: "auto",
          what: `Earned on order #${ref}`,
          why: n > 1 ? `1 point per ₹${RUPEES_PER_POINT} · +50 for a repeat order` : `1 point per ₹${RUPEES_PER_POINT}`,
          points: pts,
          by: "Automatic",
        });
    }
    if ((o.pointsRedeemed ?? 0) > 0 && o.status !== "CANCELLED")
      events.push({
        id: `u-${o.id}`,
        at: o.createdAt.toISOString(),
        customerId: o.customer.id,
        name: o.customer.name,
        kind: "used",
        what: `Used on order #${ref}`,
        why: `₹${Math.round(o.pointsRedeemed * 0.5)} off`,
        points: -o.pointsRedeemed,
        by: "Automatic",
      });
  }
  for (const e of entries) {
    events.push({
      id: e.id,
      at: e.createdAt.toISOString(),
      customerId: e.customerId,
      name: e.customer.name,
      kind: e.kind === "redeem" ? "used" : e.delta < 0 ? "back" : "hand",
      what: e.kind === "redeem" ? "Used for a bill" : e.delta < 0 ? "Taken back" : "Given by hand",
      why: e.reason + (e.told ? " · customer told" : ""),
      points: e.delta,
      by: e.byName || "You",
    });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
