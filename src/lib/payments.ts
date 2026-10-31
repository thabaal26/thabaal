import "server-only";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { db } from "./db";
import { headerImageFor } from "./media";
import { pushOrderToSheet } from "./google-sheets-live";
import { getOrderPricing, itemsText, itemsWithNames, money, orderRef } from "./orders";
import { pointsDiscount } from "./order-pricing";
import { logPaymentEvent, utrOf } from "./payment-events";
import { checkoutMode, codBlocked, upiLink, type CheckoutMode, type PaySettings } from "./pay-settings";
import { bold, hello, itemLines } from "./wa-text";
import { paySettingsFor } from "./pay-settings-server";
import { dueOf, receivedOf } from "./payment-state";
import { getSettings } from "./provider";
import { replyWindowEnd } from "./replies";
import { senderFor } from "./senders";
import { renderFor, type TemplateButton, type VarMap } from "./template";
import { MetaError, sendInteractiveButtons, sendMediaMessage, sendOrderStatus, sendPaymentRequest, sendPaymentTemplate, sendTextMessage } from "./whatsapp";

// WhatsApp payments for orders: the "Review and pay" request, reminders, confirmation and the order card
// in the customer's chat. Shared by the webhook, the Orders page and the scheduler.

/** Our own "order details" template, preferred once approved for requests after the customer's 24-hour window. */
export const PAYMENT_TEMPLATE = "payment_request";

const DAY_MS = 86_400_000;
/** Payment settings › Reminder rules: a reminder a day after the request, a last one after 3 days, expired a day later. */
const FIRST_REMINDER_MS = DAY_MS;
const LAST_REMINDER_MS = 3 * DAY_MS;
const EXPIRE_AFTER_LAST_MS = DAY_MS;
/** Requests older than this aren't chased any more (e.g. after the reminders were switched off for a while). */
const REMIND_WITHIN_MS = 6 * DAY_MS;
export const EXPIRED_REASON = "Expired: not paid after the reminders";

/** "first", "last" or none: which reminder this is. */
type Reminder = boolean | "last";
/** The field stamped when a request or reminder goes out. */
type SentData = { paymentRequestedAt?: Date; paymentReminderAt?: Date; paymentReminder2At?: Date };

/**
 * Parses amount from Meta payment objects.
 * Handles both divisor representation (offset: 100 for paise) and exponent mode (offset: 2 for 10^2).
 */
export function parseMetaAmount(amt: { value?: number | string | null; offset?: number | null } | null | undefined): number | null {
  if (!amt || amt.value == null) return null;
  const num = Number(amt.value);
  if (isNaN(num)) return null;
  const offset = amt.offset != null ? Number(amt.offset) : 2;
  return offset >= 10 ? num / offset : num / 10 ** offset;
}

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
export async function replyContext(customer: { id: string; clientId: string }) {
  const last = await db.reply.findFirst({ where: { customerId: customer.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const { number, cfg } = await senderFor(customer.clientId, last?.senderId);
  return { open: replyWindowEnd(last?.receivedAt) !== null, number, cfg };
}

export async function logMessage(customerId: string, templateName: string, body: string, res: { id: string; simulated: boolean }, senderId: string | null) {
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

export const firstName = (name: string) => (name.trim().startsWith("+") ? "" : name.trim().split(/\s+/)[0]) || "there";

/**
 * Sends the "Review and pay" message for an order, paid by UPI through the client's payment configuration.
 * Callers check the user may act on the order; this checks the order can be paid.
 */
export async function sendPaymentRequestFor(orderId: string, opts: { reminder?: Reminder } = {}): Promise<{ ok: boolean; message: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, client: { select: { name: true, paymentConfig: true } } } });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.paidAt || ["PAID", "DISPATCHED", "DELIVERED"].includes(order.status)) return { ok: false, message: "This order is already paid." };
  if (order.status === "CANCELLED") return { ok: false, message: "This order is cancelled." };
  // Catalogue carts use WhatsApp's "Review and pay"; orders from chat use the UPI link when it's on (Payment settings).
  const pay = await paySettingsFor(order.clientId);
  const useUpi = pay.upi && (!pay.waPay || !order.catalogId);
  if (!pay.waPay && !useUpi) return { ok: false, message: "Turn on Pay inside WhatsApp or the UPI link in Payments › Payment settings first." };
  if (order.total <= 0) return { ok: false, message: "This order has no total. Add prices before asking for payment." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };
  if ((await getSettings()).provider !== "META") return { ok: false, message: "Payment requests need the WhatsApp Cloud API." };

  const items = await itemsWithNames(order);
  const pricing = getOrderPricing(items, order.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(order) });
  const ref = orderRef(order);
  // With loyalty points used, WhatsApp's payment card shows the order as one line at the amount to pay (its items
  // must add up to the total); the message text above it lists the items, shipping and the points discount.
  // Only what is still owed is asked for: after a part payment, the request is for the balance.
  const due = dueOf(order);
  if (due <= 0) return { ok: false, message: "This order is already paid." };
  const balanceOnly = due + 0.005 < pricing.total;
  const oneLine = pricing.discount > 0 || balanceOnly;
  const payment = {
    referenceId: ref,
    configuration: pay.paymentConfig ?? "",
    items: oneLine
      ? [{ id: "order", name: balanceOnly ? `Balance for order ${ref}` : `Order ${ref} after loyalty points`, quantity: 1, price: due }]
      : items.map((i) => ({ id: i.id, name: i.name ?? i.id, quantity: i.quantity, price: i.price })),
    total: due,
    catalogId: oneLine ? null : order.catalogId,
  };
  const pointsLine = pricing.discount > 0 ? `\nLoyalty points (${order.pointsRedeemed}): -${money(pricing.discount, order.currency)}` : "";
  const balanceLines = balanceOnly ? `\nAlready received: ${money(receivedOf(order), order.currency)}\nBalance to pay: ${money(due, order.currency)}` : "";
  const breakdownLines =
    (pricing.shipping > 0 || pricing.discount > 0
      ? `Items: ${itemsText(items)} (${money(pricing.subtotal, order.currency)})${pricing.shipping > 0 ? `\nShipping: ${money(pricing.shipping, order.currency)}` : ""}${pointsLine}\nTotal: ${money(pricing.total, order.currency)}`
      : `Items: ${itemsText(items)}\nTotal: ${money(pricing.total, order.currency)}`) + balanceLines;
  const isReplacement = Boolean(order.internalNote?.includes("Replaced unpaid cart"));
  const head =
    opts.reminder === "last"
      ? `Hello ${firstName(c.name)}, a last reminder that your ${order.client.name} order ${ref} is still waiting for payment.`
      : opts.reminder
        ? `Hello ${firstName(c.name)}, a reminder that your ${order.client.name} order ${ref} is waiting for payment.`
        : isReplacement
          ? `Hello ${firstName(c.name)}, here is your updated ${order.client.name} order ${ref} (replacing your earlier cart).`
          : `Hello ${firstName(c.name)}, here is your ${order.client.name} order ${ref}.`;
  const sentData: SentData = opts.reminder === "last" ? { paymentReminder2At: new Date() } : opts.reminder ? { paymentReminderAt: new Date() } : { paymentRequestedAt: new Date() };
  const sentWord = opts.reminder ? "reminder" : "request";
  const { open, number, cfg } = await replyContext(c);

  if (useUpi) return sendUpiRequest({ order, settings: pay.settings, due, head, breakdownLines, open, number, cfg, sentData, sentWord, reminder: opts.reminder });

  // The first request after the customer gave their address repeats it, so they see where it goes.
  const deliverLine = !opts.reminder && order.addressConfirmedAt && order.note?.trim() ? `\n\nDeliver to: ${order.note.trim().slice(0, 300)}` : "";
  const text = `${head}\n\n${breakdownLines}${deliverLine}\n\nTap "Review and pay" to pay by UPI${opts.reminder ? ", and we will pack it right away" : ""}.`;
  try {
    let res: { id: string; simulated: boolean };
    let templateName = opts.reminder === "last" ? "Last payment reminder" : opts.reminder ? "Payment reminder" : "Payment request";
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
    await db.order.update({ where: { id: order.id }, data: sentData });
    return { ok: true, message: res.simulated ? "Simulated payment request logged (demo mode)." : `Payment ${sentWord} sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/**
 * Payment settings › UPI link: the order's amount with the shop's UPI ID, a tap-to-pay UPI link and the QR picture
 * when one was uploaded. Only inside the customer's 24-hour window (WhatsApp allows no free-form message after it).
 */
async function sendUpiRequest(p: {
  order: { id: string; number: number; ref: string | null; currency: string; customer: { id: string; name: string; phone: string } };
  settings: PaySettings;
  due: number;
  head: string;
  breakdownLines: string;
  open: boolean;
  number: { id: string } | null | undefined;
  cfg: Awaited<ReturnType<typeof senderFor>>["cfg"];
  sentData: SentData;
  sentWord: string;
  reminder?: Reminder;
}): Promise<{ ok: boolean; message: string }> {
  const c = p.order.customer;
  if (!p.open)
    return { ok: false, message: `${c.name}'s 24-hour WhatsApp window has closed, so the UPI link can't be sent now. It goes once they message you, or turn on Pay inside WhatsApp, which can use an approved template.` };
  const ref = orderRef(p.order);
  const link = upiLink(p.settings, p.due, `Order ${ref}`);
  const payee = p.settings.upiName ? `${p.settings.upiId} (${p.settings.upiName})` : p.settings.upiId;
  const text = `${p.head}\n\n${p.breakdownLines}\n\nPlease pay ${money(p.due, p.order.currency)} by UPI to ${payee}${p.settings.upiQrUrl ? ", or scan the QR code" : ""}.\nTap to pay: ${link}\n\nAfter paying, reply with the 12-digit UPI reference or a screenshot.`.slice(0, 1024);
  try {
    const res = p.settings.upiQrUrl ? await sendMediaMessage(p.cfg, c.phone, p.settings.upiQrUrl, text) : await sendTextMessage(p.cfg, c.phone, text);
    const label = p.reminder === "last" ? "Last UPI payment reminder" : p.reminder ? "UPI payment reminder" : "UPI payment link";
    await logMessage(c.id, label, text, res, p.number?.id ?? null);
    await db.order.update({ where: { id: p.order.id }, data: p.sentData });
    return { ok: true, message: res.simulated ? "Simulated UPI link logged (demo mode)." : `UPI payment ${p.sentWord} sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/** A cart just arrived from the catalogue: ask for payment straight away when payments are set up. */
export async function autoRequestPayment(order: { id: string; clientId: string; total: number }) {
  if (order.total <= 0) return;
  const pay = await paySettingsFor(order.clientId);
  if (!pay.waPay && !pay.upi) return;
  const r = await sendPaymentRequestFor(order.id);
  if (!r.ok) console.warn(`Automatic payment request for order ${order.id} not sent: ${r.message}`);
}

/**
 * Starts checkout for a freshly received catalogue cart:
 * asks the customer "Pay now online" or "Cash on delivery" when both are available,
 * or goes straight to "Review and pay" when only online payment is on.
 */
export async function startCheckout(order: { id: string; clientId: string; total: number }): Promise<CheckoutMode> {
  if (order.total <= 0) return "none";
  const fresh = await db.order.findUnique({
    where: { id: order.id },
    select: {
      id: true,
      clientId: true,
      total: true,
      customer: { select: { region: true, location: true, locationRaw: true } },
    },
  });
  if (!fresh || fresh.total <= 0) return "none";
  const pay = await paySettingsFor(fresh.clientId);
  const mode = checkoutMode(pay, fresh.total, fresh.customer);
  if (mode === "choose") {
    const r = await sendPaymentChoicePrompt(fresh.id);
    if (!r.ok) {
      console.warn(`Payment choice prompt for order ${fresh.id} not sent: ${r.message}. Falling back to pay-now.`);
      await autoRequestPayment(fresh);
    }
  } else if (mode === "online") {
    await autoRequestPayment(fresh);
  }
  return mode;
}

export type PaymentRecord = {
  /** upi_whatsapp, upi, cod, cash, bank, card or other (see lib/payment-state). */
  method?: string | null;
  /** meta, utr, screenshot, staff or verified. */
  source?: string;
  /** Amount received now; defaults to whatever is still due. Less than due records a part payment. */
  amount?: number | null;
  collectedBy?: string | null;
  /** Record it without messaging the customer (e.g. cash taken at the door, already thanked on delivery). */
  quiet?: boolean;
  /** What staff saw as already received when they recorded it; if that changed meanwhile, nothing is recorded. */
  seenReceived?: number | null;
  /** The bank's 12-digit UPI reference, when known; saved apart from the transaction reference. */
  utr?: string | null;
};

/**
 * Records money received for an order (Meta's payment update, a UPI reference the customer sent, or staff
 * recording UPI, cash or COD) and thanks the customer once when it's fully paid. A smaller amount is kept as a
 * part payment. Orders already dispatched just record the payment. False when already paid or not found.
 */
export async function confirmPayment(orderId: string, txnId?: string | null, rec: PaymentRecord = {}): Promise<boolean> {
  return confirmPaymentOnce(orderId, txnId, rec, 0);
}

async function confirmPaymentOnce(orderId: string, txnId: string | null | undefined, rec: PaymentRecord, attempt: number): Promise<boolean> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, client: { select: { name: true } } } });
  if (!order) return false;
  // The same WhatsApp transaction delivered again (Meta retries webhooks) is already counted, even for a part payment.
  // (Not when the id was only noted with a "customer says paid" claim: then this is the real payment arriving.)
  if (txnId && rec.source !== "staff" && order.paymentTxnId === txnId && receivedOf(order) > 0 && !order.paymentClaimedAt) return false;

  // If customer paid an old superseded/cancelled cart, automatically route the payment to their latest active order!
  if (order.status === "CANCELLED") {
    const activeOrder = await db.order.findFirst({
      where: { customerId: order.customerId, paidAt: null, status: { in: ["NEW", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, ref: true },
    });
    if (activeOrder) {
      console.log(`Payment received for cancelled order ${orderRef(order)}, auto-routing to active order ${orderRef(activeOrder)}`);
      await db.order.update({
        where: { id: order.id },
        data: {
          internalNote: [order.internalNote, `Payment received via this cancelled link was routed to active order ${orderRef(activeOrder)}`].filter(Boolean).join(" | ").slice(0, 1000),
        },
      });
      return confirmPaymentOnce(activeOrder.id, txnId, rec, attempt);
    }
  }

  // Meta may send the same payment twice; only the first one marks it paid and thanks the customer.
  // (A paid order whose items were later raised still takes the difference.)
  if (dueOf(order) <= 0) return false;
  if (rec.seenReceived != null && Math.abs(receivedOf(order) - rec.seenReceived) > 0.005) return false;
  const before = receivedOf(order);
  const due = dueOf(order);
  const amount = rec.amount != null && rec.amount > 0 ? rec.amount : due;
  const received = Math.round((before + amount) * 100) / 100;
  const full = received + 0.5 >= order.total;
  const method = rec.method ?? order.paymentMethod ?? (rec.source === "meta" ? "upi_whatsapp" : null);
  // Saved only if nobody else recorded money on this order since it was read (a webhook and staff at the same moment,
  // a double tap, Meta delivering the same update twice in parallel); otherwise read again, so money is never added twice.
  const saved = await db.order.updateMany({
    where: { id: order.id, paidAmount: order.paidAmount, paidAt: order.paidAt, status: order.status },
    data: {
      paidAmount: received,
      paymentMethod: method,
      paymentSource: rec.source ?? "meta",
      ...(txnId && { paymentTxnId: txnId }),
      ...((rec.utr ?? utrOf(txnId)) && { paymentUtr: rec.utr ?? utrOf(txnId) }),
      ...(rec.collectedBy && { collectedBy: rec.collectedBy.slice(0, 80) }),
      paymentClaimedAt: null,
      paymentFailedAt: null,
      paymentFailReason: null,
      ...(full && { paidAt: new Date() }),
      ...(full && (order.status === "NEW" || order.status === "CONFIRMED") && { status: "PAID" as const }),
      ...(received > order.total + 0.5 && {
        internalNote: [order.internalNote, `Paid ${money(received - order.total, order.currency)} more than the order total; check and refund if needed`]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1000),
      }),
      ...(!full && {
        internalNote: [order.internalNote, `Part payment ${money(amount, order.currency)} received; ${money(order.total - received, order.currency)} still due`]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1000),
      }),
    },
  });
  if (saved.count === 0) return attempt < 2 ? confirmPaymentOnce(orderId, txnId, rec, attempt + 1) : false;
  // Meta's own messages are logged where they arrive (with the full message); this records staff entries.
  if (rec.source === "staff" || rec.source === "verified")
    await logPaymentEvent({ clientId: order.clientId, orderId: order.id, source: "staff", status: "recorded", transactionId: txnId ?? null, utr: rec.utr ?? utrOf(txnId) ?? order.paymentUtr, amount, currency: order.currency, note: `${rec.source === "verified" ? "Checked and confirmed" : "Recorded"} by staff${method ? ` (${method})` : ""}` });
  pushOrderToSheet(order.id, "ORDER_UPDATE", full ? "Payment received" : "Part payment received");
  if (!full || rec.quiet) return true;
  // Payment settings › Reminder rules › "Send a receipt when paid" off: no thank-you message.
  if (!(await paySettingsFor(order.clientId)).settings.receipt) return true;

  const c = order.customer;
  const ref = orderRef(order);
  const how = method === "cod" || method === "cash" ? " in cash" : method === "bank" ? " by bank transfer" : "";
  // Order steps: a verified payment is what confirms the order, so this one message is both receipt and confirmation.
  const later = order.status === "DISPATCHED" || order.status === "DELIVERED";
  const text = later
    ? `Hello ${firstName(c.name)}, we have received your payment of ${money(received, order.currency)}${how} for order ${ref}. Thank you!`
    : `Hello ${firstName(c.name)}, we have received your payment of ${money(received, order.currency)}${how} for order ${ref}, and your order is confirmed. Thank you! We will message you with the next update.`;
  const cardUpdated = await updateOrderCard(order, "processing", text, later ? "Payment received" : "Order confirmed").catch((e) => {
    console.error("Could not send order_status payment confirmation, falling back to text", e);
    return false;
  });
  if (!cardUpdated && !c.optedOut && (await getSettings()).provider === "META") {
    try {
      const { open, number, cfg } = await replyContext(c);
      if (open) {
        const res = await sendTextMessage(cfg, c.phone, text);
        await logMessage(c.id, "Payment received", text, res, number?.id ?? null);
      }
    } catch (e) {
      console.error("Could not send fallback payment confirmation text", e);
    }
  }
  return true;
}

/** The customer says they paid (a "paid" message, a screenshot) but nothing confirms it: flag it for staff to check. */
export async function recordPaymentClaim(orderId: string, note: string, reference?: string | null) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, paidAt: true, paymentClaimNote: true } });
  if (!order || order.paidAt) return false;
  // A UTR the customer sent is kept in its own field too (a duplicate one isn't: it belongs to another order).
  const utr = reference && !/^DUP-/i.test(reference) ? utrOf(reference) : null;
  await db.order.update({
    where: { id: order.id },
    data: { paymentClaimedAt: new Date(), paymentClaimNote: note.slice(0, 300), ...(reference && { paymentTxnId: reference.slice(0, 60) }), ...(utr && { paymentUtr: utr }) },
  });
  pushOrderToSheet(order.id, "ORDER_UPDATE", "Customer says paid");
  return true;
}

/** A plain WhatsApp text inside the customer's 24-hour window; false when the window is closed or messages are off. */
export async function textInWindow(customer: { id: string; clientId: string; phone: string; optedOut: boolean }, text: string, label: string) {
  if (customer.optedOut || (await getSettings()).provider !== "META") return false;
  const { open, number, cfg } = await replyContext(customer);
  if (!open) return false;
  const res = await sendTextMessage(cfg, customer.phone, text);
  await logMessage(customer.id, label, text, res, number?.id ?? null);
  return true;
}

/** A WhatsApp payment attempt failed (declined, timed out): keep the reason, alert the customer in window, and update sheet. */
export async function recordPaymentFailure(orderId: string, reason: string) {
  await db.order.updateMany({ where: { id: orderId, paidAt: null }, data: { paymentFailedAt: new Date(), paymentFailReason: reason.slice(0, 200) } });
  pushOrderToSheet(orderId, "ORDER_UPDATE", "Payment failed");
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (order && !order.customer.optedOut) {
    const pay = await paySettingsFor(order.clientId);
    const codOk = pay.settings.codOn && codBlocked(pay.settings, order.total, order.customer) === null;
    const body = `${hello(order.customer.name)} your payment of ${bold(money(dueOf(order), order.currency))} for order ${bold(orderRef(order))} didn't go through (${reason}).\n\nYou can try again${codOk ? ", or pay in cash when it's delivered" : ""}.`;
    try {
      if ((await getSettings()).provider === "META") {
        const { open, number, cfg } = await replyContext(order.customer);
        if (open) {
          const client = await db.client.findUnique({ where: { id: order.clientId }, select: { name: true } });
          const res = await sendInteractiveButtons(
            cfg,
            order.customer.phone,
            body,
            [{ id: `pay_online:${order.id}`, title: "🔁 Try again" }, ...(codOk ? [{ id: `pay_cod:${order.id}`, title: "🚚 Cash on delivery" }] : [])],
            { header: "Payment not completed", footer: client?.name },
          );
          await logMessage(order.customer.id, "Payment failed", body, res, number?.id ?? null);
          return;
        }
      }
    } catch (e) {
      console.warn("Payment-failed buttons not sent", e);
    }
    const first = order.customer.name.trim().split(/\s+/)[0] || "there";
    const codOn = codOk;
    const text = `Hello ${first}, your payment of ${money(dueOf(order), order.currency)} for order ${orderRef(order)} could not be completed (${reason}). Tap the payment link above to try again${codOn ? ', or reply "COD" to pay in cash upon delivery' : ""}.`;
    await textInWindow(order.customer, text, "Payment failed").catch(() => false);
  }
}

const CARD_LABEL = { processing: "Payment received", shipped: "Order dispatched", completed: "Order delivered", canceled: "Order cancelled" } as const;
export type CardStatus = keyof typeof CARD_LABEL;

/**
 * Updates the order card in the customer's chat (the one "Review and pay" created) with a message. Only for
 * orders that had a payment request, and only inside the 24-hour window; returns false when it couldn't,
 * so the caller can fall back to a plain message or template.
 */
export async function updateOrderCard(
  order: { id: string; number: number; ref: string | null; paymentRequestedAt: Date | null; customer: { id: string; clientId: string; phone: string } },
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

/**
 * When a customer submits a new cart or an order is updated, every previous unpaid cart
 * and its active payment card must immediately expire.
 * - Marks earlier unpaid orders CANCELLED in DB.
 * - Updates the Meta WhatsApp in-chat order card to "canceled" so the old "Review and Pay" button is deactivated.
 * - Sets paymentReminderAt to prevent background reminders for expired carts.
 */
export async function cancelSupersededOrdersForCustomer(
  customerId: string,
  newOrder: { id: string; number: number; ref: string | null; total: number; currency: string },
) {
  const newRef = orderRef(newOrder);
  const newTotal = money(newOrder.total, newOrder.currency);

  const priorUnpaid = await db.order.findMany({
    where: {
      customerId,
      id: { not: newOrder.id },
      paidAt: null,
      packedAt: null,
      status: { in: ["NEW", "CONFIRMED"] },
      OR: [{ paidAmount: null }, { paidAmount: { lte: 0 } }],
      NOT: { status: "CONFIRMED", paymentMethod: "cod" },
    },
    include: {
      customer: { select: { id: true, clientId: true, phone: true } },
    },
  });

  if (!priorUnpaid.length) return [];

  const cancelledIds: string[] = [];
  for (const old of priorUnpaid) {
    const oldRef = orderRef(old);
    const supersedeNote = `Superseded by ${newRef} (${newTotal}) · Customer sent a newer cart`;
    const mergedNote = [old.internalNote, supersedeNote].filter(Boolean).join(" | ").slice(0, 1000);

    // 1. Mark cancelled in DB & neutralize reminder cron
    await db.order.update({
      where: { id: old.id },
      data: {
        status: "CANCELLED",
        internalNote: mergedNote,
        paymentReminderAt: new Date(),
      },
    });
    cancelledIds.push(old.id);

    // 2. If an interactive "Review and pay" card was sent for this old order, cancel it in WhatsApp
    if (old.paymentRequestedAt) {
      await updateOrderCard(
        old,
        "canceled",
        `This cart was replaced by your new order ${newRef} (${newTotal}).`,
        "Cart replaced by newer order",
      ).catch((e) => console.warn(`Could not cancel WhatsApp card for old order ${oldRef}`, e));
    }
  }

  return cancelledIds;
}

/**
 * Scheduler, following Payment settings › Reminder rules for each client: a reminder a day after the payment
 * request, a last one after 3 days, and a day after that the request is marked expired (Failed or expired).
 */
export async function remindUnpaidOrders(now = new Date(), limit = 20, paused: ReadonlySet<string> = new Set()) {
  const t = now.getTime();
  const open = {
    status: { in: ["NEW", "CONFIRMED"] as ("NEW" | "CONFIRMED")[] },
    paidAt: null,
    // No reminder for cash on delivery, or for someone who says they've paid (staff are checking).
    paymentClaimedAt: null,
    OR: [{ paymentMethod: null }, { paymentMethod: { not: "cod" } }],
    // Businesses locked for an unpaid plan: reminders wait until they pay.
    ...(paused.size ? { clientId: { notIn: [...paused] } } : {}),
  };
  const rules = new Map<string, PaySettings>();
  const rulesFor = async (clientId: string) => {
    if (!rules.has(clientId)) rules.set(clientId, (await paySettingsFor(clientId)).settings);
    return rules.get(clientId)!;
  };

  const first = await db.order.findMany({
    where: { ...open, paymentReminderAt: null, paymentReminder2At: null, paymentRequestedAt: { lte: new Date(t - FIRST_REMINDER_MS), gt: new Date(t - LAST_REMINDER_MS) } },
    select: { id: true, clientId: true },
    orderBy: { paymentRequestedAt: "asc" },
    take: limit,
  });
  const last = await db.order.findMany({
    where: { ...open, paymentReminder2At: null, paymentFailedAt: null, paymentRequestedAt: { lte: new Date(t - LAST_REMINDER_MS), gte: new Date(t - REMIND_WITHIN_MS) } },
    select: { id: true, clientId: true },
    orderBy: { paymentRequestedAt: "asc" },
    take: limit,
  });
  for (const [list, kind, field] of [
    [first, true, "paymentReminderAt"],
    [last, "last", "paymentReminder2At"],
  ] as const) {
    for (const o of list) {
      const r = await rulesFor(o.clientId);
      if (kind === true ? !r.remind1 : !r.remind3) continue;
      const res = await sendPaymentRequestFor(o.id, { reminder: kind });
      // Don't retry a reminder that can't go out (window closed, no template, opted out): mark it handled.
      if (!res.ok) {
        console.warn(`Payment reminder for order ${o.id} not sent: ${res.message}`);
        await db.order.update({ where: { id: o.id }, data: { [field]: now } });
      }
    }
  }

  // A day after the last reminder, a request still unpaid is marked expired.
  const stale = await db.order.findMany({
    where: { ...open, paymentFailedAt: null, paymentReminder2At: { lte: new Date(t - EXPIRE_AFTER_LAST_MS) } },
    select: { id: true, clientId: true },
    take: limit,
  });
  for (const o of stale) {
    if (!(await rulesFor(o.clientId)).remind3) continue;
    await db.order.updateMany({ where: { id: o.id, paidAt: null, paymentFailedAt: null }, data: { paymentFailedAt: now, paymentFailReason: EXPIRED_REASON } });
    await logPaymentEvent({ clientId: o.clientId, orderId: o.id, source: "system", status: "expired", note: EXPIRED_REASON });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Payment request expired");
  }
}

/**
 * Sends a 1-click interactive confirmation prompt for Cash on Delivery orders
 * with "Confirm Order" and "Cancel Order" buttons.
 */
export async function sendCodConfirmationPrompt(orderId: string): Promise<{ ok: boolean; message: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status === "CANCELLED") return { ok: false, message: "Order is cancelled." };
  if (order.status === "CONFIRMED" && order.paymentMethod === "cod") return { ok: false, message: "Already confirmed." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "Customer opted out." };
  if ((await getSettings()).provider !== "META") return { ok: false, message: "Needs Meta Cloud API." };

  const { open, number, cfg } = await replyContext(c);
  if (!open) return { ok: false, message: "Customer 24h window closed." };

  const ref = orderRef(order);
  const totalFormatted = money(order.total, order.currency);
  const body = `Hello ${firstName(c.name)}, your Cash on Delivery request for ${order.client.name} order ${ref} (${totalFormatted}) is received.\n\nPlease confirm your order below so we can pack and dispatch it for you:`;

  try {
    const res = await sendInteractiveButtons(
      cfg,
      c.phone,
      body,
      [
        { id: `cod_confirm:${order.id}`, title: "✅ Confirm COD" },
        { id: `cod_cancel:${order.id}`, title: "❌ Cancel Order" },
      ],
      { header: "Order Confirmation", footer: "Tap a button to proceed" }
    );
    await logMessage(c.id, "COD Confirmation Prompt", body, res, number?.id ?? null);
    return { ok: true, message: `COD confirmation buttons sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/**
 * Sends a 1-click interactive payment choice prompt for new catalogue carts
 * with "💳 Pay now online" and "🚚 Cash on delivery" buttons when both are available.
 */
export async function sendPaymentChoicePrompt(orderId: string): Promise<{ ok: boolean; message: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status === "CANCELLED") return { ok: false, message: "This order is cancelled." };
  if (order.paidAt || ["PAID", "DISPATCHED", "DELIVERED"].includes(order.status)) return { ok: false, message: "This order is already paid." };
  if (order.total <= 0) return { ok: false, message: "This order has no total." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "Customer opted out." };
  if ((await getSettings()).provider !== "META") return { ok: false, message: "Needs Meta Cloud API." };

  const { open, number, cfg } = await replyContext(c);
  if (!open) return { ok: false, message: "Customer 24h window closed." };

  const items = await itemsWithNames(order);
  const pricing = getOrderPricing(items, order.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(order) });
  const ref = orderRef(order);
  const replaced = /Replaced unpaid cart (\S+)/.exec(order.internalNote ?? "")?.[1];
  const money2 = (n: number) => money(n, order.currency);
  let body = [
    replaced ? `Your earlier cart ${replaced} has been replaced by this one.` : null,
    `${hello(c.name)} here is your ${order.client.name} order ${bold(ref)}.`,
    [
      itemLines(items, order.currency),
      pricing.shipping > 0 ? `Shipping: ${money2(pricing.shipping)}` : null,
      pricing.discount > 0 ? `Loyalty points (${order.pointsRedeemed}): −${money2(pricing.discount)}` : null,
      bold(`Total: ${money2(pricing.total)}`),
    ]
      .filter(Boolean)
      .join("\n"),
    order.addressConfirmedAt && order.note?.trim() ? `📍 Deliver to: ${order.note.trim().slice(0, 300)}` : null,
    "How would you like to pay?",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (body.length > 1024) body = body.slice(0, 1024);

  try {
    const res = await sendInteractiveButtons(
      cfg,
      c.phone,
      body,
      [
        { id: `pay_online:${order.id}`, title: "💳 Pay now online" },
        { id: `pay_cod:${order.id}`, title: "🚚 Cash on delivery" },
      ],
      { header: "Choose how to pay", footer: order.client.name }
    );
    await logMessage(c.id, "Payment choice", body, res, number?.id ?? null);
    return { ok: true, message: `Payment choice sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}


