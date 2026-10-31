// Cash on delivery confirmed by the customer (the "Cash on delivery" button, or "COD" typed): the order moves to
// confirmed and the customer gets one confirmation (on the order card when "Review and pay" made one, else a text).
import "server-only";
import { db } from "./db";
import { pushOrderToSheet } from "./google-sheets-live";
import { money, orderRef } from "./orders";
import { textInWindow, updateOrderCard } from "./payments";
import { bold, nameOf } from "./wa-text";

export async function confirmCod(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, client: { select: { name: true } } } });
  if (!order || order.status === "CANCELLED" || order.paidAt || order.packedAt) return false;
  const done = await db.order.updateMany({
    where: { id: order.id, status: { in: ["NEW", "CONFIRMED"] }, paidAt: null },
    data: { status: "CONFIRMED", paymentMethod: "cod" },
  });
  if (!done.count) return false;
  pushOrderToSheet(order.id, "ORDER_UPDATE", "Customer confirmed COD");

  const ref = orderRef(order);
  const addr = order.note?.trim() || order.customer.locationRaw?.trim() || order.customer.location?.trim() || "";
  const who = nameOf(order.customer.name);
  const text = [
    `✅ ${bold("Order confirmed")}`,
    `Thank you${who ? `, ${who}` : ""}! Your cash on delivery order ${bold(ref)} from ${order.client.name} is confirmed.`,
    `Amount to pay on delivery: ${bold(money(order.total, order.currency))}`,
    addr ? `📍 ${addr}` : `Please reply with your full delivery address (house/flat no., street, area, city and pincode) so we can deliver it.`,
    `We'll message you as soon as it's on the way.`,
  ].join("\n\n");
  // One message: the order card when the customer has one (it also moves its status), otherwise a text.
  const onCard = await updateOrderCard(order, "processing", text).catch(() => false);
  if (!onCard) await textInWindow(order.customer, text, "COD Confirmed").catch(() => {});
  return true;
}
