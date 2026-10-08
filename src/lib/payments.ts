import "server-only";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { db } from "./db";
import { headerImageFor } from "./media";
import { itemsText, itemsWithNames, money, orderRef } from "./orders";
import { getSettings } from "./provider";
import { replyWindowEnd } from "./replies";
import { senderFor } from "./senders";
import { renderFor, type TemplateButton, type VarMap } from "./template";
import { MetaError, sendOrderStatus, sendPaymentRequest, sendPaymentTemplate } from "./whatsapp";

// WhatsApp payments for orders: the "Review and pay" request, reminders, confirmation and the order card
// in the customer's chat. Shared by the webhook, the Orders page and the scheduler.

/** Our own "order details" template, preferred once approved for requests after the customer's 24-hour window. */
export const PAYMENT_TEMPLATE = "payment_request";

/** An unpaid request gets one reminder after this long, if the order is still open. */
const REMIND_AFTER_MS = 6 * 3_600_000;
/** Orders older than this aren't chased any more. */
const REMIND_WITHIN_MS = 3 * 86_400_000;

const hasPayButton = (t: { buttons: unknown }) => (t.buttons as TemplateButton[]).some((b) => b.type === "ORDER_DETAILS");

/**
 * The approved template with a "Review and pay" button to send: payment_request when Meta has approved it,
 * otherwise one added from Meta's template library (pre-approved), so payments work while ours is in review.
 */
export async function paymentTemplateFor(clientId: string) {
  const approved = (await db.template.findMany({ where: { clientId, status: "APPROVED" }, orderBy: { name: "asc" } })).filter(hasPayButton);
  return approved.find((t) => t.name === PAYMENT_TEMPLATE) ?? approved[0] ?? null;
}

/** The customer's last message (whose 24-hour window allows free-form messages) and the number to reply from. */
async function replyContext(customer: { id: string; clientId: string }) {
  const last = await db.reply.findFirst({ where: { customerId: customer.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const { number, cfg } = await senderFor(customer.clientId, last?.senderId);
  return { open: replyWindowEnd(last?.receivedAt) !== null, number, cfg };
}

async function logMessage(customerId: string, templateName: string, body: string, res: { id: string; simulated: boolean }, senderId: string | null) {
  await db.message.create({
    data: { customerId, templateName, body, status: "SENT", waMessageId: res.id, simulated: res.simulated, provider: "META", sentAt: new Date(), senderId },
  });
}

/** Meta couldn't fetch a catalogue product's picture (error 131053). */
const MEDIA_ERROR = 131053;

/**
 * Sends with the catalogue link (so WhatsApp shows product pictures), and if Meta can't load a product's
 * picture, sends again without it so the customer still gets a working "Review and pay".
 */
async function withCatalogFallback<T, P extends { catalogId?: string | null }>(payment: P, send: (p: P) => Promise<T>) {
  try {
    return await send(payment);
  } catch (e) {
    if (!payment.catalogId || !(e instanceof MetaError) || e.code !== MEDIA_ERROR) throw e;
    console.warn("Product picture couldn't be loaded; sending the payment request without catalogue pictures");
    return send({ ...payment, catalogId: null });
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

/**
 * Sends the "Review and pay" message for an order, paid by UPI through the client's payment configuration.
 * Callers check the user may act on the order; this checks the order can be paid.
 */
export async function sendPaymentRequestFor(orderId: string, opts: { reminder?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, client: { select: { name: true, paymentConfig: true } } } });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.paidAt || ["PAID", "DISPATCHED", "DELIVERED"].includes(order.status)) return { ok: false, message: "This order is already paid." };
  if (order.status === "CANCELLED") return { ok: false, message: "This order is cancelled." };
  if (!order.client.paymentConfig) return { ok: false, message: "Set your payment configuration name at the top of Orders first." };
  if (order.total <= 0) return { ok: false, message: "This order has no total. Add prices before asking for payment." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };
  if ((await getSettings()).provider !== "META") return { ok: false, message: "Payment requests need the WhatsApp Cloud API." };

  const items = await itemsWithNames(order);
  const ref = orderRef(order);
  const payment = {
    referenceId: ref,
    configuration: order.client.paymentConfig,
    items: items.map((i) => ({ id: i.id, name: i.name ?? i.id, quantity: i.quantity, price: i.price })),
    total: order.total,
    catalogId: order.catalogId,
  };
  const text = opts.reminder
    ? `Hello ${firstName(c.name)}, a reminder that your ${order.client.name} order ${ref} is waiting for payment.\n\nItems: ${itemsText(items)}\nTotal: ${money(order.total, order.currency)}\n\nTap "Review and pay" to pay by UPI, and we will pack it right away.`
    : `Hello ${firstName(c.name)}, here is your ${order.client.name} order ${ref}.\n\nItems: ${itemsText(items)}\nTotal: ${money(order.total, order.currency)}\n\nTap "Review and pay" to pay by UPI.`;
  const { open, number, cfg } = await replyContext(c);

  try {
    let res: { id: string; simulated: boolean };
    let templateName = opts.reminder ? "Payment reminder" : "Payment request";
    if (open) {
      res = await withCatalogFallback(payment, (p) => sendPaymentRequest(cfg, c.phone, text, p));
    } else {
      const t = await paymentTemplateFor(c.clientId);
      if (!t)
        return { ok: false, message: `The customer's 24-hour window has closed, so WhatsApp needs an approved template with a "Review and pay" button. Add one from Meta's Template library (approved instantly) or wait for ${PAYMENT_TEMPLATE}, then sync templates.` };
      const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, c);
      const template = { name: t.name, language: t.language, bodyParams: r.bodyParams, headerParams: r.headerParams, headerImage: t.headerType === "IMAGE" ? await headerImageFor(t) : null };
      res = await withCatalogFallback(payment, (p) => sendPaymentTemplate(cfg, c.phone, template, p));
      templateName = t.name;
    }
    await logMessage(c.id, templateName, text, res, number?.id ?? null);
    await db.order.update({ where: { id: order.id }, data: opts.reminder ? { paymentReminderAt: new Date() } : { paymentRequestedAt: new Date() } });
    return { ok: true, message: res.simulated ? "Simulated payment request logged (demo mode)." : `Payment ${opts.reminder ? "reminder" : "request"} sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/** A cart just arrived from the catalogue: ask for payment straight away when payments are set up. */
export async function autoRequestPayment(order: { id: string; clientId: string; total: number }) {
  if (order.total <= 0) return;
  const client = await db.client.findUnique({ where: { id: order.clientId }, select: { paymentConfig: true } });
  if (!client?.paymentConfig) return;
  const r = await sendPaymentRequestFor(order.id);
  if (!r.ok) console.warn(`Automatic payment request for order ${order.id} not sent: ${r.message}`);
}

/**
 * Marks an order paid (from Meta's payment webhook, or staff confirming a UPI payment by hand) and thanks
 * the customer once. Orders already dispatched just record the payment.
 */
export async function confirmPayment(orderId: string, txnId?: string | null) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, client: { select: { name: true } } } });
  // Meta may send the same payment twice; only the first one marks it paid and thanks the customer.
  if (!order || order.paidAt) return false;
  await db.order.update({
    where: { id: order.id },
    data: { paidAt: new Date(), paymentTxnId: txnId ?? null, ...((order.status === "NEW" || order.status === "CONFIRMED") && { status: "PAID" as const }) },
  });
  const c = order.customer;
  const ref = orderRef(order);
  const text = `Hello ${firstName(c.name)}, we have received your payment of ${money(order.total, order.currency)} for order ${ref}. Thank you! We are packing your order and will message you when it is dispatched.`;
  await updateOrderCard(order, "processing", text, "Payment received").catch((e) => console.error("Could not send payment confirmation", e));
  return true;
}

const CARD_LABEL = { processing: "Payment received", shipped: "Order dispatched", completed: "Order delivered", canceled: "Order cancelled" } as const;
export type CardStatus = keyof typeof CARD_LABEL;

/**
 * Updates the order card in the customer's chat (the one "Review and pay" created) with a message. Only for
 * orders that had a payment request, and only inside the 24-hour window; returns false when it couldn't,
 * so the caller can fall back to a plain message or template.
 */
export async function updateOrderCard(
  order: { id: string; number: number; paymentRequestedAt: Date | null; customer: { id: string; clientId: string; phone: string } },
  status: CardStatus,
  text: string,
  description: string = CARD_LABEL[status],
) {
  if (!order.paymentRequestedAt || (await getSettings()).provider !== "META") return false;
  const { open, number, cfg } = await replyContext(order.customer);
  if (!open) return false;
  const res = await sendOrderStatus(cfg, order.customer.phone, orderRef(order), status, text, description);
  await logMessage(order.customer.id, CARD_LABEL[status], text, res, number?.id ?? null);
  return true;
}

/** Scheduler: one reminder for payment requests still unpaid after a few hours. */
export async function remindUnpaidOrders(now = new Date(), limit = 20) {
  const due = await db.order.findMany({
    where: {
      status: { in: ["NEW", "CONFIRMED"] },
      paidAt: null,
      paymentReminderAt: null,
      paymentRequestedAt: { lte: new Date(now.getTime() - REMIND_AFTER_MS), gte: new Date(now.getTime() - REMIND_WITHIN_MS) },
    },
    select: { id: true },
    orderBy: { paymentRequestedAt: "asc" },
    take: limit,
  });
  for (const { id } of due) {
    const r = await sendPaymentRequestFor(id, { reminder: true });
    // Don't retry a reminder that can't go out (no template, opted out): mark it handled.
    if (!r.ok) {
      console.warn(`Payment reminder for order ${id} not sent: ${r.message}`);
      await db.order.update({ where: { id }, data: { paymentReminderAt: now } });
    }
  }
}
