// What a customer's WhatsApp message is about, and the words of the automatic replies that depend only on the
// shop's own details and settings. Pure (no database, no Meta), so every wording and every match is unit-tested;
// lib/order-assistant.ts decides when each one goes out. Every reply names the shop it comes from, asks for at
// most one thing, carries at most one emoji, and never promises what the shop's settings don't say.
import { money } from "./orders";
import type { PaySettings } from "./pay-settings";
import { bold, nameOf } from "./wa-text";

export type Intent = "problem" | "notArrived" | "human" | "hours" | "delivery" | "payment" | "location" | "thanks" | "ack";

/** Something went wrong with what they got: damaged, wrong, missing, bad quality, or they want a refund. */
export const PROBLEM_RE =
  /\b(damag\w*|broken|leak\w*|spoil\w*|expired|rotten|stale|torn|missing|defect\w*|wrong\s+(item|items|product|products|order|size|colou?r|quantity|qty)|bad\s+(quality|smell|taste|product|condition)|poor\s+quality|not\s+(working|fresh|good|ok|okay)|complain\w*|refund|replace(ment)?|exchange|return\s+(it|this|the|my)|problem|issue|odanji\w*|udanji\w*|kettu\s*poch\w*|nalla\s*illa)\b|சேதம்|உடைந்|புகார்|கெட்டு/i;
/** "No problem", "no issues": a thank-you, not a complaint. */
const NOT_A_PROBLEM_RE = /\bno\s+(problem|problems|issue|issues)\b/i;

/** The order hasn't reached them. With an order on its way this is a status question; after delivery, a problem. */
export const NOT_ARRIVED_RE =
  /\b(not\s+(yet\s+)?(received|delivered|arrived|come|came)|didn'?t\s+(get|receive|come|arrive)|did\s+not\s+(get|receive|come|arrive)|haven'?t\s+(got|received)|never\s+(came|arrived|received)|still\s+waiting|innum\s+(varala|varalai|vandhudala)|varave\s+illa|kedaikala|kidaikala)\b|வரவில்லை|கிடைக்கவில்லை/i;

/** They want a person: a call back, customer care, the shop's number. */
export const HUMAN_RE =
  /\b(call\s+me|call\s+back|callback|give\s+(me\s+)?a\s+call|talk\s+to\s+(a\s+|the\s+|some\s*)?(person|human|one|someone|agent|staff|owner|manager)|speak\s+(to|with)|customer\s+(care|support|service)|executive|real\s+person|contact\s+(number|no)|your\s+(phone|mobile|contact)\s+(number|no)|call\s+pannunga|call\s+panunga|phone\s+pannunga|pesa\s+mudiyuma|pesanum)\b|அழைக்க|பேச\s*வேண்டும்/i;

/** When the shop is open. */
export const HOURS_RE =
  /\b(timings?|opening\s+(hours|time)|working\s+hours|business\s+hours|shop\s+hours|what\s+time\s+(do|does|is|are)|are\s+you\s+open|is\s+(the\s+)?(shop|store)\s+open|open\s+(today|now|tomorrow|on\s+sundays?)|closing\s+time|close\s+at|kadai\s+(eppo|epo)\s+(open|thirakk\w*))\b|நேரம்/i;

/** Whether, where and how they deliver. */
export const DELIVERY_RE =
  /\b(do\s+you\s+(deliver|ship)|can\s+you\s+deliver|deliver(y)?\s+(available|possible|charges?|fee|fees|cost|area|areas|to|in)|home\s+delivery|door\s+delivery|free\s+delivery|shipping|ship\s+to|courier\s+(available|charges?)|deliver\s+pannuveengala|delivery\s+(irukka|irukkaa|undu|undaa))\b/i;

/** How they can pay (a question, not "I paid on GPay", which is handled as a payment before this). */
export const PAYMENT_Q_RE =
  /\b(how\s+(to|can\s+i|do\s+i|should\s+i)\s+pay|payment\s+(options?|methods?|modes?)|(is\s+)?(cod|cash\s+on\s+delivery)\s+(available|possible|ok|irukka|irukkaa|undu|undaa)|do\s+you\s+(accept|take)|can\s+i\s+pay|(gpay|google\s*pay|phone\s*pe|phonepe|paytm|upi|card|cards)\s+(available|accepted|ok|irukka|possible))\b|^\s*(cod|cash\s+on\s+delivery)\s*\?+\s*$/i;

/** Where the shop is. */
export const LOCATION_RE =
  /\b(where\s+is\s+(your|the)\s+(shop|store|office|outlet)|where\s+are\s+you\s+located|(shop|store|your)\s+(address|location)|send\s+(your\s+|the\s+)?(shop\s+)?location|kadai\s+(enga|engey|engu)|address\s+(enna|sollunga))\b|கடை\s*எங்கே/i;

/** "Thank you", "thanks", "tq", "nandri" on its own. */
export const THANKS_RE = /^\s*((thanks?|thank\s*(you|u)|thanx|thnx|thx|tq|ty|tnx|tysm|many\s+thanks|nandri|nanri)\b|நன்றி)|\b(thanks|thank\s*(you|u))\b/i;

/** "Ok", "seri", "👍" and the like: an acknowledgement that needs no reply. */
export const ACK_RE =
  /^\s*(ok+|okay|okey|oky|k+|fine|sure|done|noted|alright|all\s+right|got\s+it|seri|sari|sariyaa|sari\s+ok|hmm+|hm+|ya+|yes|yeah|yep|no\s+problem|np|cool|great|nice|super|good|perfect)[\s!.\p{Extended_Pictographic}‍️]*$/iu;
/** Only emoji, stickers' text or punctuation. */
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\s!.?]+$/u;

/** What a typed message is about, or null when it's none of these (greetings, catalogue and order words included). */
export function intentOf(text: string): Intent | null {
  const t = text.trim();
  if (!t) return null;
  if (EMOJI_ONLY_RE.test(t) || ACK_RE.test(t)) return "ack";
  if (NOT_ARRIVED_RE.test(t)) return "notArrived";
  if (PROBLEM_RE.test(t) && !NOT_A_PROBLEM_RE.test(t)) return "problem";
  if (HUMAN_RE.test(t)) return "human";
  if (PAYMENT_Q_RE.test(t)) return "payment";
  if (DELIVERY_RE.test(t)) return "delivery";
  if (HOURS_RE.test(t)) return "hours";
  if (LOCATION_RE.test(t)) return "location";
  if (THANKS_RE.test(t) && t.length <= 60 && !t.includes("?")) return "thanks";
  return null;
}

/* ---------- Replies ---------- */

/** The shop, for the wording: its name, tagline and contact details as saved in Settings. */
export type ShopInfo = {
  name: string;
  tagline?: string | null;
  homeCity?: string | null;
  supportPhone?: string | null;
  website?: string | null;
  orderFlow?: string | null;
  /** The shop shows its WhatsApp catalogue (the Catalogue section isn't turned off). */
  catalogue: boolean;
};

/** ", Meena" or "" for a customer known only by their number. */
const comma = (name: string) => (nameOf(name) ? `, ${nameOf(name)}` : "");
/** "9:30 PM" from "21:30". */
export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** When the team will answer: "shortly", or "as soon as we open at 9:00 AM" at night. */
export const whenTeam = (closedOpensAt: string | null) => (closedOpensAt ? `as soon as we open at ${bold(closedOpensAt)}` : "shortly");
const browseHint = (shop: ShopInfo) => (shop.catalogue ? `\n\nTo browse meanwhile, just say ${bold("catalogue")}.` : "");

/**
 * The welcome on a hello. A first-time customer is welcomed to the shop by name; someone who has ordered before
 * is welcomed back (and offered their last order again). With a catalogue it sits on the "View catalog" message.
 */
export function welcomeText(shop: ShopInfo, name: string, o: { returning: boolean; canReorder: boolean; withCatalogue: boolean; closedOpensAt?: string | null }) {
  const n = nameOf(name);
  const tag = shop.tagline?.trim() ? `\n_${shop.tagline.trim().replace(/_/g, "")}_` : "";
  const head = o.returning
    ? `Welcome back${n ? `, ${n}` : ""}! 👋 Lovely to hear from you again at ${bold(shop.name)}.`
    : `${n ? `Hi ${n}! ` : "Hi! "}👋 Welcome to ${bold(shop.name)}.${tag}`;
  const reorder = o.canReorder ? ` Want your last order again? Just reply ${bold("Reorder")}.` : "";
  // At night one message says it all: the welcome, and when the shop opens.
  const night = o.closedOpensAt
    ? `\n\nWe're closed right now and open at ${bold(o.closedOpensAt)}. Send your order anytime; it'll be the first thing we look at.`
    : "";
  if (o.withCatalogue)
    return o.returning
      ? `${head}\n\nTap ${bold("View catalog")} to see what's available today.${reorder}${night}`
      : `${head}\n\nTap ${bold("View catalog")} to see our full range. Add what you like to your cart and send it here, and we'll take care of delivery and payment right in this chat.${night}`;
  return `${head}\n\nHow can we help you today? Tell us what you're looking for and our team will reply ${whenTeam(o.closedOpensAt ?? null)}.${reorder}`;
}

/** Something went wrong with an order: sorry, a photo please, and the shop's team takes it from there. */
export const problemText = (shop: ShopInfo, name: string, closedOpensAt: string | null) =>
  `We're really sorry about this${comma(name)}. 🙏 Please send a photo and your order number if you have it. The ${bold(shop.name)} team will look into it personally and get back to you ${whenTeam(closedOpensAt)}.`;

/** They asked for a person. */
export function humanText(shop: ShopInfo, name: string, closedOpensAt: string | null) {
  const direct = shop.supportPhone?.trim() ? `\n\nYou can also call us directly on ${bold(shop.supportPhone.trim())}.` : "";
  return `Sure${comma(name)}! Someone from ${bold(shop.name)} will call you on this number ${whenTeam(closedOpensAt)}.${direct}`;
}

/** Opening hours, from the shop-hours setting; without it, an honest "message us anytime". */
export function hoursText(shop: ShopInfo, s: Pick<PaySettings, "hoursOn" | "openAt" | "closeAt">, closedNow: boolean) {
  if (!s.hoursOn) return `You can message ${bold(shop.name)} here anytime, and our team will reply as soon as they can.${browseHint(shop)}`;
  const hours = `${bold(shop.name)} is open from ${bold(clock(s.openAt))} to ${bold(clock(s.closeAt))}.`;
  return closedNow
    ? `${hours} We're closed right now and will reply when we open at ${bold(clock(s.openAt))}.${browseHint(shop)}`
    : `${hours} We're open now, so send us your order anytime! 😊`;
}

/** Delivery, from the shop's order steps and its cash-on-delivery setting. */
export function deliveryText(shop: ShopInfo, s: Pick<PaySettings, "codOn" | "codMax" | "codAreas">) {
  const order = shop.catalogue ? ` Say ${bold("catalogue")} to browse, add what you need to your cart and send it here.` : " Send us what you need here.";
  if (shop.orderFlow === "pickup") return `${bold(shop.name)} doesn't deliver yet: orders are ready for pickup at our shop.${order} We'll tell you the moment it's ready.`;
  if (shop.orderFlow === "service") return `${bold(shop.name)} works by booking. Tell us what you need and when, and our team will confirm the details with you here.`;
  const where = shop.homeCity?.trim() ? ` in and around ${shop.homeCity.trim()}` : "";
  const how = shop.orderFlow === "courier" ? `Yes, we ship by courier! 🚚` : `Yes, we deliver${where}! 🚚`;
  const cod = s.codOn
    ? `\n\nCash on delivery is available${s.codMax ? ` for orders up to ${bold(money(s.codMax))}` : ""}${s.codAreas.trim() ? ` in ${s.codAreas.trim()}` : ""}.`
    : "";
  return `${how}${order} We'll confirm the delivery to your address before anything is charged.${cod}`;
}

/** How they can pay, from the shop's payment settings. */
export function paymentText(shop: ShopInfo, s: Pick<PaySettings, "codOn" | "codMax">, o: { waPay: boolean; upi: boolean }) {
  const ways = [
    o.waPay ? "online right here in WhatsApp (UPI, cards, net banking)" : null,
    o.upi ? "by UPI (GPay, PhonePe, Paytm)" : null,
    s.codOn ? `by cash on delivery${s.codMax ? ` (orders up to ${money(s.codMax)})` : ""}` : null,
  ].filter(Boolean) as string[];
  if (!ways.length) return `Our team will share the payment details with your order. Just send us what you need here.`;
  const list = ways.length === 1 ? ways[0] : `${ways.slice(0, -1).join(", ")} or ${ways[ways.length - 1]}`;
  return `At ${bold(shop.name)} you can pay ${list}.\n\nOnce you send your order here, we'll share the payment options for it right in this chat.`;
}

/** Where the shop is: the city it works from, and a number or website for directions. */
export function locationText(shop: ShopInfo, closedOpensAt: string | null) {
  const city = shop.homeCity?.trim() ? `${bold(shop.name)} is in ${shop.homeCity.trim()}.` : `Thanks for asking!`;
  const phone = shop.supportPhone?.trim();
  const site = shop.website?.trim() ? `\n\nMore about us: ${shop.website.trim()}` : "";
  return phone
    ? `${city} For the exact address and directions, call us on ${bold(phone)}.${site}`
    : `${city} Our team will send you the exact address ${whenTeam(closedOpensAt)}.${site}`;
}

/** A thank-you. */
export const thanksText = (shop: ShopInfo, name: string) => `You're most welcome${comma(name)}! 😊 Thank you for choosing ${bold(shop.name)}.`;

/** Anything else: received, and the team will reply. */
export const receivedText = (shop: ShopInfo, name: string, closedOpensAt: string | null) =>
  `Thanks for reaching out to ${bold(shop.name)}${comma(name)}! 🙏 Our team will reply ${whenTeam(closedOpensAt)}.${browseHint(shop)}`;
