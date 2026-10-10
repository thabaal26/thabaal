import "server-only";
import { findAddressesInReplies, parseAddressText } from "./address";
import { db } from "./db";
import { DEFAULT_SHIPPING_FEE, calcItemsSubtotal, getOrderPricing } from "./order-pricing";
import { senderFor } from "./senders";
import { catalogProductNames } from "./whatsapp";

export { DEFAULT_SHIPPING_FEE, calcItemsSubtotal, getOrderPricing };

/** The order number people see and quote, e.g. RG-1001. */
export const orderRef = (o: { number: number }) => `RG-${1000 + o.number}`;

/** Order lookup for a reference from orderRef, or an order id (payment requests sent before order numbers). */
export function orderWhereRef(ref: string) {
  const m = /^RG-(\d+)$/i.exec(ref.trim());
  return m ? { number: Number(m[1]) - 1000 } : { id: ref };
}

export type OrderItem = { id: string; name?: string; quantity: number; price: number; currency: string };

type MetaOrder = { catalog_id?: string; text?: string; product_items?: { product_retailer_id?: string; quantity?: number | string; item_price?: number | string; currency?: string }[] };

/** Items, subtotal, ₹60 shipping, final total and note from a Cloud API "order" message (a cart sent from the catalogue). */
export function parseOrder(m: { order?: MetaOrder }) {
  const o = m.order ?? {};
  const items: OrderItem[] = (o.product_items ?? []).map((p) => ({
    id: String(p.product_retailer_id ?? "item"),
    quantity: Number(p.quantity) || 1,
    price: Number(p.item_price) || 0,
    currency: p.currency ?? "INR",
  }));
  const { subtotal, shipping, total } = getOrderPricing(items);
  return { items, subtotal, shipping, total, currency: items[0]?.currency ?? "INR", catalogId: o.catalog_id ?? null, note: o.text?.trim() || null };
}

/** One line per item, e.g. "2 × Coconut oil 500 ml". */
export const itemsText = (items: OrderItem[]) => items.map((i) => `${i.quantity} × ${i.name ?? i.id}`).join(", ");

export const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

/** Saves a cart against the customer. The same WhatsApp message id arriving twice is ignored. */
export async function recordOrder(customer: { id: string; clientId: string }, waMessageId: string | undefined, m: { order?: MetaOrder }, names?: Map<string, string>) {
  const o = parseOrder(m);
  if (!o.items.length) return null;
  const known = names ?? (await lookupNames(customer.clientId, o.catalogId, o.items.map((i) => i.id)));
  const items = o.items.map((i) => ({ ...i, name: known.get(i.id) }));
  if (waMessageId && (await db.order.findUnique({ where: { waMessageId }, select: { id: true } }))) return null;

  // Resolve address: if order note has an address and customer has none, save to customer;
  // if order has no note, check customer's saved address or recent WhatsApp chat replies.
  let orderNote = o.note;
  try {
    const cust = await db.customer.findUnique({
      where: { id: customer.id },
      select: {
        location: true,
        locationRaw: true,
        region: true,
        replies: { orderBy: { receivedAt: "desc" }, take: 15, select: { text: true, receivedAt: true } },
      },
    });
    if (cust) {
      if (orderNote) {
        const parsed = parseAddressText(orderNote);
        if ((parsed.isLikelyAddress || parsed.area) && !cust.locationRaw?.trim()) {
          await db.customer.update({
            where: { id: customer.id },
            data: {
              locationRaw: parsed.fullAddress.slice(0, 500),
              ...(parsed.area && !cust.location ? { location: parsed.area } : {}),
              ...(parsed.region !== "Not sure" && (!cust.region || cust.region === "Not sure") ? { region: parsed.region } : {}),
            },
          });
        }
      } else {
        const savedAddr = cust.locationRaw?.trim() || cust.location?.trim() || null;
        if (savedAddr) {
          orderNote = savedAddr;
        } else {
          const fromChat = findAddressesInReplies(cust.replies)[0];
          if (fromChat) {
            orderNote = fromChat.fullAddress;
            await db.customer.update({
              where: { id: customer.id },
              data: {
                locationRaw: fromChat.fullAddress.slice(0, 500),
                ...(fromChat.area && !cust.location ? { location: fromChat.area } : {}),
                ...(fromChat.region !== "Not sure" && (!cust.region || cust.region === "Not sure") ? { region: fromChat.region } : {}),
              },
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("Could not sync order address with customer", e);
  }

  return db.order.create({
    data: { clientId: customer.clientId, customerId: customer.id, waMessageId, catalogId: o.catalogId, note: orderNote, items, total: o.total, currency: o.currency },
  });
}

/** Item names for a cart's retailer ids, from the client's catalogue; empty when they can't be fetched. */
export async function lookupNames(clientId: string, catalogId: string | null | undefined, ids: string[]) {
  if (!catalogId || !ids.length) return new Map<string, string>();
  const { cfg } = await senderFor(clientId, null);
  try {
    return await catalogProductNames(cfg, catalogId, [...new Set(ids)]);
  } catch (e) {
    console.error("Could not read product names from the catalogue", e);
    return new Map<string, string>();
  }
}

/**
 * Fills in names for orders saved with only product ids (older carts, or when the lookup failed).
 * Runs from the scheduler, a few orders at a time.
 */
/** The order's items with product names, looking up and saving any still missing so messages never show bare codes. */
export async function itemsWithNames(o: { id: string; clientId: string; catalogId: string | null; items: unknown }) {
  const items = o.items as OrderItem[];
  if (items.every((i) => i.name) || !o.catalogId) return items;
  const names = await lookupNames(o.clientId, o.catalogId, items.map((i) => i.id));
  if (!names.size) return items;
  const named = items.map((i) => ({ ...i, name: i.name ?? names.get(i.id) }));
  await db.order.update({ where: { id: o.id }, data: { items: named } });
  return named;
}

export async function backfillOrderNames(limit = 20) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE "catalogId" IS NOT NULL AND items::text NOT LIKE '%"name"%' AND "createdAt" > now() - interval '120 days'
    ORDER BY "createdAt" DESC LIMIT ${limit}`;
  for (const { id } of rows) {
    const o = await db.order.findUnique({ where: { id }, select: { clientId: true, catalogId: true, items: true } });
    if (!o) continue;
    const items = o.items as OrderItem[];
    const names = await lookupNames(o.clientId, o.catalogId, items.map((i) => i.id));
    if (!names.size) continue;
    await db.order.update({ where: { id }, data: { items: items.map((i) => ({ ...i, name: i.name ?? names.get(i.id) })) } });
  }
}
