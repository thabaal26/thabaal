// "Orders on another number" (Payments › Payment settings): a shop whose connected WhatsApp number only sends its
// messages, and who takes orders and payments on its own main number. Pure wording and links, no database here
// (lib/orders-elsewhere.ts sends the reply).
import { formatPhone } from "./phone";
import { ACK_RE, THANKS_RE } from "./assistant-intents";
import { bold, hello } from "./wa-text";

/** How the reply is logged in Chats. */
export const ELSEWHERE_LABEL = "Orders on another number";
/** The reply's button, and the template button that opens the same chat. */
export const CHAT_TO_ORDER = "Chat to Order";

export type CartLine = { name: string; quantity: number };

/** A WhatsApp chat with `phone` (digits with country code), `text` typed in for the customer. */
export const chatLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

/** What the customer sends on the main number: their cart one item per line, or a plain "I'd like to order". */
export function orderText(shop: string, cart: CartLine[] = []) {
  if (!cart.length) return `Hi ${shop}, I'd like to order.`;
  return `Hi ${shop}, I'd like to order:\n${cart.map((l) => `• ${l.quantity} × ${l.name.trim()}`).join("\n")}`;
}

/** The automatic reply on the connected number: where to order and pay, with the website when the shop has one. */
export function elsewhereReply(o: { shop: string; name: string; phone: string; website?: string | null; cart?: boolean }) {
  const main = bold(formatPhone(o.phone));
  const head = o.cart ? `${hello(o.name)} thank you for your order at ${bold(o.shop)}! 🙏` : `${hello(o.name)} thank you for messaging ${bold(o.shop)}! 🙏`;
  const how = o.cart
    ? `We take orders and payments on our main number, ${main}. Tap ${bold(CHAT_TO_ORDER)}: your items are already typed in, just press send. You can also call us on the same number.`
    : `We take orders and payments on our main number, ${main}. Tap ${bold(CHAT_TO_ORDER)} to WhatsApp us there, or call us on the same number.`;
  const site = o.website?.trim() ? `\n\nSee all our products: ${o.website.trim()}` : "";
  return `${head}\n\n${how}${site}`;
}

/** "View Products", "price list", "how much is…", "catalogue": the customer wants to see what the shop sells. */
export const ASKS_PRODUCTS =
  /\b(view|new|all|our)?\s*products?\b|\bprices?\b|price\s*list|\brates?\b|\bcost\b|how\s+much|\bevl[ao]\b|evvalavu|catalog(ue)?|\bmenu\b|விலை|எவ்வளவு|பொருட்கள்/i;

/** "ok", "thanks", 👍, a reaction: a customer closing the conversation, not a question. */
export const isAck = (text: string) =>
  ACK_RE.test(text) || THANKS_RE.test(text) || /^Reacted /.test(text) || /^[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\s!.?]+$/u.test(text);

/** Several messages sent together get one reply; an "ok"/"thanks" right after a reply gets none. */
export const BURST_MS = 20_000;
export const ACK_QUIET_MS = 10 * 60_000;

/** The last line of the price list for a shop that takes orders on its main number: call or WhatsApp it. */
export const callToOrder = (phone: string) => `📞 To order, call or WhatsApp ${bold(formatPhone(phone))}`;

/** The automatic reply for a shop that takes orders on its main number by phone: call or WhatsApp it; a cart's items listed. */
export function callReply(o: { shop: string; name: string; phone: string; cart?: CartLine[] | null }) {
  const main = bold(formatPhone(o.phone));
  if (!o.cart) return `${hello(o.name)} thank you for messaging ${bold(o.shop)}! 🙏\n\nTo order, call or WhatsApp us on ${main}.`;
  const items = o.cart.length ? `\n\n${o.cart.map((l) => `• ${l.quantity} × ${l.name.trim()}`).join("\n")}` : "";
  return `${hello(o.name)} thank you for choosing ${bold(o.shop)}! 🙏${items}\n\nTo order these, call or WhatsApp us on ${main}.`;
}
