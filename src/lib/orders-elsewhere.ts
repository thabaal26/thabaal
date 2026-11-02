import "server-only";
import { formatPriceList, listCatalogProducts, shopInfoFor } from "./catalog";
import { db } from "./db";
import { lookupNames } from "./orders";
import { ASKS_PRODUCTS, CHAT_TO_ORDER, callReply, callToOrder, chatLink, ELSEWHERE_GAP_MS, ELSEWHERE_LABEL, elsewhereReply, orderText, type CartLine } from "./orders-elsewhere-core";
import { paySettingsFor } from "./pay-settings-server";
import { logMessage, replyContext } from "./payments";
import { getSettings } from "./provider";
import { sendCtaUrl, sendTextMessage } from "./whatsapp";

// "Orders on another number" (Payments › Payment settings › How orders work): the connected number only sends the
// shop's messages; customers order and pay on the shop's main number, by calling it or by WhatsApp chat there.
// Wording: lib/orders-elsewhere-core.ts.

export type Elsewhere = { phone: string; by: "call" | "chat" };

/** Where and how this shop takes orders when not on this number (main number, call or chat), else null. */
export async function ordersElsewhere(clientId: string): Promise<Elsewhere | null> {
  const s = (await paySettingsFor(clientId)).settings;
  return s.orderPhone ? { phone: s.orderPhone, by: s.orderBy } : null;
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
 * Answers a customer who wrote to a shop that takes orders on its main number. A cart is never saved or charged here.
 *  - by call: asking for products ("View Products" button, "price list", "products"…) gets the shop's price list from
 *    its catalogue, ending with the number to call; a cart gets its items and the number to call; anything else gets
 *    "To order, please call …".
 *  - by chat: one reply with the main number and a "Chat to Order" button opening WhatsApp there (a cart's items typed in).
 * A tapped button, a cart or a request for products always gets an answer; other messages at most once every 6 hours.
 * False when nothing went out (24-hour window closed, messages off, or already told recently).
 */
export async function replyOrdersElsewhere(c: Cust, m: CartMessage, where: Elsewhere, text = ""): Promise<boolean> {
  if (c.optedOut) return false;
  const cart = m.type === "order";
  const tapped = m.type === "button" || m.interactive?.type === "button_reply" || m.interactive?.type === "list_reply";
  const wantsProducts = where.by === "call" && !cart && ASKS_PRODUCTS.test(text);
  if (!cart && !tapped && !wantsProducts) {
    const recent = await db.message.findFirst({ where: { customerId: c.id, templateName: ELSEWHERE_LABEL, createdAt: { gte: new Date(Date.now() - ELSEWHERE_GAP_MS) } }, select: { id: true } });
    if (recent) return false;
  }
  const [settings, ctx, shop, lines] = await Promise.all([getSettings(), replyContext(c), shopInfoFor(c.clientId), cart ? cartLines(c.clientId, m) : []]);
  if (settings.provider !== "META" || !ctx.open) return false;

  if (where.by === "call") {
    const products = wantsProducts ? await listCatalogProducts(ctx.cfg).catch(() => []) : [];
    const list = products.some((p) => p.inStock && p.price);
    const body = list
      ? formatPriceList(shop.name, products, callToOrder(where.phone)).slice(0, 4096)
      : callReply({ shop: shop.name, name: c.name, phone: where.phone, website: shop.website, cart: cart ? lines : null });
    const res = await sendTextMessage(ctx.cfg, c.phone, body);
    await logMessage(c.id, list ? "Price list" : ELSEWHERE_LABEL, body, res, ctx.number?.id ?? null);
    return true;
  }

  const body = elsewhereReply({ shop: shop.name, name: c.name, phone: where.phone, website: shop.website, cart });
  const res = await sendCtaUrl(ctx.cfg, c.phone, body, { text: CHAT_TO_ORDER, url: chatLink(where.phone, orderText(shop.name, lines)) }, { footer: shop.name });
  await logMessage(c.id, ELSEWHERE_LABEL, body, res, ctx.number?.id ?? null);
  return true;
}
