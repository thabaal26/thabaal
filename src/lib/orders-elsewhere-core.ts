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
