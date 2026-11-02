import "server-only";
import { shopInfoFor } from "./catalog";
import { db } from "./db";
import { lookupNames } from "./orders";
import { CHAT_TO_ORDER, chatLink, ELSEWHERE_GAP_MS, ELSEWHERE_LABEL, elsewhereReply, orderText, type CartLine } from "./orders-elsewhere-core";
import { paySettingsFor } from "./pay-settings-server";
import { logMessage, replyContext } from "./payments";
import { getSettings } from "./provider";
import { sendCtaUrl } from "./whatsapp";

// "Orders on another number" (Payments › Payment settings › How orders work): the connected number only sends the
// shop's messages; customers order and pay on the shop's main number. Wording: lib/orders-elsewhere-core.ts.

/** The shop's main order number when it takes orders there (digits with country code), else null. */
export async function ordersElsewhere(clientId: string): Promise<string | null> {
  return (await paySettingsFor(clientId)).settings.orderPhone || null;
}

type Cust = { id: string; clientId: string; phone: string; name: string; optedOut: boolean };
type CartMessage = { type?: string; interactive?: { type?: string }; order?: { catalog_id?: string; product_items?: { product_retailer_id?: string; quantity?: number | string }[] } };

/** A catalogue cart's lines with product names (the product code when the catalogue can't be asked). */
async function cartLines(clientId: string, m: CartMessage): Promise<CartLine[]> {
  const items = (m.order?.product_items ?? []).filter((i) => i.product_retailer_id);
  if (!items.length) return [];
  const names = await lookupNames(clientId, m.order?.catalog_id, items.map((i) => String(i.product_retailer_id)));
  return items.map((i) => ({ name: names.get(String(i.product_retailer_id)) ?? String(i.product_retailer_id), quantity: Number(i.quantity) || 1 }));
}

/**
 * Answers a customer who wrote to a shop that takes orders on its main number: one reply with that number and a
 * "Chat to Order" button opening a chat there. A cart is never saved or charged here: its items go into the chat
 * for the customer to send. A tapped button (a campaign's "Chat to Order" reply button) always gets it; other
 * messages at most once every 6 hours. False when nothing went out (24-hour window closed, messages off, or already
 * told recently).
 */
export async function replyOrdersElsewhere(c: Cust, m: CartMessage, phone: string): Promise<boolean> {
  if (c.optedOut) return false;
  const cart = m.type === "order";
  const tapped = m.type === "button" || m.interactive?.type === "button_reply" || m.interactive?.type === "list_reply";
  if (!cart && !tapped) {
    const recent = await db.message.findFirst({ where: { customerId: c.id, templateName: ELSEWHERE_LABEL, createdAt: { gte: new Date(Date.now() - ELSEWHERE_GAP_MS) } }, select: { id: true } });
    if (recent) return false;
  }
  const [settings, ctx, shop, lines] = await Promise.all([getSettings(), replyContext(c), shopInfoFor(c.clientId), cart ? cartLines(c.clientId, m) : []]);
  if (settings.provider !== "META" || !ctx.open) return false;
  const body = elsewhereReply({ shop: shop.name, name: c.name, phone, website: shop.website, cart });
  const res = await sendCtaUrl(ctx.cfg, c.phone, body, { text: CHAT_TO_ORDER, url: chatLink(phone, orderText(shop.name, lines)) }, { footer: shop.name });
  await logMessage(c.id, ELSEWHERE_LABEL, body, res, ctx.number?.id ?? null);
  return true;
}
