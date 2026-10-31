import "server-only";
import { cache } from "react";
import { catalogProducts } from "./catalog";
import { catalogMatcher, type CatalogMatcher, type CatalogRef } from "./catalog-match";
import { db } from "./db";

// Products everywhere in the portal come from the client's live catalogue only. Order lines and
// sheet purchase notes are matched to catalogue items (lib/catalog-match.ts); anything that isn't
// a catalogue item (customer tags, a typed "Oil", a deleted product) is left out.

/** Matcher over this client's live catalogue, built once per request. */
export const catalogFor = cache(async (clientId: string): Promise<CatalogMatcher> => {
  const products = await catalogProducts(clientId).catch(() => []);
  return catalogMatcher(products.map((p) => ({ retailerId: p.retailerId, name: p.name })));
});

/** The SKUs a product filter picks (values are catalogue names or SKUs). */
export function pickedSkus(m: CatalogMatcher, picked: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const v of picked) {
    const ref = m.named(v) ?? m.item({ name: v });
    if (ref) out.add(ref.retailerId);
  }
  return out;
}

type Item = { id?: string; name?: string; quantity?: number | string; price?: number | string };

/** Every order of the client with its lines matched to the catalogue. */
export const catalogOrders = cache(async (clientId: string) => {
  // The orders don't depend on the catalogue: read both at once.
  const [m, rows] = await Promise.all([
    catalogFor(clientId),
    db.order.findMany({
      where: { clientId },
      select: { id: true, customerId: true, items: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, createdAt: true },
    }),
  ]);
  return rows.map((o) => ({
    ...o,
    lines: ((o.items as Item[] | null) ?? [])
      .map((i) => ({ ref: m.item(i), qty: Number(i.quantity) || 1, price: Number(i.price) || 0 }))
      .filter((l): l is { ref: CatalogRef; qty: number; price: number } => l.ref !== null),
  }));
});

/** Per customer, the catalogue products they ordered or noted buying (Google Sheet purchases). */
export const customerProducts = cache(async (clientId: string): Promise<Map<string, Set<string>>> => {
  const [m, orders, notes] = await Promise.all([
    catalogFor(clientId),
    catalogOrders(clientId),
    db.customer.findMany({ where: { clientId, purchases: { not: null } }, select: { id: true, purchases: true } }),
  ]);
  const out = new Map<string, Set<string>>();
  const add = (cid: string, sku: string) => (out.get(cid) ?? out.set(cid, new Set()).get(cid)!).add(sku);
  for (const o of orders) if (o.status !== "CANCELLED") for (const l of o.lines) add(o.customerId, l.ref.retailerId);
  for (const c of notes) for (const ref of m.text(c.purchases)) add(c.id, ref.retailerId);
  return out;
});

/** Customers who ordered or noted any of the picked products. */
export async function customersWithProducts(clientId: string, picked: readonly string[]): Promise<string[]> {
  const [m, byCustomer] = await Promise.all([catalogFor(clientId), customerProducts(clientId)]);
  const skus = pickedSkus(m, picked);
  if (!skus.size) return [];
  return [...byCustomer].filter(([, set]) => [...set].some((s) => skus.has(s))).map(([id]) => id);
}

/** Orders with at least one line of the picked products. */
export async function ordersWithProducts(clientId: string, picked: readonly string[]): Promise<string[]> {
  const [m, orders] = await Promise.all([catalogFor(clientId), catalogOrders(clientId)]);
  const skus = pickedSkus(m, picked);
  if (!skus.size) return [];
  return orders.filter((o) => o.lines.some((l) => skus.has(l.ref.retailerId))).map((o) => o.id);
}
