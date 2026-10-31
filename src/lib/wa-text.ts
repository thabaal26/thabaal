// How Thabaal's automatic WhatsApp messages are written, so every shop's messages look the same and premium:
// the order number and amounts in bold, items one per line, at most one emoji, the shop's name in the footer.
import { money, type OrderItem } from "./orders";

/** WhatsApp bold. Stars inside the text are dropped so they can't break the formatting. */
export const bold = (s: string | number) => `*${String(s).replace(/\*/g, "")}*`;

/** "Meena" from "Meena R"; an empty string for a customer known only by their number. */
export const nameOf = (name: string) => (name.trim().startsWith("+") ? "" : name.trim().split(/\s+/)[0] || "");

/** "Hello Meena," or "Hello," for a customer known only by their number. */
export const hello = (name: string) => {
  const n = nameOf(name);
  return n ? `Hello ${n},` : "Hello,";
};

/** Items one per line: "• 2 × Coconut oil 1L · ₹1,000". Long lists end with "+ 3 more items". */
export function itemLines(items: Pick<OrderItem, "id" | "name" | "quantity" | "price">[], currency = "INR", max = 8) {
  const lines = items.slice(0, max).map((i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.price) || 0;
    return `• ${qty} × ${(i.name ?? i.id).trim()}${price > 0 ? ` · ${money(price * qty, currency)}` : ""}`;
  });
  if (items.length > max) lines.push(`+ ${items.length - max} more item${items.length - max === 1 ? "" : "s"}`);
  return lines.join("\n");
}

/** Button titles are at most 20 characters on WhatsApp. */
export const buttonTitle = (s: string) => (s.length <= 20 ? s : `${s.slice(0, 19)}…`);
