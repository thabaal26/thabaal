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
import { asPerson, LOYALTY_ORDER_SELECT } from "./linked-numbers";
import { customerWords, flowShips, readFlow } from "./order-flow";
import { money, orderRef } from "./orders";
import { REORDER_RE, handleCartChoice, offerReorder, placeReorder } from "./order-intake";
import { isShopClosed, opensAtText } from "./pay-settings";
import { flowFor, paySettingsFor } from "./pay-settings-server";
import { dueOf } from "./payment-state";
import { logMessage, replyContext, sendPaymentChoicePrompt, textInWindow, updateOrderCard } from "./payments";
import { getSettings } from "./provider";
import { sendInteractiveButtons } from "./whatsapp";
import { bold, hello, nameOf } from "./wa-text";
import { chatAutomation } from "./engine/conversation";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;


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

/**
 * Automatic replies keep quiet for this customer now: staff typed in Chats within the business's staffPauseMinutes
 * (default 2 hours), or staff paused them (lib/engine/conversation.ts).
 */
export async function staffActive(customerId: string, now = new Date()) {
  return (await chatAutomation(customerId, now)).paused;
}

/** Already sent this kind of automatic reply recently (no repeats). */
async function sentRecently(customerId: string, label: string, ms: number) {
  return Boolean(await db.message.findFirst({ where: { customerId, templateName: label, createdAt: { gte: new Date(Date.now() - ms) } }, select: { id: true } }));
}

async function canMessage(c: { id: string; clientId: string; optedOut: boolean }) {
  if (c.optedOut) return false;
  const [settings, ctx] = await Promise.all([getSettings(), replyContext(c)]);
  return settings.provider === "META" && ctx.open;
}

async function shopName(clientId: string) {
  return (await shopInfoFor(clientId)).name;
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

/** At most this many orders in one reply. */
const MAX_LISTED = 5;

/**
 * The customer's orders to talk about, newest first: not cancelled, from the last 14 days, and a delivered one only
 * for 3 days after delivery. A customer often has more than one going at once.
 */
export async function currentOrders(customerId: string) {
  const list = await db.order.findMany({
    where: { customerId, status: { not: "CANCELLED" }, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { customer: true, client: { select: { name: true, orderFlow: true } } },
  });
  return list.filter((o) => !(o.status === "DELIVERED" && (o.deliveredAt ?? o.updatedAt).getTime() < Date.now() - 3 * DAY));
}
/** The newest of them. */
export async function currentOrder(customerId: string) {
  return (await currentOrders(customerId))[0] ?? null;
}
type Current = NonNullable<Awaited<ReturnType<typeof currentOrder>>>;

/**
 * The order a message names, when it names exactly one: "QS-1002", "qs1002", "#1002" or "1002" (the number on its own,
 * not part of a phone number or a longer number). Null when it names none, or several.
 */
export function mentionedOrder<T extends { number: number; ref: string | null }>(text: string, orders: T[]): T | null {
  const t = text.toUpperCase();
  const squashed = t.replace(/[\s#-]/g, "");
  const hits = orders.filter((o) => {
    const ref = orderRef(o).toUpperCase();
    if (squashed.includes(ref.replace(/[\s-]/g, ""))) return true;
    const digits = /(\d+)$/.exec(ref)?.[1];
    return !!digits && digits.length >= 3 && new RegExp(`(^|[^\\d])${digits}([^\\d]|$)`).test(t);
  });
  return hits.length === 1 ? hits[0] : null;
}

/** One line about where the order stands, and what (if anything) the customer should do. */
async function statusText(o: Current): Promise<string | "choice"> {
  const ref = bold(orderRef(o));
  const due = dueOf(o);
  const flow = readFlow(o.client.orderFlow);
  const words = customerWords(flow);
  if (o.status === "DELIVERED") {
    const when = formatInTimeZone(o.deliveredAt ?? o.updatedAt, APP_TZ, "d MMM");
    return `Your order ${ref} was ${words.finished} on ${when}. If anything isn't right, reply here and we'll sort it out.`;
  }
  if (o.status === "DISPATCHED") {
    const sent = o.internalNote?.split("\n").reverse().find((l) => l.startsWith("Dispatched "));
    const details = sent ? `\n\n${sent.replace(/^Dispatched [^:]+:\s*/, "Expected: ")}` : "";
    const cash = o.paymentMethod === "cod" && due > 0 ? `\n\nPlease keep ${bold(money(due, o.currency))} ready for the delivery.` : "";
    return `🚚 Your order ${ref} is on its way.${details}${cash}`;
  }
  if (o.packedAt && flow === "pickup") {
    const cash = o.paymentMethod === "cod" && due > 0 ? ` ${words.cashDue(bold(money(due, o.currency)))}` : "";
    return `Good news! Your order ${ref} is ready for pickup at our shop.${cash}`;
  }
  if (o.packedAt) return `Good news! Your order ${ref} is packed and will be on its way soon. We'll message you when it leaves.`;
  if (o.paidAt || o.status === "PAID" || (o.status === "CONFIRMED" && o.paymentMethod === "cod")) {
    const cash = !flowShips(flow) && o.paymentMethod === "cod" && due > 0 ? ` ${words.cashDue(bold(money(due, o.currency)))}` : "";
    return `Your order ${ref} is confirmed and being prepared. ${words.next}${cash}`;
  }
  if (o.mergeWith) return `Your new order ${ref} is waiting for one answer: please choose in the message above whether to add it to your earlier order or keep it separate.`;
  if (o.addressAskedAt && !o.addressConfirmedAt)
    return `Your order ${ref} is waiting for your delivery address. Please type it here (house/flat no., street, area, city and pincode) or share your location, and we'll pack it right away.`;
  if (o.paymentRequestedAt) return `Your order ${ref} is waiting for payment of ${bold(money(due, o.currency))}. Tap ${bold("Review and pay")} in the message above, and we'll pack it right away.`;
  const choiceSent = await db.message.findFirst({ where: { customerId: o.customerId, templateName: "Payment choice", createdAt: { gte: o.createdAt } }, select: { id: true } });
  if (choiceSent) return "choice";
  return `We've received your order ${ref} and our team will confirm it shortly.`;
}

/**
 * Answers "where is my order?". With one order, its status; with several, all of them in one message (the customer
 * may mean any of them), unless the message names one. Returns true when it replied (or one went out a moment ago).
 */
export async function replyWithStatus(c: Cust, opts: { greeting?: boolean; text?: string } = {}) {
  const all = await currentOrders(c.id);
  if (!all.length) {
    if (opts.greeting) return false; // a plain hello with no order: the catalogue answers it
    if (await sentRecently(c.id, STATUS_REPLY, 10 * MIN)) return true;
    await textInWindow(c, `${hello(c.name)} we couldn't find an open order for this number. If you ordered from another number, please send it here and our team will check.`, STATUS_REPLY);
    return true;
  }
  const named = opts.text ? mentionedOrder(opts.text, all) : null;
  // A hello after delivery is a new conversation: the catalogue answers it, not an old order.
  const list = named ? [named] : opts.greeting ? all.filter((x) => x.status !== "DELIVERED") : all;
  if (!list.length) return false;
  // Asked twice in a row: one answer. Naming a particular order always gets its answer.
  if (!named && (await sentRecently(c.id, STATUS_REPLY, 10 * MIN))) return true;
  if (list.length > 1) {
    const shown = list.slice(0, MAX_LISTED);
    const lines = await Promise.all(
      shown.map(async (x) => {
        const s = await statusText(x);
        return s === "choice" ? `Your order ${bold(orderRef(x))} is ready. Please choose how you'd like to pay in the message about it above.` : s;
      }),
    );
    const head = `${opts.greeting ? `${hello(c.name)} you` : "You"} have ${bold(`${list.length} orders`)} with us right now:`;
    const more = list.length > MAX_LISTED ? `\n\n…and ${list.length - MAX_LISTED} more.` : "";
    const tail = `\n\nAsking about one of them? Send its order number, for example ${bold(orderRef(shown[0]))}.`;
    await textInWindow(c, `${head}\n\n${lines.map((l) => `• ${l}`).join("\n\n")}${more}${tail}`, STATUS_REPLY);
    return true;
  }
  const o = list[0];
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

/** A cancel that may name an order: "cancel QS-1002", "please cancel order 1002". */
const CANCEL_WORD_RE = /\bcancel\w*\b|வேண்டாம்|ரத்து/i;

/** The orders the customer could be asking to cancel, newest first (not on the way yet). */
async function cancellableOrders(customerId: string) {
  return db.order.findMany({
    where: { customerId, status: { in: ["NEW", "CONFIRMED", "PAID"] }, dispatchedAt: null, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { customer: true, client: { select: { name: true } } },
  });
}
type Cancellable = Awaited<ReturnType<typeof cancellableOrders>>[number];

/** The items of an order in a few words, for a list ("Coconut oil 1L × 2, Ghee +1 more"). */
function itemsLine(items: unknown) {
  const list = Array.isArray(items) ? (items as { name?: string; quantity?: number }[]) : [];
  const words = list.slice(0, 2).map((i) => `${i.name ?? "item"}${(i.quantity ?? 1) > 1 ? ` × ${i.quantity}` : ""}`);
  return (words.join(", ") + (list.length > 2 ? ` +${list.length - 2} more` : "")).slice(0, 80) || "your items";
}

/**
 * "cancel" with an order open: confirm first (or tell staff when money is in or it's packed). With several orders it
 * asks which one (a button for each of the newest three), unless the message names one. False: no order to cancel.
 */
export async function handleCancelRequest(c: Cust, text: string) {
  const plain = CANCEL_RE.test(text);
  if (!plain && !CANCEL_WORD_RE.test(text)) return false;
  const open = await cancellableOrders(c.id);
  const named = mentionedOrder(text, open);
  if (!plain && !named) {
    // "cancel 1002" for an order that is already on its way or delivered: say so, and ask staff to call.
    const other = mentionedOrder(text, await currentOrders(c.id));
    if (!other) return false;
    const ref = bold(orderRef(other));
    if (other.status === "DELIVERED") {
      await textInWindow(c, `Your order ${ref} was already delivered. If something isn't right with it, tell us here and our team will sort it out.`, "Cancel request").catch(() => {});
    } else {
      await db.order.update({ where: { id: other.id }, data: { internalNote: appendNote(other.internalNote, `Customer asked to cancel on WhatsApp after dispatch (${today()}): please call them`) } });
      await textInWindow(c, `Your order ${ref} is already on its way, so it can't be cancelled here. Our team will call you to help.`, "Cancel request").catch(() => {});
    }
    return true;
  }
  if (!open.length) return false;
  if (!named && open.length > 1) {
    const shown = open.slice(0, MAX_LISTED);
    const lines = shown.map((x) => `• ${bold(orderRef(x))}: ${bold(money(x.total, x.currency))}, ${itemsLine(x.items)}`).join("\n");
    const others = open.length > 3 ? ` Tap one, or reply ${bold(`cancel ${orderRef(open[3])}`)} for another.` : "";
    await sendButtons(
      c,
      "Cancel request",
      `You have ${open.length} orders that can still be cancelled:\n\n${lines}\n\nWhich one should we cancel?${others}`,
      open.slice(0, 3).map((x) => ({ id: `ocancel_pick:${x.id}`, title: orderRef(x).slice(0, 20) })),
      { header: "Which order?", footer: open[0].client.name },
    );
    return true;
  }
  return confirmCancel(c, named ?? open[0]);
}

/** "Cancel order X?" Yes / No; when it's paid or packed, staff are asked to call instead. */
async function confirmCancel(c: Cust, o: Cancellable) {
  const ref = orderRef(o);
  const paid = Boolean(o.paidAt || (o.paidAmount ?? 0) > 0);
  if (paid || o.packedAt) {
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer asked to cancel on WhatsApp (${today()}): please call them`) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Customer asked to cancel");
    await textInWindow(
      c,
      `${hello(c.name)} your order ${bold(ref)} is already ${paid ? "paid" : customerWords(await flowFor(o.clientId)).packed}, so our team will call you shortly to help with the cancellation${paid ? " and your refund" : ""}.`,
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
    const done = paid ? "paid" : o.packedAt ? `marked ${customerWords(await flowFor(o.clientId)).packed}` : "sent";
    await textInWindow(o.customer, `Your order ${bold(ref)} has just been ${done}, so our team will call you to help with the cancellation.`, "Cancel request").catch(() => {});
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer asked to cancel on WhatsApp (${today()}): please call them`) } });
    return;
  }
  const done = await db.order.updateMany({
    where: { id: o.id, status: { in: ["NEW", "CONFIRMED"] }, paidAt: null, packedAt: null },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "Customer on WhatsApp", paymentReminderAt: new Date(), internalNote: appendNote(o.internalNote, `Cancelled by the customer on WhatsApp (${today()})`) },
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
    select: { id: true, personId: true, name: true, tags: true, purchases: true, client: { select: LOYALTY_RULE_FIELDS }, orders: { select: LOYALTY_ORDER_SELECT } },
  });
  if (c) {
    const l = loyaltyFromOrders(await asPerson(c), { rules: loyaltyRules(c.client) });
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
    case "ocancel_pick": {
      // One of several orders picked to cancel: the usual question for it, if it can still be cancelled.
      const o = (await cancellableOrders(c.id)).find((x) => x.id === id);
      if (o) await confirmCancel(c, o);
      else await textInWindow(c, "That order can't be cancelled here any more. Reply here and our team will help.", "Cancel request").catch(() => {});
      return true;
    }
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
  // The order it's about: the one the message names; else the one they received last; else the newest.
  const recent = await db.order.findMany({ where: { customerId: c.id, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, orderBy: { createdAt: "desc" }, take: 20 });
  const named = mentionedOrder(text, recent);
  const received = recent
    .filter((x) => x.status === "DELIVERED" || x.status === "DISPATCHED")
    .sort((a, b) => (b.deliveredAt ?? b.dispatchedAt ?? b.updatedAt).getTime() - (a.deliveredAt ?? a.dispatchedAt ?? a.updatedAt).getTime());
  const o = named ?? received[0] ?? recent[0];
  if (o) {
    await db.order.update({ where: { id: o.id }, data: { internalNote: appendNote(o.internalNote, `Customer reported a problem on WhatsApp (${today()}): "${text.trim().slice(0, 160)}"`) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", "Customer reported a problem");
  }
  if (!named && (await sentRecently(c.id, PROBLEM_REPLY, 2 * HOUR))) return true;
  // Several orders lately: say which one it was noted on, so they can correct it.
  const which = o && recent.length > 1 ? `\n\nWe've noted it on your order ${bold(orderRef(o))}.${named ? "" : " If it's about a different order, send its order number."}` : "";
  await textInWindow(c, `${problemText(shop, c.name, opensAt)}${which}`, PROBLEM_REPLY).catch(() => {});
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
    const all = await currentOrders(c.id);
    const named = mentionedOrder(text, all);
    // Still on its way (or being prepared): the honest answer is where it is. Delivered but not received: a problem.
    if (named ? named.status !== "DELIVERED" : all.some((x) => x.status !== "DELIVERED")) return replyWithStatus(c, { text });
    return reportProblem(c, text, opensAt);
  }
  if (intent === "problem") return reportProblem(c, text, opensAt);

  if (intent === "human") {
    await addTag(c, "callback");
    const shop = await shopInfoFor(c.clientId);
    return once(c, CALL_REPLY, 2 * HOUR, () => humanText(shop, c.name, opensAt));
  }
  if (isText && STATUS_RE.test(text)) return replyWithStatus(c, { text });
  // Just an order number ("QS-1002?", "1002 enna aachu"): that order's status.
  if (isText && !intent && mentionedOrder(text, await currentOrders(c.id))) return replyWithStatus(c, { text });

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
