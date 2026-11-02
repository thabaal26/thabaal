// "Orders on another number" (Payments › Payment settings): a shop whose connected WhatsApp number only sends its
// messages, and who takes orders and payments on its own main number. Pure wording and links, no database here
// (lib/orders-elsewhere.ts sends the reply).
import { formatPhone } from "./phone";
import { bold, hello } from "./wa-text";

/** How the reply is logged in Chats, and how often a customer gets it (a cart always gets one). */
export const ELSEWHERE_LABEL = "Orders on another number";
export const ELSEWHERE_GAP_MS = 6 * 3600_000;
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

/** "View Products", "price list", "catalogue", "products": the customer wants to see what the shop sells. */
export const ASKS_PRODUCTS = /\b(view|new|all|our)?\s*products?\b|\bprices?\b|price\s*list|\brates?\b|catalog(ue)?|\bmenu\b|விலை|பொருட்கள்/i;

/** The last line of the price list for a shop that takes orders by phone. */
export const callToOrder = (phone: string) => `📞 To order, call ${bold(formatPhone(phone))}`;

/** The automatic reply for a shop that takes orders by phone: the number to call; a cart's items listed to call about. */
export function callReply(o: { shop: string; name: string; phone: string; website?: string | null; cart?: CartLine[] | null }) {
  const main = bold(formatPhone(o.phone));
  const head = o.cart ? `${hello(o.name)} thank you for choosing ${bold(o.shop)}! 🙏` : `${hello(o.name)} thank you for messaging ${bold(o.shop)}! 🙏`;
  const items = o.cart?.length ? `\n\n${o.cart.map((l) => `• ${l.quantity} × ${l.name.trim()}`).join("\n")}` : "";
  const how = o.cart ? `We take orders by phone. Please call ${main} to order these items.` : `To order, please call ${main}. Our team will also reply here.`;
  const site = o.website?.trim() ? `\n\nSee all our products: ${o.website.trim()}` : "";
  return `${head}${items}\n\n${how}${site}`;
}
