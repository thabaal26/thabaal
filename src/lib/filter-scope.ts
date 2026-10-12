import "server-only";
import { cache } from "react";
import { db } from "./db";
import type { FilterState } from "./filters";
import { catalogFor, catalogOrders, customerProducts, customersWithProducts, ordersWithProducts } from "./product-scope";

// Server side of the shared filters: which customers a filter covers, and the choices to offer.

/**
 * The customers these filters cover, or null when nothing narrows them (all customers).
 * Within a filter any match counts (product A or B); across filters all must hold (bought A and in Sellur).
 */
export async function scopedCustomerIds(clientId: string, f: FilterState): Promise<string[] | null> {
  const sets: Set<string>[] = [];

  if (f.customers.length) {
    const rows = await db.customer.findMany({ where: { clientId, id: { in: f.customers } }, select: { id: true } });
    sets.push(new Set(rows.map((r) => r.id)));
  }
  if (f.tags.length) {
    const rows = await db.customer.findMany({ where: { clientId, tags: { hasSome: f.tags } }, select: { id: true } });
    sets.push(new Set(rows.map((r) => r.id)));
  }
  if (f.area) {
    const where =
      f.area === "none" ? { location: null } : f.area.startsWith("region:") ? { region: f.area.slice(7) } : f.area.startsWith("loc:") ? { location: f.area.slice(4) } : {};
    const rows = await db.customer.findMany({ where: { clientId, ...where }, select: { id: true } });
    sets.push(new Set(rows.map((r) => r.id)));
  }
  if (f.products.length) sets.push(new Set(await customersWithProducts(clientId, f.products)));
  if (f.campaign) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT m."customerId" AS id FROM "Message" m JOIN "CampaignRun" r ON r.id = m."runId"
      JOIN "Campaign" c ON c.id = r."campaignId" WHERE c.id = ${f.campaign} AND c."clientId" = ${clientId}`;
    sets.push(new Set(rows.map((r) => r.id)));
  }

  if (!sets.length) return null;
  const [first, ...rest] = sets;
  return [...first].filter((id) => rest.every((s) => s.has(id)));
}

export type FilterOption = { value: string; label: string; hint?: string };
export type FilterOptions = {
  products: FilterOption[];
  customers: FilterOption[];
  tags: FilterOption[];
  areas: FilterOption[];
  campaigns: FilterOption[];
};

/** The choices the filter panel offers for this client, most used first. */
export const filterOptions = cache(async (clientId: string): Promise<FilterOptions> => {
  const [products, regions, locations] = await Promise.all([
    productChoices(clientId),
    db.customer.groupBy({ by: ["region"], where: { clientId, region: { not: null } }, _count: true }),
    db.customer.groupBy({ by: ["location"], where: { clientId, location: { not: null } }, _count: true, orderBy: { _count: { location: "desc" } }, take: 60 }),
  ]);
  return {
    products,
    customers: [],
    tags: [],
    areas: [
      ...regions.map((r) => ({ value: `region:${r.region}`, label: r.region!, hint: `${r._count} customers · region` })),
      ...locations.map((l) => ({ value: `loc:${l.location}`, label: l.location!, hint: `${l._count} customers` })),
      { value: "none", label: "No location noted" },
    ],
    campaigns: [],
  };
});

/** Orders with at least one line of the picked products (null when no product filter). */
export async function orderIdsWithProducts(clientId: string, products: string[]): Promise<string[] | null> {
  if (!products.length) return null;
  return ordersWithProducts(clientId, products);
}

/** Product filter choices: every catalogue item, the ones customers buy most first. */
async function productChoices(clientId: string): Promise<FilterOption[]> {
  const [m, orders, byCustomer] = await Promise.all([catalogFor(clientId), catalogOrders(clientId), customerProducts(clientId)]);
  const buyers = new Map<string, number>();
  for (const set of byCustomer.values()) for (const sku of set) buyers.set(sku, (buyers.get(sku) ?? 0) + 1);
  const lines = new Map<string, number>();
  for (const o of orders) if (o.status !== "CANCELLED") for (const l of o.lines) lines.set(l.ref.retailerId, (lines.get(l.ref.retailerId) ?? 0) + 1);
  return m.products
    .map((p) => ({ p, n: buyers.get(p.retailerId) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name))
    .map(({ p, n }) => ({
      value: p.name,
      label: p.name,
      hint: n ? `${n} customer${n === 1 ? "" : "s"}${lines.get(p.retailerId) ? ` · ${lines.get(p.retailerId)} order lines` : ""}` : `${p.retailerId} · no buyers yet`,
    }));
}

/** Customers and orders a filter covers, as Prisma conditions for Order queries. */
export async function orderScope(clientId: string | null, f: import("./filters").FilterState) {
  if (!clientId) return {};
  const [customers, orderIds] = await Promise.all([
    scopedCustomerIds(clientId, { ...f, products: [] }),
    orderIdsWithProducts(clientId, f.products),
  ]);
  return {
    ...(customers && { customerId: { in: customers } }),
    ...(orderIds && { id: { in: orderIds } }),
  };
}

export const STAGES = [
  { value: "", label: "Any stage" },
  { value: "top", label: "Top spender (₹1,200+ / VIP)" },
  { value: "frequent", label: "Frequent buyer (3+ orders)" },
  { value: "repeat", label: "Repeat buyer (2+ orders)" },
  { value: "active", label: "Active buyer (≤30 days)" },
  { value: "refill", label: "Reorder window (31–60 days)" },
  { value: "lapsed", label: "Lapsed (60+ days)" },
  { value: "unpaid", label: "Unpaid cart now" },
  { value: "never", label: "Never ordered" },
] as const;

export const ACTIVITY = [
  { value: "", label: "Any activity" },
  { value: "ordered", label: "Ordered in period" },
  { value: "not-ordered", label: "Didn't order in period" },
  { value: "carted", label: "Sent a cart in period" },
  { value: "replied", label: "Replied in period" },
  { value: "messaged", label: "Messaged in period" },
  { value: "joined", label: "Added in period" },
] as const;

/**
 * Customer list narrowing beyond the basic search: the shared filters plus a lifecycle stage and
 * what they did in the period. Null when nothing narrows (everyone).
 */
export async function customerSegmentIds(
  clientId: string,
  f: import("./filters").FilterState,
  opts: { stage?: string; act?: string; start?: Date; end?: Date },
): Promise<string[] | null> {
  const sets: Set<string>[] = [];
  const base = await scopedCustomerIds(clientId, f);
  if (base) sets.push(new Set(base));

  if (opts.stage) {
    const rows = await db.$queryRaw<{ id: string; paid: bigint; spent: number; last_paid: Date | null; open_cart: boolean }[]>`
      SELECT c.id,
        count(o.id) FILTER (WHERE o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED') OR o."paidAt" IS NOT NULL) AS paid,
        coalesce(sum(o.total) FILTER (WHERE o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED') OR o."paidAt" IS NOT NULL), 0)::float8 AS spent,
        max(o."createdAt") FILTER (WHERE o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED') OR o."paidAt" IS NOT NULL) AS last_paid,
        bool_or(o.status = 'NEW' AND o."paidAt" IS NULL) AS open_cart
      FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c.id AND o.status <> 'CANCELLED'
      WHERE c."clientId" = ${clientId}
      GROUP BY c.id`;
    const day = 86_400_000;
    const age = (d: Date | null) => (d ? (Date.now() - d.getTime()) / day : Infinity);
    const hit = rows.filter((r) => {
      const n = Number(r.paid);
      const spent = Number(r.spent ?? 0);
      const a = age(r.last_paid);
      switch (opts.stage) {
        case "top": return spent >= 1200 || n >= 3;
        case "frequent": return n >= 3;
        case "repeat": return n >= 2;
        case "active": return n > 0 && a <= 30;
        case "refill": return n > 0 && a > 30 && a <= 60;
        case "lapsed": return n > 0 && a > 60;
        case "unpaid": return Boolean(r.open_cart);
        case "never": return n === 0;
        default: return true;
      }
    });
    sets.push(new Set(hit.map((r) => r.id)));
  }

  if (opts.act) {
    const from = opts.start ?? new Date(0);
    const to = opts.end ?? new Date();
    let ids: string[] = [];
    if (opts.act === "ordered" || opts.act === "not-ordered") {
      const rows = await db.order.findMany({
        where: { clientId, createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" }, OR: [{ paidAt: { not: null } }, { status: { in: ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"] } }] },
        select: { customerId: true },
        distinct: ["customerId"],
      });
      ids = rows.map((r) => r.customerId);
      if (opts.act === "not-ordered") {
        const got = new Set(ids);
        const all = await db.customer.findMany({ where: { clientId }, select: { id: true } });
        ids = all.map((c) => c.id).filter((id) => !got.has(id));
      }
    } else if (opts.act === "carted") {
      ids = (await db.order.findMany({ where: { clientId, createdAt: { gte: from, lt: to } }, select: { customerId: true }, distinct: ["customerId"] })).map((r) => r.customerId);
    } else if (opts.act === "replied") {
      ids = (await db.reply.findMany({ where: { customer: { clientId }, receivedAt: { gte: from, lt: to } }, select: { customerId: true }, distinct: ["customerId"] })).map((r) => r.customerId);
    } else if (opts.act === "messaged") {
      ids = (await db.message.findMany({ where: { customer: { clientId }, createdAt: { gte: from, lt: to }, status: { notIn: ["QUEUED", "SKIPPED"] } }, select: { customerId: true }, distinct: ["customerId"] })).map((r) => r.customerId);
    } else if (opts.act === "joined") {
      ids = (await db.customer.findMany({ where: { clientId, createdAt: { gte: from, lt: to } }, select: { id: true } })).map((r) => r.id);
    }
    sets.push(new Set(ids));
  }

  if (!sets.length) return null;
  const [first, ...rest] = sets;
  return [...first].filter((id) => rest.every((s) => s.has(id)));
}

/** Message-log conditions for the shared filters: the period and the customers they cover. */
export async function messageScope(clientId: string | null, f: import("./filters").FilterState, period: { start: Date; end: Date }) {
  const customers = clientId ? await scopedCustomerIds(clientId, { ...f, campaign: "" }) : null;
  return {
    ...(f.range !== "all" && { createdAt: { gte: period.start, lt: period.end } }),
    ...(customers && { customerId: { in: customers } }),
  };
}
