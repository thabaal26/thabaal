// Unfinished WhatsApp orders (Payment settings › WhatsApp order assistant):
//   • a friendly nudge 3 hours after the last step, and a last one at 22 hours, both inside the free 24-hour
//     window and only about the one thing still missing (address, how to pay, payment, add-or-separate);
//   • after N days (1, 3 or 7) the order is cancelled as expired and its pay card closed. No message for that.
// Orders staff made by hand are never nudged or expired; nor are orders with money in, a payment claim, or
// cash on delivery confirmed.
import "server-only";
import { db } from "./db";
import { pushOrderToSheet } from "./google-sheets-live";
import { money, orderRef } from "./orders";
import { readPaySettings, type PaySettings } from "./pay-settings";
import { dueOf } from "./payment-state";
import { logPaymentEvent } from "./payment-events";
import { replyContext, textInWindow, updateOrderCard } from "./payments";
import { getSettings } from "./provider";
import { quietUntil } from "./rules";
import { staffActive } from "./order-assistant";
import { bold, hello } from "./wa-text";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FIRST_AFTER = 3 * HOUR;
const LAST_AFTER = 22 * HOUR;
const PER_TICK = 25;

/** WhatsApp carts and one-tap reorders, not orders staff typed in. */
const fromWhatsApp = { waMessageId: { not: null } };

/** Still waiting on the customer: nothing paid, no claim, not cash on delivery, not cancelled or packed. */
const unfinished = {
  status: "NEW" as const,
  paidAt: null,
  packedAt: null,
  paymentClaimedAt: null,
  OR: [{ paidAmount: null }, { paidAmount: { lte: 0 } }],
  AND: [{ OR: [{ paymentMethod: null }, { paymentMethod: { not: "cod" } }] }],
  ...fromWhatsApp,
};

type Waiting = {
  id: string;
  number: number;
  ref: string | null;
  total: number;
  currency: string;
  status: string;
  paidAmount: number | null;
  paidAt: Date | null;
  createdAt: Date;
  addressAskedAt: Date | null;
  addressConfirmedAt: Date | null;
  paymentRequestedAt: Date | null;
  mergeWith: string | null;
  customer: { id: string; clientId: string; phone: string; name: string; optedOut: boolean };
};

/** The one thing still missing, in the customer's words. */
function whatsMissing(o: Waiting) {
  const ref = bold(orderRef(o));
  if (o.mergeWith) return `Your order ${ref} needs one answer: add it to your earlier order, or keep it separate? Please choose in the message above.`;
  if (o.addressAskedAt && !o.addressConfirmedAt) return `Your order ${ref} is almost done. 🛒 Just send your delivery address (or use the button above) and we'll pack it for you.`;
  if (o.paymentRequestedAt) return `Your order ${ref} is waiting for payment of ${bold(money(dueOf(o), o.currency))}. Tap ${bold("Review and pay")} above to complete it, and we'll pack it right away.`;
  return `Your order ${ref} (${bold(money(o.total, o.currency))}) is ready. Please choose ${bold("Pay now online")} or ${bold("Cash on delivery")} in the message above to confirm it.`;
}

/** When the customer was last asked something about this order. */
const lastAsk = (o: Waiting) => Math.max(o.createdAt.getTime(), o.addressAskedAt?.getTime() ?? 0, o.addressConfirmedAt?.getTime() ?? 0, o.paymentRequestedAt?.getTime() ?? 0);

/** Sends the nudges that are due. */
export async function nudgeUnfinishedOrders(now = new Date(), paused: ReadonlySet<string> = new Set()) {
  if ((await getSettings()).provider !== "META") return 0;
  const t = now.getTime();
  const due = await db.order.findMany({
    where: {
      ...unfinished,
      nudgeCount: { lt: 2 },
      createdAt: { gte: new Date(t - DAY), lte: new Date(t - FIRST_AFTER) },
      ...(paused.size ? { clientId: { notIn: [...paused] } } : {}),
    },
    select: {
      id: true, number: true, ref: true, total: true, currency: true, status: true, paidAmount: true, paidAt: true, createdAt: true, nudgeCount: true, nudgedAt: true,
      addressAskedAt: true, addressConfirmedAt: true, paymentRequestedAt: true, mergeWith: true,
      customer: { select: { id: true, clientId: true, phone: true, name: true, optedOut: true } },
      client: { select: { paySettings: true, paymentConfig: true, quietFrom: true, quietTo: true } },
    },
    orderBy: { createdAt: "asc" },
    take: PER_TICK,
  });
  let sent = 0;
  for (const o of due) {
    const s: PaySettings = readPaySettings(o.client.paySettings, o.client.paymentConfig);
    if (!s.nudgeOn || o.customer.optedOut) continue;
    const age = t - o.createdAt.getTime();
    const last = o.nudgeCount === 1;
    // First nudge 3 hours after the last thing we asked; the last one at 22 hours, at least 3 hours after the first.
    if (!last && t - lastAsk(o) < FIRST_AFTER) continue;
    if (last && (age < LAST_AFTER || (o.nudgedAt && t - o.nudgedAt.getTime() < FIRST_AFTER))) continue;
    // Not at night, unless it's the last chance before the free window closes.
    if (quietUntil(o.client, now) && age < 23 * HOUR) continue;
    if (await staffActive(o.customer.id, now)) continue;
    if (!(await replyContext(o.customer)).open) continue;
    // Claim it first so two scheduler calls can't both send.
    const claimed = await db.order.updateMany({ where: { id: o.id, nudgeCount: o.nudgeCount }, data: { nudgeCount: o.nudgeCount + 1, nudgedAt: now, ...(last ? { paymentReminderAt: now } : {}) } });
    if (!claimed.count) continue;
    const text = last
      ? `${hello(o.customer.name)} a quick reminder: your order is still waiting.\n\n${whatsMissing(o)}\n\nPlease complete it today so we can deliver it to you.`
      : `${hello(o.customer.name)} ${whatsMissing(o).replace(/^Your/, "your")}`;
    if (await textInWindow(o.customer, text, last ? "Order reminder (last)" : "Order reminder").catch(() => false)) sent++;
  }
  return sent;
}

/** Cancels unfinished WhatsApp orders older than the shop's expiry, and closes their pay card. */
export async function expireUnfinishedOrders(now = new Date(), paused: ReadonlySet<string> = new Set()) {
  const t = now.getTime();
  const old = await db.order.findMany({
    where: { ...unfinished, createdAt: { lte: new Date(t - DAY) }, ...(paused.size ? { clientId: { notIn: [...paused] } } : {}) },
    select: {
      id: true, number: true, ref: true, clientId: true, createdAt: true, internalNote: true, paymentRequestedAt: true,
      customer: { select: { id: true, clientId: true, phone: true } },
      client: { select: { paySettings: true, paymentConfig: true } },
    },
    orderBy: { createdAt: "asc" },
    take: PER_TICK * 2,
  });
  let expired = 0;
  for (const o of old) {
    const days = readPaySettings(o.client.paySettings, o.client.paymentConfig).cartExpiryDays;
    if (t - o.createdAt.getTime() < days * DAY) continue;
    const reason = `Expired: not completed within ${days} day${days === 1 ? "" : "s"}`;
    const done = await db.order.updateMany({
      where: { id: o.id, status: "NEW", paidAt: null, paymentClaimedAt: null },
      data: { status: "CANCELLED", paymentReminderAt: now, internalNote: [o.internalNote, reason].filter(Boolean).join("\n").slice(0, 1000) },
    });
    if (!done.count) continue;
    expired++;
    pushOrderToSheet(o.id, "ORDER_UPDATE", reason);
    if (o.paymentRequestedAt) {
      await logPaymentEvent({ clientId: o.clientId, orderId: o.id, source: "system", status: "expired", note: reason }).catch(() => {});
      // The old "Review and pay" stops working; WhatsApp only allows this inside the 24-hour window.
      await updateOrderCard(o, "canceled", `This order expired because it wasn't completed. Send a new cart anytime.`, "Order expired").catch(() => false);
    }
  }
  return expired;
}
