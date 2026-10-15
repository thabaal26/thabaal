import { orderRef } from "@/lib/order-ref";
import "server-only";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import type { OrderItem } from "./orders";
import { narrowOrders, weekKey } from "./filters";
import { catalogFor } from "./product-scope";
import { catalogProducts } from "./catalog";
import { dueOf, methodOf, paymentState, receivedOf, type PayFields } from "./payment-state";
import { INDIA_GST_RATE, RATES } from "./spend";

// Read-only reports behind the campaign comparison, revenue, combo and weekly-report pages.

const DAY = 86_400_000;
const BOUGHT_SQL = `(o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED'))`;
export const dayStart = (d: Date) => fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
const isBought = (o: { paidAt: Date | null; status: string }) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);

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

export type RevenueDay = { key: string; label: string; sub: string; upi: number; cash: number; other: number; pending: number; spend: number };
export type CashItem = { id: string; ref: string; customerId: string; name: string; total: number; at: Date; status: string; note: string | null };
export type MethodShare = { key: "upi" | "cash" | "other" | "pending"; label: string; amount: number; orders: number };

export type RevenueReport = {
  days: RevenueDay[];
  /** Sales: orders bought in the period (confirmed or paid), whether or not the money is in yet. */
  paid: number;
  paidOrders: number;
  /** Money actually received for those orders and kept (part payments count, refunds taken off). */
  received: number;
  /** Refunds given in the period, on any order (cancelled ones included). */
  refunded: number;
  upiShare: number;
  methods: MethodShare[];
  spend: number;
  awaitingPayment: CashItem[];
  codToCollect: CashItem[];
  unpaidCarts: CashItem[];
  /** Customer says they paid; staff to check the bank or UPI app. */
  toVerify: CashItem[];
  /** Confirmed, dispatched or delivered but not paid, and not cash on delivery. */
  owed: CashItem[];
  /** Cancelled after payment, not refunded yet. */
  refundsDue: CashItem[];
};

/** UPI (on WhatsApp or to the shop), cash (incl. COD), other (bank, card) — or "pending" while nothing is received. */
function methodGroup(o: PayFields & { paymentTxnId: string | null }): MethodShare["key"] {
  if (!o.paidAt && !(o.paidAmount && o.paidAmount > 0)) return "pending";
  const m = methodOf(o);
  if (m === "upi" || m === "upi_whatsapp" || (!m && o.paymentTxnId)) return "upi";
  if (m === "cash" || m === "cod") return "cash";
  return "other";
}
const GROUP_LABEL: Record<MethodShare["key"], string> = { upi: "UPI", cash: "Cash / COD", other: "Bank, card, other", pending: "Not received yet" };

/**
 * Money for a period: sales per day (or week, for long periods) split by how they were paid, what's still to
 * collect, payments to check, refunds due and what WhatsApp cost. `customers` limits it to those people;
 * `products` counts only those products' lines.
 */
export async function revenueReport(
  clientId: string,
  opts: { start: Date; end: Date; customers?: string[] | null; products?: string[] },
  now = new Date(),
): Promise<RevenueReport> {
  const { start, end } = opts;
  const ids = opts.customers ?? null;
  const days = Math.max(1, Math.round((dayStart(new Date(end.getTime() - 1)).getTime() - dayStart(start).getTime()) / DAY) + 1);
  const weekly = days > 92;
  const who = ids ? { customerId: { in: ids } } : {};
  const paySelect = {
    paidAt: true, status: true, total: true, paymentTxnId: true, paymentMethod: true, paidAmount: true, paymentRequestedAt: true,
    paymentClaimedAt: true, paymentFailedAt: true, refundedAt: true, refundAmount: true, internalNote: true,
  } as const;
  const [ordersRaw, openRaw, refundRows, dueRefundRaw, billable] = await Promise.all([
    db.order.findMany({
      where: { clientId, ...who, createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { ...paySelect, createdAt: true, items: true },
    }),
    db.order.findMany({
      where: { clientId, ...who, paidAt: null, status: { in: ["NEW", "CONFIRMED", "DISPATCHED", "DELIVERED"] }, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
      select: { ...paySelect, id: true, number: true, ref: true, customerId: true, items: true, createdAt: true, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.order.aggregate({ where: { clientId, ...who, refundedAt: { gte: start, lt: end } }, _sum: { refundAmount: true } }),
    db.order.findMany({
      where: { clientId, ...who, status: "CANCELLED", refundedAt: null, OR: [{ paidAt: { not: null } }, { paidAmount: { gt: 0 } }] },
      select: { ...paySelect, id: true, number: true, ref: true, customerId: true, items: true, createdAt: true, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.$queryRaw<{ k: string; cat: string; n: bigint }[]>`
      SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'YYYY-MM-DD') AS k, m."pricingCategory" AS cat, count(*) AS n
      FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE c."clientId" = ${clientId} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])) AND m.billable = true AND m."pricingCategory" IS NOT NULL
        AND m."createdAt" >= ${start} AND m."createdAt" < ${end}
      GROUP BY 1, 2`,
  ]);
  const catalog = await catalogFor(clientId);
  const orders = narrowOrders(ordersRaw, opts.products ?? [], catalog);
  const open = narrowOrders(openRaw, opts.products ?? [], catalog);

  const dayKey = (d: Date) => formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
  const keyOf = (d: Date) => (weekly ? weekKey(dayKey(d)) : dayKey(d));
  const dayList: RevenueDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const key = keyOf(d);
    if (dayList.some((x) => x.key === key)) continue;
    dayList.push({ key, label: formatInTimeZone(d, APP_TZ, days > 14 ? "d" : "EEE"), sub: formatInTimeZone(d, APP_TZ, days > 14 ? "MMM" : "d MMM"), upi: 0, cash: 0, other: 0, pending: 0, spend: 0 });
  }
  const byKey = new Map(dayList.map((d) => [d.key, d]));
  const methods = new Map<MethodShare["key"], MethodShare>((["upi", "cash", "other", "pending"] as const).map((k) => [k, { key: k, label: GROUP_LABEL[k], amount: 0, orders: 0 }]));
  let paid = 0;
  let paidOrders = 0;
  let received = 0;
  for (const o of orders) {
    if (!isBought(o)) continue;
    const d = byKey.get(keyOf(o.paidAt ?? o.createdAt)) ?? byKey.get(keyOf(o.createdAt));
    if (!d) continue;
    const g = methodGroup(o);
    // Kept after any refund, and never more than the order total (narrowed to some products, that's just their lines).
    const got = Math.max(0, Math.min(o.total, receivedOf(o) - (o.refundAmount ?? 0)));
    d[g] += g === "pending" ? o.total : got;
    if (g !== "pending" && got < o.total) d.pending += o.total - got;
    const m = methods.get(g)!;
    m.amount += g === "pending" ? o.total : got;
    m.orders++;
    if (g !== "pending" && got < o.total) methods.get("pending")!.amount += o.total - got;
    paid += o.total;
    received += got;
    paidOrders++;
  }
  let spend = 0;
  for (const b of billable) {
    const cost = Number(b.n) * (RATES[b.cat] ?? 0) * (1 + INDIA_GST_RATE);
    const d = byKey.get(weekly ? weekKey(b.k) : b.k);
    if (d) d.spend += cost;
    spend += cost;
  }

  type Row = (typeof open)[number];
  const item = (o: Row, amount = dueOf(o) || o.total): CashItem => ({ id: o.id, ref: orderRef(o), customerId: o.customerId, name: o.customer.name, total: amount, at: o.createdAt, status: o.status, note: o.internalNote });
  const state = (o: Row) => paymentState(o);
  const refunded = refundRows._sum.refundAmount ?? 0;
  const upiAmount = methods.get("upi")!.amount;
  const inHand = upiAmount + methods.get("cash")!.amount + methods.get("other")!.amount;
  return {
    days: dayList,
    paid,
    paidOrders,
    received: Math.round(received * 100) / 100,
    refunded,
    upiShare: inHand ? Math.round((upiAmount / inHand) * 100) : 0,
    methods: [...methods.values()],
    spend,
    toVerify: open.filter((o) => state(o) === "claimed").map((o) => item(o)),
    awaitingPayment: open.filter((o) => ["requested", "failed"].includes(state(o))).map((o) => item(o)),
    codToCollect: open.filter((o) => state(o) === "cod_due" && o.status !== "NEW").map((o) => item(o)),
    owed: open.filter((o) => ["unpaid", "part_paid"].includes(state(o)) && o.status !== "NEW").map((o) => item(o)),
    unpaidCarts: open.filter((o) => o.status === "NEW" && state(o) === "unpaid").map((o) => item(o)),
    refundsDue: dueRefundRaw.map((o) => item(o, Math.max(0, receivedOf(o) - (o.refundAmount ?? 0)))),
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
  const catalog = await catalogFor(clientId);
  const bought = orders.filter(isBought);
  const single = new Map<string, { orders: number; units: number; price: number; last: Date }>();
  const pair = new Map<string, number>();
  for (const o of bought) {
    // Only catalogue products: lines that aren't catalogue items are left out.
    const items = ((o.items as OrderItem[] | null) ?? []).map((i) => ({ i, ref: catalog.item(i) })).filter((x) => x.ref !== null);
    const names = [...new Set(items.map((x) => x.ref!.name))].sort();
    for (const { i, ref } of items) {
      const n = ref!.name;
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

  const catalogue = await catalogProducts(clientId).catch(() => []);
  const slowCut = new Date(Date.now() - 45 * DAY);
  const slow: SlowMover[] = catalogue
    .map((p) => {
      const s = single.get(p.name);
      return { name: p.name, price: s?.price || p.priceAmount || 0, lastSold: s?.last ?? null, units: s?.units ?? 0 };
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
    abandoned: orders.filter((o) => (o.status === "NEW" || o.status === "CANCELLED") && !o.paidAt).length,
  };
}

export async function weeklyReport(clientId: string, now = new Date()): Promise<WeeklyReport> {
  const today = dayStart(now);
  const to = addDays(today, 1);
  const from = new Date(today.getTime() - 6 * DAY);
  const prevFrom = new Date(from.getTime() - 7 * DAY);
  const [cur, prev, orders] = await Promise.all([
    weekFigures(clientId, from, to),
    weekFigures(clientId, prevFrom, from),
    db.order.findMany({ where: { clientId, createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } }, select: { items: true, total: true, paidAt: true, status: true, createdAt: true } }),
  ]);
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    const isToday = i === 6;
    return {
      key: formatInTimeZone(d, APP_TZ, "yyyy-MM-dd"),
      label: isToday ? "Today" : formatInTimeZone(d, APP_TZ, "EEE"),
      revenue: 0,
    };
  });
  const catalog = await catalogFor(clientId);
  const prods = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) {
    if (!isBought(o)) continue;
    const day = daily.find((d) => d.key === formatInTimeZone(o.createdAt, APP_TZ, "yyyy-MM-dd"));
    if (day) day.revenue += o.total;
    for (const i of (o.items as OrderItem[] | null) ?? []) {
      const nme = catalog.item(i)?.name ?? i.name;
      if (!nme) continue;
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
