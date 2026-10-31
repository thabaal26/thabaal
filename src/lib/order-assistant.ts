// Thabaal's WhatsApp order assistant: the automatic replies every shop gets, written one way so they read as a
// professional business. Each answers one situation and asks for one thing.
//   • "Where is my order?" (or "hi" while an order is open)  → the order's real status
//   • "cancel"                                                → "Cancel order X?" Yes / No (staff are told when it's paid or packed)
//   • delivered message buttons                               → "All good" (points) / "Report a problem" (staff alerted)
//   • "wrong number" / "who is this?"                         → really opted out / a short introduction
//   • a typed list or a voice note                            → "our team will put your order together"
//   • outside shop hours                                      → once a night, when the shop opens
//   • "Reorder" / "same order"                                → "Same as last time?" (lib/order-intake.ts)
//    "damaged", "wrong item", "refund"                        → sorry, a photo please; staff see it on the order, offers pause
//    "not received" after delivery                            → the same (still on its way: the order's status)
//    "call me", "customer care"                               → someone will call; the shop's number if saved
//    hours, delivery, payment, where the shop is              → answered from the shop's own settings
//    "thank you" / "ok" / a sticker                           → a short "you're welcome" / nothing
//    anything else                                            → "our team will reply shortly" (once in 6 hours)
//    "hi"                                                     → the shop's welcome with its catalogue (lib/catalog.ts)
// While staff are chatting with a customer (a typed reply in the last 2 hours), these automatic replies pause.
import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import {
  deliveryText,
  hoursText,
  humanText,
  intentOf,
  locationText,
  paymentText,
  problemText,
  receivedText,
  thanksText,
} from "./assistant-intents";
import { sendCatalogueTo, shopInfoFor, type CatalogueTrigger } from "./catalog";
import { db } from "./db";
import { APP_TZ } from "./format";
import { pushOrderToSheet } from "./google-sheets-live";
import { loyaltyFromOrders, loyaltyRules, LOYALTY_RULE_FIELDS } from "./loyalty";
import { money, orderRef } from "./orders";
import { REORDER_RE, handleCartChoice, offerReorder, placeReorder } from "./order-intake";
import { isShopClosed, opensAtText } from "./pay-settings";
import { paySettingsFor } from "./pay-settings-server";
import { dueOf } from "./payment-state";
import { logMessage, replyContext, sendPaymentChoicePrompt, textInWindow, updateOrderCard } from "./payments";
import { getSettings } from "./provider";
import { sendInteractiveButtons } from "./whatsapp";
import { bold, hello, nameOf } from "./wa-text";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Messages staff typed in Chats (or sent from an order); automatic replies stay quiet for a while after one. */
const STAFF_LABELS = ["Typed reply", "Media reply"];
const STAFF_QUIET_MS = 2 * HOUR;

export const STATUS_REPLY = "Order status";
export const CLOSED_REPLY = "Closed reply";
export const LIST_REPLY = "Order by message";
export const WHO_REPLY = "Introduction";
export const PROBLEM_REPLY = "Problem reported";
export const CALL_REPLY = "Call request";
export const INFO_REPLY = "Shop info";
export const THANKS_REPLY = "Thank you";
export const RECEIVED_REPLY = "Auto reply";

type Cust = { id: string; clientId: string; phone: string; name: string; optedOut: boolean; tags?: string[] };

/** Staff are talking to this customer right now. */
export async function staffActive(customerId: string, now = new Date()) {
  return Boolean(await db.message.findFirst({ where: { customerId, templateName: { in: STAFF_LABELS }, createdAt: { gte: new Date(now.getTime() - STAFF_QUIET_MS) } }, select: { id: true } }));
}

/** Already sent this kind of automatic reply recently (no repeats). */
async function sentRecently(customerId: string, label: string, ms: number) {
  return Boolean(await db.message.findFirst({ where: { customerId, templateName: label, createdAt: { gte: new Date(Date.now() - ms) } }, select: { id: true } }));
}

async function canMessage(c: { id: string; clientId: string; optedOut: boolean }) {
  if (c.optedOut || (await getSettings()).provider !== "META") return false;
  return (await replyContext(c)).open;
}

async function shopName(clientId: string) {
  return (await db.client.findUnique({ where: { id: clientId }, select: { name: true } }))?.name ?? "our shop";
}

async function sendButtons(c: Cust, label: string, body: string, buttons: { id: string; title: string }[], opts: { header?: string; footer?: string } = {}) {
  const { number, cfg } = await replyContext(c);
  const res = await sendInteractiveButtons(cfg, c.phone, body, buttons, opts);
  await logMessage(c.id, label, body, res, number?.id ?? null);
}

const appendNote = (prev: string | null, line: string) => [prev, line].filter(Boolean).join("\n").slice(0, 1000);
const today = () => formatInTimeZone(new Date(), APP_TZ, "d MMM, h:mm a");

/* ---------- Order status ---------- */

/** "Where is my order", "order status", "when will it come", "delivery eppo", "எப்போ வரும்"… */
export const STATUS_RE =
  /\b(where|when|status|track|tracking|update)\b[^.?!]*\b(order|parcel|delivery|package|items?)\b|\b(order|parcel|delivery)\b[^.?!]*\b(status|where|when|update|come|reach|arrive)\b|\b(enga|eppo|eppa|epo|eppadi)\b[^.?!]*\b(order|parcel|varum|irukku)\b|\border\s+(enna\s+)?(aachu|achu|aayiduchu)\b|எப்போ\s*வரும்|எங்கே|ஆர்டர்\s*என்ன/i;

/** The customer's order to talk about: the newest one that isn't cancelled, or was delivered in the last 3 days. */
export async function currentOrder(customerId: string) {
  const o = await db.order.findFirst({
    where: { customerId, status: { not: "CANCELLED" }, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
    orderBy: { createdAt: "desc" },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!o) return null;
  if (o.status === "DELIVERED" && (o.deliveredAt ?? o.updatedAt).getTime() < Date.now() - 3 * DAY) return null;
  return o;
}
type Current = NonNullable<Awaited<ReturnType<typeof currentOrder>>>;

/** One line about where the order stands, and what (if anything) the customer should do. */
async function statusText(o: Current): Promise<string | "choice"> {
  const ref = bold(orderRef(o));
  const due = dueOf(o);
  if (o.status === "DELIVERED") {
    const when = formatInTimeZone(o.deliveredAt ?? o.updatedAt, APP_TZ, "d MMM");
    return `Your order ${ref} was delivered on ${when}. If anything isn't right, reply here and we'll sort it out.`;
  }
  if (o.status === "DISPATCHED") {
    const sent = o.internalNote?.split("\n").reverse().find((l) => l.startsWith("Dispatched "));
    const details = sent ? `\n\n${sent.replace(/^Dispatched [^:]+:\s*/, "Expected: ")}` : "";
    const cash = o.paymentMethod === "cod" && due > 0 ? `\n\nPlease keep ${bold(money(due, o.currency))} ready for the delivery.` : "";
    return `🚚 Your order ${ref} is on its way.${details}${cash}`;
  }
  if (o.packedAt) return `Good news! Your order ${ref} is packed and will be on its way soon. We'll message you when it leaves.`;
  if (o.paidAt || o.status === "PAID" || (o.status === "CONFIRMED" && o.paymentMethod === "cod"))
    return `Your order ${ref} is confirmed and being prepared. We'll message you as soon as it's on the way.`;
  if (o.mergeWith) return `Your new order ${ref} is waiting for one answer: please choose in the message above whether to add it to your earlier order or keep it separate.`;
  if (o.addressAskedAt && !o.addressConfirmedAt)
    return `Your order ${ref} is waiting for your delivery address. Please type it here (house/flat no., street, area, city and pincode) or share your location, and we'll pack it right away.`;
  if (o.paymentRequestedAt) return `Your order ${ref} is waiting for payment of ${bold(money(due, o.currency))}. Tap ${bold("Review and pay")} in the message above, and we'll pack it right away.`;
  const choiceSent = await db.message.findFirst({ where: { customerId: o.customerId, templateName: "Payment choice", createdAt: { gte: o.createdAt } }, select: { id: true } });
  if (choiceSent) return "choice";
  return `We've received your order ${ref} and our team will confirm it shortly.`;
}

/** Answers "where is my order?". Returns true when it replied (or a reply went out a moment ago). */
export async function replyWithStatus(c: Cust, opts: { greeting?: boolean } = {}) {
  const o = await currentOrder(c.id);
  if (!o) {
    if (opts.greeting) return false; // a plain hello with no order: the catalogue answers it
    if (await sentRecently(c.id, STATUS_REPLY, 10 * MIN)) return true;
    await textInWindow(c, `${hello(c.name)} we couldn't find an open order for this number. If you ordered from another number, please send it here and our team will check.`, STATUS_REPLY);
    return true;
  }
  // A hello after delivery is a new conversation: the catalogue answers it, not an old order.
  if (opts.greeting && o.status === "DELIVERED") return false;
  if (await sentRecently(c.id, STATUS_REPLY, 10 * MIN)) return true;
  const text = await statusText(o);
  if (text === "choice") {
    const r = await sendPaymentChoicePrompt(o.id);
    if (r.ok) return true;
    await textInWindow(c, `Your order ${bold(orderRef(o))} is ready. Please choose how you'd like to pay in the message above.`, STATUS_REPLY);
    return true;
  }
  await textInWindow(c, opts.greeting ? `${hello(c.name)} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text, STATUS_REPLY);
  return true;
}

/* ---------- Cancel ---------- */

export const CANCEL_RE =
  /^\s*(please\s+)?(cancel|cancel\s+(my|the|this)\s+order|cancel\s+order|order\s+cancel|i\s+want\s+to\s+cancel(\s+(my|the|this))?(\s+order)?|cancel\s+pannunga|cancel\s+pannu|cancel\s+it|venaam|vendam|வேண்டாம்|ரத்து\s*செய்)\s*(please|pls)?\s*[.!]*\s*$/i;

/** The newest order the customer could be asking to cancel. */
async function cancellableOrder(customerId: string) {
  return db.order.findFirst({
    where: { customerId, status: { in: ["NEW", "CONFIRMED", "PAID"] }, dispatchedAt: null, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
    orderBy: { createdAt: "desc" },
    include: { customer: true, client: { select: { name: true } } },
  });
}

/** "cancel" with an order open: confirm first (or tell staff when money is in or it's packed). False: no order to cancel. */
export async function handleCancelRequest(c: Cust, text: string) {
  if (!CANCEL_RE.test(text)) return false;
  const o = await cancellableOrder(c.id);
  if (!o) return false;
  const ref = orderRef(o);
  const paid = Boolean(o.paidAt || (o.paidAmount ?? 0) > 0);
  if (paid || o.packedAt) {
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer asked to cancel on WhatsApp (${today()}): please call them`) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Customer asked to cancel");
    await textInWindow(
      c,
      `${hello(c.name)} your order ${bold(ref)} is already ${paid ? "paid" : "packed"}, so our team will call you shortly to help with the cancellation${paid ? " and your refund" : ""}.`,
      "Cancel request",
    ).catch(() => {});
    return true;
  }
  await sendButtons(
    c,
    "Cancel request",
    `Do you want to cancel order ${bold(ref)} (${bold(money(o.total, o.currency))})?`,
    [
      { id: `ocancel_yes:${o.id}`, title: "Yes, cancel it" },
      { id: `ocancel_no:${o.id}`, title: "No, keep it" },
    ],
    { header: "Cancel this order?", footer: o.client.name },
  );
  return true;
}

async function answerCancel(customerId: string, orderId: string, yes: boolean) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!o || o.customerId !== customerId) return;
  const ref = orderRef(o);
  if (!yes) {
    if (o.status !== "CANCELLED") await textInWindow(o.customer, `Great! We'll keep order ${bold(ref)} going. 👍`, "Cancel request").catch(() => {});
    return;
  }
  if (o.status === "CANCELLED") return; // a second tap
  const paid = Boolean(o.paidAt || (o.paidAmount ?? 0) > 0);
  if (paid || o.packedAt || o.dispatchedAt) {
    await textInWindow(o.customer, `Your order ${bold(ref)} has just been ${paid ? "paid" : "packed"}, so our team will call you to help with the cancellation.`, "Cancel request").catch(() => {});
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer asked to cancel on WhatsApp (${today()}): please call them`) } });
    return;
  }
  const done = await db.order.updateMany({
    where: { id: o.id, status: { in: ["NEW", "CONFIRMED"] }, paidAt: null, packedAt: null },
    data: { status: "CANCELLED", paymentReminderAt: new Date(), internalNote: appendNote(o.internalNote, `Cancelled by the customer on WhatsApp (${today()})`) },
  });
  if (!done.count) return;
  pushOrderToSheet(o.id, "ORDER_UPDATE", "Cancelled by the customer");
  const points = o.pointsRedeemed > 0 ? ` Your ${o.pointsRedeemed} loyalty points are back in your account.` : "";
  const text = `Your order ${bold(ref)} is cancelled.${points}\n\nWhenever you need anything, just send us a message. 🙏`;
  const onCard = await updateOrderCard(o, "canceled", text, "Order cancelled").catch(() => false);
  if (!onCard) await textInWindow(o.customer, text, "Order cancelled").catch(() => {});
}

/* ---------- After delivery ---------- */

export const FEEDBACK_ASK = "Delivered";

async function answerFeedback(customerId: string, orderId: string, good: boolean) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!o || o.customerId !== customerId) return;
  const ref = orderRef(o);
  const mark = good ? "Customer said all good" : "Customer reported a problem";
  if (o.internalNote?.includes(mark)) return; // a second tap
  await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `${mark} (${today()})`) } });
  if (!good) {
    await db.customer.update({ where: { id: o.customerId }, data: { tags: Array.from(new Set([...o.customer.tags, "issue-open"])) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Customer reported a problem");
    await textInWindow(
      o.customer,
      `We're sorry about that${nameOf(o.customer.name) ? `, ${nameOf(o.customer.name)}` : ""}. Please send a photo and tell us what went wrong with order ${bold(ref)}. Our team will sort it out for you today.`,
      "Problem reported",
    ).catch(() => {});
    return;
  }
  let pointsLine = "";
  const c = await db.customer.findUnique({
    where: { id: o.customerId },
    select: { name: true, tags: true, purchases: true, client: { select: LOYALTY_RULE_FIELDS }, orders: { select: { id: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, pointsRedeemed: true } } },
  });
  if (c) {
    const l = loyaltyFromOrders(c, { rules: loyaltyRules(c.client) });
    if (l.totalPoints > 0) pointsLine = `\n\nYou now have ${bold(`${l.totalPoints} loyalty points`)}${l.redeemableRupees > 0 ? `, worth ${bold(money(l.redeemableRupees))} off your next order` : ""}.`;
  }
  await textInWindow(o.customer, `Thank you${nameOf(o.customer.name) ? `, ${nameOf(o.customer.name)}` : ""}! 🙏 We're glad everything arrived well.${pointsLine}`, "Thank you").catch(() => {});
}

/* ---------- Who / wrong number ---------- */

const WRONG_RE = /\b(wrong\s*number|wrong\s*person|not\s*me|not\s*my\s*number|thappana\s*number|thappa\s*vandhirukku)\b|தவறான\s*எண்/i;
const WHO_RE = /^\s*(who\s*(is\s*this|are\s*you|is\s*it|r\s*u)|who\s*r\s*u|yaar\s*idhu|yaaru|yaar\s*neenga|யார்\s*இது|யாரு)\s*[?.!]*\s*$/i;

/* ---------- Typed lists and voice notes ---------- */

const LIST_RE = /\b\d+(\.\d+)?\s*(kg|kgs|g|gm|gms|grams?|l|ltr|ltrs|litres?|liters?|ml|pcs?|pieces?|packets?|pkts?|nos?|bottles?|tins?|cans?|dozen|box(es)?)\b|\b(x|×)\s*\d+\b|\b\d+\s*(x|×)\b/i;

/* ---------- Buttons ---------- */

/** Handles the assistant's own buttons. Returns true when the tap was one of them. */
export async function handleAssistantButton(c: Cust, actionVal: string, text: string, waMessageId?: string) {
  const [kind, id] = [actionVal.split(":")[0], actionVal.split(":")[1] ?? ""];
  switch (kind) {
    case "cart_add":
    case "cart_sep":
      await handleCartChoice(c.id, actionVal);
      return true;
    case "ocancel_yes":
    case "ocancel_no":
      await answerCancel(c.id, id, kind === "ocancel_yes");
      return true;
    case "fb_ok":
    case "fb_bad":
      await answerFeedback(c.id, id, kind === "fb_ok");
      return true;
    case "reorder_yes":
      await placeReorder(c.id, id, waMessageId);
      return true;
    case "reorder_change":
      await sendCatalogueTo(c.id);
      return true;
  }
  // Template quick replies: "Reorder" on a refill reminder, "Stop promotions" on an offer.
  if (REORDER_RE.test(text)) {
    if (!(await offerReorder(c.id))) await sendCatalogueTo(c.id);
    return true;
  }
  if (/^\s*stop\s+(promotions?|offers?|marketing)\s*$/i.test(text)) {
    await db.customer.update({ where: { id: c.id }, data: { tags: Array.from(new Set([...(c.tags ?? []), "no-offers"])) } });
    await textInWindow(c, `Done. You won't receive offers from ${await shopName(c.clientId)} anymore. Messages about your orders will still reach you.`, "Offers stopped").catch(() => {});
    return true;
  }
  return false;
}

/* ---------- Typed messages ---------- */

type Inbound = { type?: string };
type Tagged = Cust & { tags?: string[] };

const addTag = (c: Tagged, tag: string) =>
  db.customer.update({ where: { id: c.id }, data: { tags: Array.from(new Set([...(c.tags ?? []), tag])) } }).catch(() => {});

/**
 * Something went wrong with what they received: one sorry (not repeated within 2 hours), the problem noted on their
 * latest order for staff, the customer tagged so offers pause until it's sorted.
 */
async function reportProblem(c: Tagged, text: string, opensAt: string | null) {
  const shop = await shopInfoFor(c.clientId);
  await addTag(c, "issue-open");
  const o = await db.order.findFirst({ where: { customerId: c.id, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, orderBy: { createdAt: "desc" } });
  if (o) {
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer reported a problem on WhatsApp (${today()}): "${text.trim().slice(0, 160)}"`) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Customer reported a problem");
  }
  if (await sentRecently(c.id, PROBLEM_REPLY, 2 * HOUR)) return true;
  await textInWindow(c, problemText(shop, c.name, opensAt), PROBLEM_REPLY).catch(() => {});
  return true;
}

/** Sends a reply once, unless the same kind went out in the last `ms` (a double message gets one answer). */
async function once(c: Cust, label: string, ms: number, body: () => string | Promise<string>) {
  if (await sentRecently(c.id, label, ms)) return true;
  await textInWindow(c, await body(), label).catch(() => {});
  return true;
}

/**
 * Automatic replies to what the customer typed or sent (not carts, payments or the address, handled earlier).
 * Returns true when it answered (or chose to stay quiet), so the catalogue doesn't also go out; false leaves a hello
 * or a request for products to the catalogue (the caller sends it for `trigger`).
 */
export async function handleAssistantText(
  c: Tagged,
  m: Inbound,
  text: string,
  kind: string,
  opts: { greeting: boolean; staff?: boolean; trigger?: CatalogueTrigger | null },
) {
  if (!(await canMessage(c))) return false;
  const isText = m.type === "text";

  // Wrong number: really stop every message, after one apology.
  if (isText && WRONG_RE.test(text)) {
    await textInWindow(c, `Sorry for the trouble. We've removed this number, and you won't receive messages from us again.`, "Wrong number").catch(() => {});
    await db.customer.update({ where: { id: c.id }, data: { optedOut: true, tags: Array.from(new Set([...(c.tags ?? []), "wrong-number"])) } });
    return true;
  }
  if (opts.staff) return false; // staff are chatting: no automatic replies (the caller decides about the catalogue)

  // "Ok", "seri", 👍, a sticker or a reaction: an acknowledgement, nothing to answer.
  const intent = isText ? intentOf(text) : null;
  if (intent === "ack" || m.type === "sticker" || m.type === "reaction") return true;

  if (isText && REORDER_RE.test(text)) {
    if (!(await offerReorder(c.id))) await sendCatalogueTo(c.id);
    return true;
  }
  if (isText && WHO_RE.test(text)) {
    if (await sentRecently(c.id, WHO_REPLY, DAY)) return true;
    await textInWindow(
      c,
      `${hello(c.name)} this is ${bold(await shopName(c.clientId))} on WhatsApp. 👋 You're receiving our messages because you've shopped with us or joined our list.\n\nReply ${bold("STOP")} anytime if you'd rather not hear from us.`,
      WHO_REPLY,
    ).catch(() => {});
    await addTag(c, "asked-who");
    return true;
  }

  const pay = await paySettingsFor(c.clientId);
  const closed = isShopClosed(pay.settings);
  const opensAt = closed ? opensAtText(pay.settings) : null;

  // Something wrong with an order comes before everything else: it's the message that loses a customer if ignored.
  if (intent === "notArrived") {
    const o = await currentOrder(c.id);
    // Still on its way (or being prepared): the honest answer is where it is. Delivered but not received: a problem.
    if (o && o.status !== "DELIVERED") return replyWithStatus(c);
    return reportProblem(c, text, opensAt);
  }
  if (intent === "problem") return reportProblem(c, text, opensAt);

  if (intent === "human") {
    await addTag(c, "callback");
    const shop = await shopInfoFor(c.clientId);
    return once(c, CALL_REPLY, 2 * HOUR, () => humanText(shop, c.name, opensAt));
  }
  if (isText && STATUS_RE.test(text)) return replyWithStatus(c);

  // Questions the shop's own settings answer: hours, delivery, payment, where the shop is.
  if (intent === "hours" || intent === "delivery" || intent === "payment" || intent === "location") {
    const shop = await shopInfoFor(c.clientId);
    const p = pay.settings;
    const body =
      intent === "hours"
        ? hoursText(shop, p, closed)
        : intent === "delivery"
          ? deliveryText(shop, p)
          : intent === "payment"
            ? paymentText(shop, p, { waPay: pay.waPay, upi: pay.upi })
            : locationText(shop, opensAt);
    return once(c, `${INFO_REPLY}: ${intent}`, 30 * MIN, () => body);
  }
  // A thank-you gets one warm line; a second within 6 hours, nothing.
  if (intent === "thanks") {
    const shop = await shopInfoFor(c.clientId);
    return once(c, THANKS_REPLY, 6 * HOUR, () => thanksText(shop, c.name));
  }

  if (isText && opts.greeting && (await replyWithStatus(c, { greeting: true }))) return true;

  // A hello or a request for products at night: the catalogue's welcome says when the shop opens (one message).
  if (opts.trigger) return false;

  // An order written out, or spoken, photographed or filmed: staff build it from the chat.
  const when = opensAt ? `as soon as we open at ${bold(opensAt)}` : "shortly";
  const media = m.type === "audio" ? "voice message" : m.type === "image" ? "photo" : m.type === "video" ? "video" : m.type === "document" ? "file" : null;
  if ((isText && LIST_RE.test(text)) || media) {
    if (await sentRecently(c.id, LIST_REPLY, 2 * HOUR)) return true;
    const body = media
      ? `Thank you for the ${media}${nameOf(c.name) ? `, ${nameOf(c.name)}` : ""}! Our team will ${media === "voice message" ? "listen" : "take a look"} and reply ${when}.`
      : `Thank you${nameOf(c.name) ? `, ${nameOf(c.name)}` : ""}! 🙏 Our team will put your order together and send it here for you to confirm${opensAt ? ` ${when}` : ""}.\n\nPrefer to choose yourself? Just say ${bold("catalogue")} and we'll send it.`;
    await textInWindow(c, body, LIST_REPLY).catch(() => {});
    return true;
  }

  // Outside shop hours: one reply a night, then quiet until the team is back (no repeats on every message).
  if (closed) {
    if (!(await sentRecently(c.id, CLOSED_REPLY, 10 * HOUR))) {
      const shop = await shopInfoFor(c.clientId);
      await textInWindow(
        c,
        `Thank you for your message! 🌙\n\n${bold(shop.name)} is closed right now. We open at ${bold(opensAt ?? opensAtText(pay.settings))} and will reply first thing.${shop.catalogue ? "\n\nYou can still browse our catalogue and send your order anytime." : ""}`,
        CLOSED_REPLY,
      ).catch(() => {});
    }
    return true;
  }

  // Anything else: received, and the team will reply (once in 6 hours, so a conversation isn't interrupted).
  void kind;
  const shop = await shopInfoFor(c.clientId);
  return once(c, RECEIVED_REPLY, 6 * HOUR, () => receivedText(shop, c.name, opensAt));
}

/** Records where a customer came from (a Click-to-WhatsApp ad, or a "(via web)" style link text) as a src: tag, once. */
export async function noteSource(customerId: string, m: { referral?: { source_type?: string; source_url?: string; headline?: string } }, text: string) {
  let src: string | null = null;
  if (m.referral) src = m.referral.source_type === "ad" ? "ad" : (m.referral.source_type ?? "ad").toLowerCase();
  else {
    const hit = /\((?:via\s+)?(web|website|insta|instagram|facebook|fb|google|qr|youtube)\)/i.exec(text);
    if (hit) src = { website: "web", insta: "instagram", fb: "facebook" }[hit[1].toLowerCase()] ?? hit[1].toLowerCase();
  }
  if (!src) return;
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { tags: true, optInSource: true } });
  if (!c || c.tags.some((t) => t.startsWith("src:"))) return;
  const label = src === "ad" ? `WhatsApp ad${m.referral?.headline ? `: ${m.referral.headline}` : ""}` : `Chat link (${src})`;
  await db.customer.update({ where: { id: customerId }, data: { tags: [...c.tags, `src:${src}`], ...(c.optInSource ? {} : { optInSource: label.slice(0, 120) }) } });
}

/**
 * Customers an offer shouldn't reach right now: they asked for no offers, reported a problem in the last
 * 14 days, or have an order in progress (an offer in the middle of an order looks careless).
 */
export async function busyForOffers(customerIds: string[], now = new Date()) {
  const out = new Map<string, string>();
  if (!customerIds.length) return out;
  const since = new Date(now.getTime() - 14 * DAY);
  for (const c of await db.customer.findMany({ where: { id: { in: customerIds }, tags: { has: "no-offers" } }, select: { id: true } }))
    out.set(c.id, "Asked for no offers");
  const orders = await db.order.findMany({
    where: { customerId: { in: customerIds }, OR: [{ status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] }, createdAt: { gte: since } }, { internalNote: { contains: "Customer reported a problem" }, updatedAt: { gte: since } }] },
    select: { customerId: true, status: true, internalNote: true },
  });
  for (const o of orders) {
    if (out.has(o.customerId)) continue;
    out.set(o.customerId, o.internalNote?.includes("Customer reported a problem") && ["DELIVERED", "CANCELLED"].includes(o.status) ? "Reported a problem with an order" : "Has an order in progress");
  }
  return out;
}
