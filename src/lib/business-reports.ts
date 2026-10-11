import "server-only";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import type { OrderItem } from "./orders";
import { INDIA_GST_RATE, RATES } from "./spend";

// Read-only reports behind the campaign comparison, revenue, combo and weekly-report pages.

const DAY = 86_400_000;
const BOUGHT_SQL = `(o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED'))`;
export const dayStart = (d: Date) => fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
const isBought = (o: { paidAt: Date | null; status: string }) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);
const itemName = (i: OrderItem) => (i.name ?? i.id ?? "").trim();
const realItem = (n: string) => n.length > 0 && !/^manual-\d+$/i.test(n);

/* ───────────────────────── Campaign results ───────────────────────── */

export type CampaignResult = {
  id: string;
  name: string;
  template: string;
  runs: number;
  lastAt: Date | null;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  carted: number;
  bought: number;
  revenue: number;
};

/**
 * Each campaign's messages in the period and what the people who got them did next:
 * replied within 3 days, sent a cart within 7 days, paid within 7 days (and how much).
 * Counts are per message, so a customer messaged twice counts twice.
 */
export async function campaignResults(clientId: string, days = 90): Promise<CampaignResult[]> {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.$queryRawUnsafe<
    { id: string; name: string; template: string; runs: bigint; last_at: Date | null; sent: bigint; delivered: bigint; read: bigint; failed: bigint; replied: bigint; carted: bigint; bought: bigint; revenue: number }[]
  >(
    `WITH m AS (
       SELECT c.id, c.name, t.name AS template, r.id AS run_id, msg."customerId" AS cust, msg.status,
              coalesce(msg."sentAt", msg."createdAt") AS at
       FROM "Message" msg
       JOIN "CampaignRun" r ON r.id = msg."runId"
       JOIN "Campaign" c ON c.id = r."campaignId"
       JOIN "Template" t ON t.id = c."templateId"
       WHERE c."clientId" = $1 AND msg."createdAt" >= $2 AND msg.status NOT IN ('QUEUED', 'SKIPPED')
     ), x AS (
       SELECT m.*,
         EXISTS (SELECT 1 FROM "Reply" rp WHERE rp."customerId" = m.cust AND rp."receivedAt" BETWEEN m.at AND m.at + interval '3 days') AS replied,
         EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = m.cust AND o."createdAt" BETWEEN m.at AND m.at + interval '7 days') AS carted,
         (SELECT coalesce(sum(o.total), 0) FROM "Order" o WHERE o."customerId" = m.cust AND o."createdAt" BETWEEN m.at AND m.at + interval '7 days' AND ${BOUGHT_SQL}) AS spent
       FROM m
     )
     SELECT id, name, template, count(DISTINCT run_id) AS runs, max(at) AS last_at, count(*) AS sent,
       count(*) FILTER (WHERE status IN ('DELIVERED', 'READ')) AS delivered,
       count(*) FILTER (WHERE status = 'READ') AS read,
       count(*) FILTER (WHERE status = 'FAILED') AS failed,
       count(*) FILTER (WHERE replied) AS replied,
       count(*) FILTER (WHERE carted) AS carted,
       count(*) FILTER (WHERE spent > 0) AS bought,
       coalesce(sum(spent), 0)::float AS revenue
     FROM x GROUP BY id, name, template ORDER BY count(*) DESC`,
    clientId,
    since,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    template: r.template,
    runs: Number(r.runs),
    lastAt: r.last_at,
    sent: Number(r.sent),
    delivered: Number(r.delivered),
    read: Number(r.read),
    failed: Number(r.failed),
    replied: Number(r.replied),
    carted: Number(r.carted),
    bought: Number(r.bought),
    revenue: Number(r.revenue),
  }));
}

/* ───────────────────────── Revenue & cash ───────────────────────── */

export type RevenueDay = { key: string; label: string; sub: string; upi: number; other: number; spend: number };
export type CashItem = { id: string; ref: string; customerId: string; name: string; total: number; at: Date; status: string; note: string | null };

export type RevenueReport = {
  days: RevenueDay[];
  paid: number;
  paidOrders: number;
  upiShare: number;
  spend: number;
  awaitingPayment: CashItem[];
  codToCollect: CashItem[];
  unpaidCarts: CashItem[];
};

const COD_RE = /\b(cod|cash on delivery|cash)\b/i;

export async function revenueReport(clientId: string, days = 30, now = new Date()): Promise<RevenueReport> {
  const start = dayStart(new Date(now.getTime() - (days - 1) * DAY));
  const [orders, open, billable] = await Promise.all([
    db.order.findMany({
      where: { clientId, createdAt: { gte: start }, status: { not: "CANCELLED" } },
      select: { createdAt: true, paidAt: true, status: true, total: true, paymentTxnId: true },
    }),
    db.order.findMany({
      where: { clientId, paidAt: null, status: { in: ["NEW", "CONFIRMED", "DISPATCHED", "DELIVERED"] }, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
      select: { id: true, number: true, customerId: true, total: true, createdAt: true, status: true, internalNote: true, paymentRequestedAt: true, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.$queryRaw<{ k: string; cat: string; n: bigint }[]>`
      SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'YYYY-MM-DD') AS k, m."pricingCategory" AS cat, count(*) AS n
      FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE c."clientId" = ${clientId} AND m.billable = true AND m."pricingCategory" IS NOT NULL AND m."createdAt" >= ${start}
      GROUP BY 1, 2`,
  ]);

  const keyOf = (d: Date) => formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
  const dayList: RevenueDay[] = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    return { key: keyOf(d), label: formatInTimeZone(d, APP_TZ, days > 14 ? "d" : "EEE"), sub: formatInTimeZone(d, APP_TZ, days > 14 ? "MMM" : "d MMM"), upi: 0, other: 0, spend: 0 };
  });
  const byKey = new Map(dayList.map((d) => [d.key, d]));
  let paid = 0;
  let paidOrders = 0;
  let upi = 0;
  for (const o of orders) {
    if (!isBought(o)) continue;
    const d = byKey.get(keyOf(o.paidAt ?? o.createdAt)) ?? byKey.get(keyOf(o.createdAt));
    if (!d) continue;
    if (o.paymentTxnId) {
      d.upi += o.total;
      upi += o.total;
    } else d.other += o.total;
    paid += o.total;
    paidOrders++;
  }
  let spend = 0;
  for (const b of billable) {
    const cost = Number(b.n) * (RATES[b.cat] ?? 0) * (1 + INDIA_GST_RATE);
    const d = byKey.get(b.k);
    if (d) d.spend += cost;
    spend += cost;
  }

  const item = (o: (typeof open)[number]): CashItem => ({ id: o.id, ref: `RG-${1000 + o.number}`, customerId: o.customerId, name: o.customer.name, total: o.total, at: o.createdAt, status: o.status, note: o.internalNote });
  const cod = open.filter((o) => (o.status === "CONFIRMED" || o.status === "DISPATCHED" || o.status === "DELIVERED") && COD_RE.test(o.internalNote ?? ""));
  const codIds = new Set(cod.map((o) => o.id));
  return {
    days: dayList,
    paid,
    paidOrders,
    upiShare: paid ? Math.round((upi / paid) * 100) : 0,
    spend,
    awaitingPayment: open.filter((o) => o.paymentRequestedAt && !codIds.has(o.id)).map(item),
    codToCollect: cod.map(item),
    unpaidCarts: open.filter((o) => o.status === "NEW" && !o.paymentRequestedAt && !codIds.has(o.id)).map(item),
  };
}

/* ───────────────────────── Combo ideas ───────────────────────── */

export type ComboPair = { a: string; b: string; together: number; aOrders: number; bOrders: number; lift: number; price: number };
export type SlowMover = { name: string; price: number; lastSold: Date | null; units: number };
export type ComboReport = { orders: number; pairs: ComboPair[]; bestSellers: { name: string; units: number; orders: number }[]; slow: SlowMover[] };

export async function comboReport(clientId: string, days = 365): Promise<ComboReport> {
  const since = new Date(Date.now() - days * DAY);
  const orders = await db.order.findMany({
    where: { clientId, createdAt: { gte: since }, status: { not: "CANCELLED" } },
    select: { items: true, paidAt: true, status: true, createdAt: true },
  });
  const bought = orders.filter(isBought);
  const single = new Map<string, { orders: number; units: number; price: number; last: Date }>();
  const pair = new Map<string, number>();
  for (const o of bought) {
    const items = ((o.items as OrderItem[] | null) ?? []).filter((i) => realItem(itemName(i)));
    const names = [...new Set(items.map(itemName))].sort();
    for (const i of items) {
      const n = itemName(i);
      const s = single.get(n) ?? { orders: 0, units: 0, price: 0, last: o.createdAt };
      s.units += Number(i.quantity) || 1;
      if (Number(i.price) > 0) s.price = Number(i.price);
      if (o.createdAt > s.last) s.last = o.createdAt;
      single.set(n, s);
    }
    for (const n of names) single.get(n)!.orders++;
    for (let x = 0; x < names.length; x++) for (let y = x + 1; y < names.length; y++) pair.set(`${names[x]}\u0000${names[y]}`, (pair.get(`${names[x]}\u0000${names[y]}`) ?? 0) + 1);
  }
  const total = Math.max(1, bought.length);
  const pairs: ComboPair[] = [...pair.entries()]
    .filter(([, n]) => n >= 2)
    .map(([k, together]) => {
      const [a, b] = k.split("\u0000");
      const sa = single.get(a)!;
      const sb = single.get(b)!;
      return { a, b, together, aOrders: sa.orders, bOrders: sb.orders, lift: (together * total) / (sa.orders * sb.orders), price: sa.price + sb.price };
    })
    .sort((p, q) => q.together - p.together || q.lift - p.lift)
    .slice(0, 12);

  const catalogue = await db.$queryRaw<{ name: string; price: number | null }[]>`
    SELECT DISTINCT ON (name) name, price FROM (
      SELECT trim(elem->>'name') AS name, (elem->>'price')::float AS price
      FROM "Order" o, jsonb_array_elements(o.items) AS elem
      WHERE o."clientId" = ${clientId} AND trim(coalesce(elem->>'name', '')) <> ''
    ) s ORDER BY name`.catch(() => []);
  const slowCut = new Date(Date.now() - 45 * DAY);
  const slow: SlowMover[] = catalogue
    .filter((p) => realItem(p.name))
    .map((p) => {
      const s = single.get(p.name);
      return { name: p.name, price: s?.price || Number(p.price) || 0, lastSold: s?.last ?? null, units: s?.units ?? 0 };
    })
    .filter((p) => !p.lastSold || p.lastSold < slowCut)
    .sort((a, b) => (a.lastSold?.getTime() ?? 0) - (b.lastSold?.getTime() ?? 0))
    .slice(0, 10);

  return {
    orders: bought.length,
    pairs,
    bestSellers: [...single.entries()].map(([name, s]) => ({ name, units: s.units, orders: s.orders })).sort((a, b) => b.orders - a.orders).slice(0, 8),
    slow,
  };
}

/* ───────────────────────── Weekly report ───────────────────────── */

export type WeekFigures = {
  revenue: number;
  orders: number;
  buyers: number;
  newCustomers: number;
  sent: number;
  delivered: number;
  read: number;
  replies: number;
  repliers: number;
  carts: number;
  abandoned: number;
};

export type WeeklyReport = {
  from: Date;
  to: Date;
  cur: WeekFigures;
  prev: WeekFigures;
  daily: { key: string; label: string; revenue: number }[];
  topProducts: { name: string; units: number; revenue: number }[];
};

async function weekFigures(clientId: string, from: Date, to: Date): Promise<WeekFigures> {
  const range = { gte: from, lt: to };
  const [orders, newCustomers, msgs, replies, repliers] = await Promise.all([
    db.order.findMany({ where: { clientId, createdAt: range }, select: { total: true, paidAt: true, status: true, customerId: true } }),
    db.customer.count({ where: { clientId, createdAt: range } }),
    db.message.groupBy({ by: ["status"], where: { customer: { clientId }, createdAt: range, status: { notIn: ["QUEUED", "SKIPPED"] } }, _count: true }),
    db.reply.count({ where: { customer: { clientId }, receivedAt: range } }),
    db.reply.groupBy({ by: ["customerId"], where: { customer: { clientId }, receivedAt: range } }),
  ]);
  const paid = orders.filter((o) => o.status !== "CANCELLED" && isBought(o));
  const n = (s: string) => msgs.find((m) => m.status === s)?._count ?? 0;
  return {
    revenue: paid.reduce((t, o) => t + o.total, 0),
    orders: paid.length,
    buyers: new Set(paid.map((o) => o.customerId)).size,
    newCustomers,
    sent: msgs.reduce((t, m) => t + m._count, 0),
    delivered: n("DELIVERED") + n("READ"),
    read: n("READ"),
    replies,
    repliers: repliers.length,
    carts: orders.length,
    abandoned: orders.filter((o) => o.status === "NEW" && !o.paidAt).length,
  };
}

export async function weeklyReport(clientId: string, now = new Date()): Promise<WeeklyReport> {
  const to = dayStart(now);
  const from = new Date(to.getTime() - 7 * DAY);
  const prevFrom = new Date(from.getTime() - 7 * DAY);
  const [cur, prev, orders] = await Promise.all([
    weekFigures(clientId, from, to),
    weekFigures(clientId, prevFrom, from),
    db.order.findMany({ where: { clientId, createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } }, select: { items: true, total: true, paidAt: true, status: true, createdAt: true } }),
  ]);
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    return { key: formatInTimeZone(d, APP_TZ, "yyyy-MM-dd"), label: formatInTimeZone(d, APP_TZ, "EEE"), revenue: 0 };
  });
  const prods = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) {
    if (!isBought(o)) continue;
    const day = daily.find((d) => d.key === formatInTimeZone(o.createdAt, APP_TZ, "yyyy-MM-dd"));
    if (day) day.revenue += o.total;
    for (const i of (o.items as OrderItem[] | null) ?? []) {
      const nme = itemName(i);
      if (!realItem(nme)) continue;
      const p = prods.get(nme) ?? { units: 0, revenue: 0 };
      p.units += Number(i.quantity) || 1;
      p.revenue += (Number(i.price) || 0) * (Number(i.quantity) || 1);
      prods.set(nme, p);
    }
  }
  return {
    from,
    to,
    cur,
    prev,
    daily,
    topProducts: [...prods.entries()].map(([name, p]) => ({ name, ...p })).sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, 6),
  };
}
