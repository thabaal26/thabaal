// Loyalty points used as a discount on an order: by hand on the order card, or automatically when a new
// order arrives (Client.loyaltyAutoRedeem). The points are stored on the order (Order.pointsRedeemed) and
// its total is the amount to pay after the discount, so payment requests, COD and reports all see the right
// money. A cancelled order no longer counts, so its points go back to the customer.
import { db } from "./db";
import { loyaltyFromOrders } from "./loyalty";
import { getOrderPricing, pointsDiscount } from "./order-pricing";

/** Discounts go in ₹25 steps (50 points). */
export const REDEEM_STEP = 25;

const r2 = (n: number) => Math.round(n * 100) / 100;
const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

type PricedLine = { price: number; quantity: number };

async function loadOrder(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      clientId: true,
      items: true,
      total: true,
      status: true,
      paidAt: true,
      paidAmount: true,
      pointsRedeemed: true,
      paymentRequestedAt: true,
      customer: {
        select: {
          name: true,
          tags: true,
          purchases: true,
          orders: { select: { id: true, total: true, status: true, paidAt: true, pointsRedeemed: true } },
        },
      },
    },
  });
}

/**
 * The most this order can take off with points right now: the customer's balance (leaving this order's own
 * points and its own spend out) in ₹25 steps, at most ₹250, and never more than the items cost.
 */
export function maxPointsDiscount(order: {
  id: string;
  items: unknown;
  total: number;
  pointsRedeemed?: number | null;
  customer: Parameters<typeof loyaltyFromOrders>[0];
}) {
  const items = (order.items as PricedLine[] | null) ?? [];
  const { subtotal } = getOrderPricing(items, order.total, { discount: pointsDiscount(order) });
  const loyalty = loyaltyFromOrders(order.customer, { exceptOrderId: order.id });
  const itemsCap = Math.floor(subtotal / REDEEM_STEP) * REDEEM_STEP;
  return { max: Math.max(0, Math.min(loyalty.redeemableRupees, itemsCap)), balance: loyalty.totalPoints };
}

/**
 * Sets the points discount on an order to `amount` rupees ("max" = as much as the balance allows; 0 removes it).
 * The order's total becomes items + shipping − discount. Refused on paid or cancelled orders.
 */
export async function setOrderPoints(orderId: string, amount: number | "max"): Promise<{ ok: boolean; message: string; applied: number }> {
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, message: "Order not found.", applied: 0 };
  if (order.status === "CANCELLED") return { ok: false, message: "This order is cancelled.", applied: 0 };
  if (order.paidAt || (order.paidAmount ?? 0) > 0) {
    return { ok: false, message: "Money has already been received for this order, so its total can't change. Record a refund instead.", applied: 0 };
  }

  const items = (order.items as PricedLine[] | null) ?? [];
  const current = pointsDiscount(order);
  const { subtotal, shipping } = getOrderPricing(items, order.total, { discount: current });
  if (subtotal <= 0) return { ok: false, message: "Add item prices before using points.", applied: 0 };

  const { max, balance } = maxPointsDiscount(order);
  const wanted = amount === "max" ? max : Math.max(0, Math.floor(amount / REDEEM_STEP) * REDEEM_STEP);
  if (wanted > max) {
    return {
      ok: false,
      message:
        max > 0
          ? `${order.customer.name} can use up to ${rupees(max)} of points on this order (${balance} points).`
          : `${order.customer.name} doesn't have enough points yet (${balance} points; 50 are needed for ₹25).`,
      applied: current,
    };
  }
  if (wanted === current) return { ok: true, message: wanted ? `${rupees(wanted)} of points is already on this order.` : "No points are used on this order.", applied: current };

  const total = r2(subtotal + shipping - wanted);
  await db.order.update({ where: { id: order.id }, data: { pointsRedeemed: wanted * 2, total } });

  const resend = order.paymentRequestedAt ? " Send the payment request again so they pay the new total." : "";
  return {
    ok: true,
    applied: wanted,
    message: wanted
      ? `Used ${wanted * 2} points: ${rupees(wanted)} off ${order.customer.name}'s order. New total ${rupees(total)}.${resend}`
      : `Points removed. ${order.customer.name}'s ${current * 2} points are back and the total is ${rupees(total)} again.${resend}`,
  };
}

/** A new order arrived (cart or hand-entered): use the customer's points on it when the client has this turned on. */
export async function autoRedeemPoints(orderId: string): Promise<number> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { pointsRedeemed: true, client: { select: { loyaltyAutoRedeem: true } } } });
  if (!order?.client.loyaltyAutoRedeem || order.pointsRedeemed > 0) return 0;
  const r = await setOrderPoints(orderId, "max");
  return r.ok ? r.applied : 0;
}

/**
 * The points discount an order keeps after its items change: the same amount, cut back when the items
 * now cost less than it.
 */
export function keptPointsDiscount(o: { pointsRedeemed?: number | null }, newSubtotal: number) {
  return Math.min(pointsDiscount(o), Math.floor(Math.max(0, newSubtotal) / REDEEM_STEP) * REDEEM_STEP);
}
