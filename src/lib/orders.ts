import "server-only";
import { db } from "./db";
import { senderFor } from "./senders";
import { catalogProductNames } from "./whatsapp";

export type OrderItem = { id: string; name?: string; quantity: number; price: number; currency: string };

type MetaOrder = { catalog_id?: string; text?: string; product_items?: { product_retailer_id?: string; quantity?: number | string; item_price?: number | string; currency?: string }[] };

/** Items, total and note from a Cloud API "order" message (a cart sent from the catalogue). */
export function parseOrder(m: { order?: MetaOrder }) {
  const o = m.order ?? {};
  const items: OrderItem[] = (o.product_items ?? []).map((p) => ({
    id: String(p.product_retailer_id ?? "item"),
    quantity: Number(p.quantity) || 1,
    price: Number(p.item_price) || 0,
    currency: p.currency ?? "INR",
  }));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { items, total, currency: items[0]?.currency ?? "INR", catalogId: o.catalog_id ?? null, note: o.text?.trim() || null };
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
  return db.order.create({
    data: { clientId: customer.clientId, customerId: customer.id, waMessageId, catalogId: o.catalogId, note: o.note, items, total: o.total, currency: o.currency },
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
