import { orderRef } from "@/lib/order-ref";
import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import type { OrderItem } from "./orders";
import { SALE_WHERE } from "@/lib/sale";

// Refill forecast: when each buyer is likely to run out, from their own reorder rhythm when they
// have one (two or more orders), otherwise from the client's refill setting (or 30 days).

const DAY = 86_400_000;
/** Orders closer together than this count as one shopping trip, not a refill. */
const SAME_TRIP_DAYS = 4;

export type RefillDue = {
  customerId: string;
  name: string;
  phone: string;
  area: string | null;
  lastOrderId: string;
  lastOrderRef: string;
  lastOrderAt: Date;
  lastTotal: number;
  /** Average paid order, used as the expected value of the refill. */
  avgOrder: number;
  orders: number;
  items: string[];
  cycleDays: number;
  /** "own" = from their order history; "default" = the client's refill setting. */
  cycleSource: "own" | "default";
  dueAt: Date;
  /** Calendar days from today (negative = overdue). */
  daysLeft: number;
  reminderSentAt: Date | null;
  /** They have an unpaid cart newer than the last paid order. */
  openCart: { id: string; ref: string; total: number } | null;
  /** They wrote to us in the last 24 hours, so a free text reply is possible. */
  windowOpen: boolean;
};

export type RefillForecast = {
  defaultCycle: number;
  lapsedDays: number;
  refillAutoOn: boolean;
  refillTemplateId: string | null;
  refillTemplateName: string | null;
  due: RefillDue[];
  /** Buyers past the lapsed line: the win-back list, counted but not listed here. */
  lapsedCount: number;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Calendar-day difference in the app's time zone, so "due today" means today in India. */
export function dayDiff(from: Date, to: Date) {
  const a = Date.parse(`${formatInTimeZone(from, APP_TZ, "yyyy-MM-dd")}T00:00:00Z`);
  const b = Date.parse(`${formatInTimeZone(to, APP_TZ, "yyyy-MM-dd")}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

export async function refillForecast(clientId: string, now = new Date()): Promise<RefillForecast> {
  // The client's settings (and their reminder template) are read alongside the orders, not before them.
  const clientRead = db.client.findUnique({
    where: { id: clientId },
    select: { refillDays: true, refillTemplateId: true, lapsedDays: true },
  });
  const templateRead = clientRead.then((c) => (c?.refillTemplateId ? db.template.findUnique({ where: { id: c.refillTemplateId }, select: { name: true } }) : null));

  const since = new Date(now.getTime() - 400 * DAY);
  const [client, template, [orders, carts, recentReplies]] = await Promise.all([clientRead, templateRead, Promise.all([
    db.order.findMany({
      where: {
        clientId,
        createdAt: { gte: since },
        AND: [{ status: { not: "CANCELLED" } }, SALE_WHERE],
        customer: { optedOut: false, unreachable: false },
      },
      select: {
        id: true,
        number: true, ref: true,
        customerId: true,
        createdAt: true,
        total: true,
        items: true,
        reminderSentAt: true,
        customer: { select: { name: true, phone: true, location: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.order.findMany({
      where: { clientId, paidAt: null, status: { in: ["NEW", "CONFIRMED"] }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      select: { id: true, number: true, ref: true, customerId: true, total: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.reply.groupBy({
      by: ["customerId"],
      where: { customer: { clientId }, receivedAt: { gte: new Date(now.getTime() - DAY) } },
      _count: true,
    }),
  ])]);
  const defaultCycle = client?.refillDays && client.refillDays > 0 ? client.refillDays : 30;
  const lapsedDays = client?.lapsedDays ?? 60;

  const byCustomer = new Map<string, typeof orders>();
  for (const o of orders) {
    const list = byCustomer.get(o.customerId) ?? [];
    list.push(o);
    byCustomer.set(o.customerId, list);
  }
  const replied = new Set(recentReplies.map((r) => r.customerId));

  const due: RefillDue[] = [];
  let lapsedCount = 0;
  for (const [customerId, list] of byCustomer) {
    // Collapse orders from the same shopping trip, then read the gaps between trips.
    const trips: Date[] = [];
    for (const o of list) {
      const last = trips[trips.length - 1];
      if (!last || (o.createdAt.getTime() - last.getTime()) / DAY >= SAME_TRIP_DAYS) trips.push(o.createdAt);
    }
    const gaps = trips.slice(1).map((d, i) => (d.getTime() - trips[i].getTime()) / DAY);
    const own = gaps.length ? Math.round(median(gaps)) : null;
    const cycleDays = own ? Math.min(120, Math.max(7, own)) : defaultCycle;

    const last = list[list.length - 1];
    const age = dayDiff(last.createdAt, now);
    if (age > Math.max(lapsedDays, cycleDays + 14)) {
      lapsedCount++;
      continue;
    }
    const dueAt = new Date(last.createdAt.getTime() + cycleDays * DAY);
    const cart = carts.find((c) => c.customerId === customerId && c.createdAt > last.createdAt);

    const names = new Map<string, number>();
    for (const o of list.slice(-3)) {
      for (const it of (o.items as OrderItem[] | null) ?? []) {
        const n = (it.name ?? it.id ?? "").trim();
        if (n && !/^manual-\d+$/i.test(n)) names.set(n, (names.get(n) ?? 0) + (Number(it.quantity) || 1));
      }
    }

    due.push({
      customerId,
      name: last.customer.name,
      phone: last.customer.phone,
      area: last.customer.location,
      lastOrderId: last.id,
      lastOrderRef: orderRef(last),
      lastOrderAt: last.createdAt,
      lastTotal: last.total,
      avgOrder: list.reduce((n, o) => n + o.total, 0) / list.length,
      orders: trips.length,
      items: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 3),
      cycleDays,
      cycleSource: own ? "own" : "default",
      dueAt,
      daysLeft: dayDiff(now, dueAt),
      reminderSentAt: last.reminderSentAt,
      openCart: cart ? { id: cart.id, ref: orderRef(cart), total: cart.total } : null,
      windowOpen: replied.has(customerId),
    });
  }

  due.sort((a, b) => a.daysLeft - b.daysLeft || b.avgOrder - a.avgOrder);
  return {
    defaultCycle,
    lapsedDays,
    refillAutoOn: Boolean(client?.refillDays && client.refillTemplateId),
    refillTemplateId: client?.refillTemplateId ?? null,
    refillTemplateName: template?.name ?? null,
    due,
    lapsedCount,
  };
}
