import { BarChart3, CheckCheck, Clock, MapPin, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ActionButton } from "@/components/action-button";
import { Calendar3D, Eye3D, Messages3D, Rupee3D, Send3D, ShoppingBag3D, Template3D } from "@/components/icons-3d";
import { Avatar, Badge, buttonClass, Callout, Card, CardHeader, EmptyState, Meter, rowClass, StatusBadge, Table, Td, Th } from "@/components/ui";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { APP_TZ, daysAgo, fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/provider";
import { estimateDuration, formatMinutes } from "@/lib/schedule";
import { getScope, owned, ownedMessages } from "@/lib/session";
import { numberHealth } from "@/lib/limits";
import { codesOf, PAUSING_KINDS } from "@/lib/meta-errors";
import { HELD_CODES } from "@/lib/held";
import type { OrderItem } from "@/lib/orders";
import { cancelRun, runDispatcherNow } from "./actions/campaigns";
import { BrandHero } from "./brand-hero";
import { AreaChips } from "./area-chips";
import { SpendCard } from "./spend-card";
import {
  ActivityCard,
  BestTimeCard,
  BusinessPriorityStrip,
  C,
  CustomerScenariosCard,
  DeliveryCard,
  FunnelCard,
  KpiTile,
  NumberLimitsCard,
  RANGES,
  RangeTabs,
  TodayCard,
  TopProductsCard,
  type CustomerScenariosData,
  type ProductDemandRow,
  type Range,
} from "./overview-cards";

export const dynamic = "force-dynamic";

/** Region share colours: a ramp of the brand green, then neutral for "no location". */
const REGION_COLORS = ["bg-series-read", "bg-series-delivered", "bg-series-sent", "bg-line-2"];

const tagLabel = (tag: string) => (tag === "no-item-info" ? "No item recorded" : tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));

/** Midnight of the given moment's day, in the app's time zone. */
const dayStart = (d: Date) => fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export default async function Overview({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const range: Range = sp.range === "today" || sp.range === "30d" ? sp.range : "7d";
  const { days, prev: prevLabel } = RANGES[range];
  const hourly = range === "today";

  const scope = await getScope();
  const mine = owned(scope);
  const myMessages = ownedMessages(scope);
  const cid = scope.clientId;

  // The period, and the same stretch of time just before it (today so far vs yesterday up to now).
  const now = new Date();
  const start = dayStart(daysAgo(days - 1));
  const span = days * 86_400_000;
  const prevStart = new Date(start.getTime() - span);
  const prevEnd = new Date(now.getTime() - span);
  const todayStart = dayStart(now);
  const monthAgo = daysAgo(30);

  // Buckets for the charts: hours of today, or calendar days of the period.
  const bucketSql = hourly ? "HH24" : "YYYY-MM-DD";
  const keys = hourly
    ? Array.from({ length: Number(formatInTimeZone(now, APP_TZ, "H")) + 1 }, (_, h) => String(h).padStart(2, "0"))
    : Array.from({ length: days }, (_, i) => formatInTimeZone(addDays(start, i), APP_TZ, "yyyy-MM-dd"));
  const labelFor = (k: string) => (hourly ? hourLabel(Number(k)) : formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", days > 7 ? "d MMM" : "EEE d"));
  const tipFor = (k: string) => (hourly ? `${hourLabel(Number(k))} – ${hourLabel((Number(k) + 1) % 24)}` : formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", "EEE d MMM"));
  const keyOf = (d: Date) => formatInTimeZone(d, APP_TZ, hourly ? "HH" : "yyyy-MM-dd");

  const [client, segments, results, repliesByTag, health, blocked, areaRows] = await Promise.all([
    cid ? db.client.findUnique({ where: { id: cid } }) : null,
    cid
      ? db.$queryRaw<{ tag: string; n: bigint }[]>`
          SELECT t.tag, count(*) AS n
          FROM "Customer" c CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
          WHERE c."clientId" = ${cid} AND c."optedOut" = false
            AND lower(t.tag) NOT IN ('customer','customers','vip','test','manual-order','lapsed','whatsapp','qr','sheet','no-item-info','thenan-oils','cup-n-saucer','new','pending','imported','lead','admin','staff','friend','family')
          GROUP BY 1 ORDER BY 2 DESC, 1`
      : [],
    cid
      ? db.$queryRaw<{ tag: string; sent: bigint; delivered: bigint; read: bigint; failed: bigint }[]>`
          WITH cust_prods AS (
            SELECT c.id AS cid, p.product AS tag
            FROM "Customer" c
            CROSS JOIN LATERAL (
              SELECT DISTINCT prod AS product FROM (
                SELECT trim(elem->>'name') AS prod
                FROM "Order" o, jsonb_array_elements(o.items) AS elem
                WHERE o."customerId" = c.id
                  AND trim(coalesce(elem->>'name', '')) <> ''
                  AND trim(elem->>'name') !~* '^manual-[0-9]+$'
                UNION
                SELECT trim(part) AS prod
                FROM regexp_split_to_table(coalesce(c.purchases, ''), '[,/;&]+') AS part
                WHERE trim(part) <> ''
                  AND NOT EXISTS (SELECT 1 FROM "Order" o2 WHERE o2."customerId" = c.id)
                UNION
                SELECT initcap(replace(t, '-', ' ')) AS prod
                FROM unnest(c.tags) AS t
                WHERE lower(t) NOT IN ('customer','customers','vip','test','manual-order','lapsed','whatsapp','qr','sheet','no-item-info','thenan-oils','cup-n-saucer','new','pending','imported','lead','admin','staff','friend','family')
                  AND coalesce(trim(c.purchases), '') = ''
                  AND NOT EXISTS (SELECT 1 FROM "Order" o3 WHERE o3."customerId" = c.id)
              ) raw_prods
              WHERE prod IS NOT NULL AND prod <> ''
            ) p
            WHERE c."clientId" = ${cid}
          )
          SELECT cp.tag,
            count(*) AS sent,
            count(*) FILTER (WHERE m.status IN ('DELIVERED', 'READ')) AS delivered,
            count(*) FILTER (WHERE m.status = 'READ') AS read,
            count(*) FILTER (WHERE m.status = 'FAILED') AS failed
          FROM "Message" m
          JOIN cust_prods cp ON cp.cid = m."customerId"
          WHERE m."createdAt" >= ${monthAgo} AND m.status NOT IN ('QUEUED', 'SKIPPED')
          GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`
      : [],
    cid
      ? db.$queryRaw<{ tag: string; n: bigint }[]>`
          WITH cust_prods AS (
            SELECT c.id AS cid, p.product AS tag
            FROM "Customer" c
            CROSS JOIN LATERAL (
              SELECT DISTINCT prod AS product FROM (
                SELECT trim(elem->>'name') AS prod
                FROM "Order" o, jsonb_array_elements(o.items) AS elem
                WHERE o."customerId" = c.id
                  AND trim(coalesce(elem->>'name', '')) <> ''
                  AND trim(elem->>'name') !~* '^manual-[0-9]+$'
                UNION
                SELECT trim(part) AS prod
                FROM regexp_split_to_table(coalesce(c.purchases, ''), '[,/;&]+') AS part
                WHERE trim(part) <> ''
                  AND NOT EXISTS (SELECT 1 FROM "Order" o2 WHERE o2."customerId" = c.id)
                UNION
                SELECT initcap(replace(t, '-', ' ')) AS prod
                FROM unnest(c.tags) AS t
                WHERE lower(t) NOT IN ('customer','customers','vip','test','manual-order','lapsed','whatsapp','qr','sheet','no-item-info','thenan-oils','cup-n-saucer','new','pending','imported','lead','admin','staff','friend','family')
                  AND coalesce(trim(c.purchases), '') = ''
                  AND NOT EXISTS (SELECT 1 FROM "Order" o3 WHERE o3."customerId" = c.id)
              ) raw_prods
              WHERE prod IS NOT NULL AND prod <> ''
            ) p
            WHERE c."clientId" = ${cid}
          )
          SELECT cp.tag, count(DISTINCT r."customerId") AS n
          FROM "Reply" r
          JOIN cust_prods cp ON cp.cid = r."customerId"
          WHERE r."receivedAt" >= ${monthAgo}
          GROUP BY 1`
      : [],
    cid ? numberHealth(cid) : [],
    // Active campaigns whose template Meta paused, disabled or rejected can't send.
    db.campaign.findMany({
      where: { ...mine, active: true, template: { status: { in: ["PAUSED", "DISABLED", "REJECTED"] } } },
      select: { id: true, name: true, template: { select: { name: true, status: true, statusReason: true } } },
    }),
    cid ? db.customer.groupBy({ by: ["region", "location"], where: { clientId: cid, optedOut: false }, _count: true }) : [],
  ]);

  const [customers, optedOut, prevStatus, msgSeries, activeRuns, upcoming, recentRaw, failures, settings, orders, replySeries, repliers, prevReplies, funnelRows, heat, todayMsgs, todayReplies] =
    await Promise.all([
      db.customer.count({ where: { ...mine, optedOut: false } }),
      db.customer.count({ where: { ...mine, optedOut: true } }),
      db.message.groupBy({ by: ["status"], where: { ...myMessages, createdAt: { gte: prevStart, lt: prevEnd }, status: { notIn: ["QUEUED", "SKIPPED"] } }, _count: true }),
      db.$queryRaw<{ k: string; status: string; n: bigint }[]>`
        SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, ${bucketSql}) AS k, m.status::text AS status, count(*) AS n
        FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE m."createdAt" >= ${start} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid})
        GROUP BY 1, 2`,
      db.campaignRun.findMany({
        where: { campaign: mine, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"] } },
        include: { campaign: true },
        orderBy: { startedAt: "desc" },
      }),
      db.campaign.findMany({
        where: { ...mine, active: true, nextRunAt: { not: null } },
        include: { template: { select: { name: true, status: true } } },
        orderBy: { nextRunAt: "asc" },
        take: 5,
      }),
      db.message.findMany({ where: { ...myMessages, status: { not: "QUEUED" } }, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 40 }),
      // Failures in the last day, grouped by reason, so problems show up without opening the log.
      db.message.groupBy({
        by: ["error"],
        where: { ...myMessages, status: "FAILED", failedAt: { gte: daysAgo(1) }, OR: [{ errorCode: null }, { errorCode: { notIn: HELD_CODES } }] },
        _count: true,
        orderBy: { _count: { error: "desc" } },
        take: 3,
      }),
      getSettings(),
      // All orders of this period and the comparison stretch (including NEW unpaid carts and CANCELLED carts for cart-abandonment analytics).
      db.order
        .findMany({
          where: { ...mine, createdAt: { gte: prevStart } },
          select: {
            id: true,
            number: true,
            customerId: true,
            status: true,
            paidAt: true,
            paymentRequestedAt: true,
            createdAt: true,
            total: true,
            items: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { createdAt: "desc" },
        })
        .catch(() => []),
      db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT to_char((r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, ${bucketSql}) AS k, count(*) AS n
        FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."receivedAt" >= ${start} AND (${cid}::text IS NULL OR c."clientId" = ${cid})
        GROUP BY 1`,
      db.reply.groupBy({ by: ["customerId"], where: { ...myMessages, receivedAt: { gte: start } }, _count: true }),
      db.reply.count({ where: { ...myMessages, receivedAt: { gte: prevStart, lt: prevEnd } } }),
      // People messaged in the period and how far each got: received, read, replied, browsed catalogue, added to cart, and bought within 7 days.
      db.$queryRaw<{
        messaged: bigint;
        delivered: bigint;
        read: bigint;
        replied: bigint;
        browsed: bigint;
        added_to_cart: bigint;
        ordered: bigint;
        revenue: number;
      }[]>`
        WITH sent AS (
          SELECT m."customerId" AS cid, min(m."createdAt") AS first_at,
            bool_or(m.status IN ('DELIVERED', 'READ')) AS delivered, bool_or(m.status = 'READ') AS read
          FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
          WHERE m."createdAt" >= ${start} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid})
          GROUP BY 1
        ), carts AS (
          SELECT DISTINCT o.id, o.total, o.status, o."paidAt", o."customerId" FROM "Order" o JOIN sent s ON s.cid = o."customerId"
          WHERE o."createdAt" >= s.first_at AND o."createdAt" < s.first_at + interval '7 days'
        ), bought AS (
          SELECT * FROM carts WHERE status IN ('CONFIRMED', 'PAID', 'DISPATCHED', 'DELIVERED') OR "paidAt" IS NOT NULL
        )
        SELECT count(*) AS messaged,
          count(*) FILTER (WHERE delivered) AS delivered,
          count(*) FILTER (WHERE read) AS read,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Reply" r WHERE r."customerId" = sent.cid AND r."receivedAt" >= sent.first_at)) AS replied,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM "Message" m2 WHERE m2."customerId" = sent.cid AND m2."createdAt" >= sent.first_at AND m2."templateName" IN ('Catalogue', 'Price list')
          ) OR EXISTS (
            SELECT 1 FROM "Reply" r2 WHERE r2."customerId" = sent.cid AND r2."receivedAt" >= sent.first_at AND r2.text ~* '(price|rate|catalog|order now|view price)'
          )) AS browsed,
          (SELECT count(DISTINCT "customerId") FROM carts WHERE status <> 'CANCELLED') AS added_to_cart,
          (SELECT count(DISTINCT "customerId") FROM bought) AS ordered,
          (SELECT coalesce(sum(total), 0)::float FROM bought) AS revenue
        FROM sent`.catch(() => []),
      // Replies by weekday and 3-hour block over 90 days: when customers actually answer.
      db.$queryRaw<{ d: number; b: number; n: bigint }[]>`
        SELECT extract(dow FROM (r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ})::int AS d,
          (extract(hour FROM (r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ})::int / 3) AS b, count(*) AS n
        FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."receivedAt" >= ${daysAgo(90)} AND (${cid}::text IS NULL OR c."clientId" = ${cid})
        GROUP BY 1, 2`,
      db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'HH24') AS k, count(*) AS n
        FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE m."createdAt" >= ${todayStart} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid})
        GROUP BY 1`,
      db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT to_char((r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'HH24') AS k, count(*) AS n
        FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."receivedAt" >= ${todayStart} AND (${cid}::text IS NULL OR c."clientId" = ${cid})
        GROUP BY 1`,
    ]);

  // Extra business-scenario queries: catalogue/price-list sends, period replies with customer info, and unhandled chats.
  const [catalogueMsgs, periodReplies, unhandledGroup, toDispatchCount] = await Promise.all([
    db.message
      .findMany({
        where: { ...myMessages, createdAt: { gte: start }, templateName: { in: ["Catalogue", "Price list"] } },
        select: { customerId: true, templateName: true, status: true, createdAt: true, customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
    db.reply
      .findMany({
        where: { ...myMessages, receivedAt: { gte: start } },
        select: { customerId: true, text: true, kind: true, handled: true, receivedAt: true, customer: { select: { name: true, phone: true } } },
        orderBy: { receivedAt: "desc" },
      })
      .catch(() => []),
    db.reply.groupBy({ by: ["customerId"], where: { ...myMessages, handled: false }, _count: true }).catch(() => []),
    db.order.count({ where: { ...mine, status: { in: ["CONFIRMED", "PAID"] } } }).catch(() => 0),
  ]);

  // Messages Meta held back (too much marketing to that person) are retried automatically and not
  // charged: worth knowing, but nothing to fix, so they don't count as something needing attention.
  const heldToday = await db.message.count({ where: { ...myMessages, status: "FAILED", failedAt: { gte: daysAgo(1) }, errorCode: { in: HELD_CODES } } });
  const failedToday = failures.reduce((n, f) => n + f._count, 0);
  // A campaign paused because the token, app permissions or Meta account stopped every send.
  const paused = await db.message.findFirst({
    where: { ...myMessages, status: "QUEUED", OR: [{ errorCode: { in: codesOf(PAUSING_KINDS) } }, { errorCode: { gte: 200, lte: 299 } }] },
    orderBy: { createdAt: "desc" },
    select: { error: true, run: { select: { campaign: { select: { id: true, name: true } } } } },
  });
  // GitHub runs the scheduler every 5 minutes, sometimes late; 20 minutes of silence means it stopped.
  const schedulerQuiet = scope.isAdmin && (!settings.lastDispatchAt || settings.lastDispatchAt < daysAgo(20 / (24 * 60)));
  const issues = [paused, schedulerQuiet, failedToday > 0, blocked.length > 0].filter(Boolean).length;

  const runProgress = activeRuns.length
    ? await db.message.groupBy({ by: ["runId", "status"], where: { runId: { in: activeRuns.map((r) => r.id) } }, _count: true })
    : [];

  /* ── Period figures ── */
  const at = (k: string, s?: string) => msgSeries.filter((r) => r.k === k && (!s || r.status === s)).reduce((n, r) => n + Number(r.n), 0);
  const tally = (s: string) => msgSeries.filter((r) => r.status === s).reduce((n, r) => n + Number(r.n), 0);
  const read = tally("READ");
  const deliveredOnly = tally("DELIVERED");
  const sentOnly = tally("SENT");
  const failed = tally("FAILED");
  const delivered = deliveredOnly + read;
  const total = delivered + sentOnly + failed;
  const prevCount = (s: string) => prevStatus.find((r) => r.status === s)?._count ?? 0;
  const prevRead = prevCount("READ");
  const prevDelivered = prevCount("DELIVERED") + prevRead;
  const prevTotal = prevDelivered + prevCount("SENT") + prevCount("FAILED");

  // Distinguish actual bought/confirmed orders from unpaid WhatsApp carts ("NEW" with paidAt == null) and cancelled carts.
  const isBought = (o: (typeof orders)[number]) =>
    o.status === "CONFIRMED" || o.status === "PAID" || o.status === "DISPATCHED" || o.status === "DELIVERED" || o.paidAt !== null;
  const isUnpaidCart = (o: (typeof orders)[number]) => o.status === "NEW" && o.paidAt === null;

  const curAllOrders = orders.filter((o) => o.createdAt >= start);
  const curOrders = curAllOrders.filter(isBought);
  const curUnpaidCarts = curAllOrders.filter(isUnpaidCart);
  const curCancelledCarts = curAllOrders.filter((o) => o.status === "CANCELLED");

  const prevBoughtOrders = orders.filter((o) => o.createdAt >= prevStart && o.createdAt < prevEnd && isBought(o));
  const revenue = curOrders.reduce((n, o) => n + o.total, 0);
  const unpaidCartRevenue = curUnpaidCarts.reduce((n, o) => n + o.total, 0);
  const cancelledCartRevenue = curCancelledCarts.reduce((n, o) => n + o.total, 0);
  const prevRevenue = prevBoughtOrders.reduce((n, o) => n + o.total, 0);
  const replies = replySeries.reduce((n, r) => n + Number(r.n), 0);

  const sentSpark = keys.map((k) => at(k));
  const deliveredSpark = keys.map((k) => at(k, "DELIVERED") + at(k, "READ"));
  const readSpark = keys.map((k) => at(k, "READ"));
  const readRateSpark = keys.map((k) => {
    const d = at(k, "DELIVERED") + at(k, "READ");
    return d ? (at(k, "READ") / d) * 100 : 0;
  });
  const revenueSpark = keys.map((k) => curOrders.filter((o) => keyOf(o.createdAt) === k).reduce((n, o) => n + o.total, 0));
  const replySpark = keys.map((k) => Number(replySeries.find((r) => r.k === k)?.n ?? 0));

  const disabledSections = client?.disabledSections ?? [];
  const ordersOn = isSectionEnabled(disabledSections, "orders");
  const repliesOn = isSectionEnabled(disabledSections, "replies");
  const campaignsOn = isSectionEnabled(disabledSections, "campaigns");
  const templatesOn = isSectionEnabled(disabledSections, "templates");

  // Product demand: separate bought items vs. items added to cart & left unpaid/cancelled.
  const productMap = new Map<string, ProductDemandRow>();
  for (const o of curAllOrders) {
    const bought = isBought(o);
    for (const it of (o.items as OrderItem[] | null) ?? []) {
      const name = it.name ?? it.id;
      const qty = Number(it.quantity) || 0;
      const val = (Number(it.price) || 0) * qty;
      const row = productMap.get(name) ?? { name, qty: 0, revenue: 0, cartOnlyQty: 0, cartOnlyValue: 0 };
      if (bought) {
        row.qty += qty;
        row.revenue += val;
      } else {
        row.cartOnlyQty = (row.cartOnlyQty ?? 0) + qty;
        row.cartOnlyValue = (row.cartOnlyValue ?? 0) + val;
      }
      productMap.set(name, row);
    }
  }
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue + (b.cartOnlyValue ?? 0) - (a.revenue + (a.cartOnlyValue ?? 0)) || b.qty - a.qty)
    .slice(0, 6);

  // Customer behaviour & cart scenario analysis across the period.
  const cartCustomerIds = new Set(curAllOrders.map((o) => o.customerId));
  const boughtCustomerIds = new Set(curOrders.map((o) => o.customerId));
  const unpaidCartCustomerIds = new Set(curUnpaidCarts.map((o) => o.customerId));
  const cancelledCustomerIds = new Set(curCancelledCarts.map((o) => o.customerId));

  // Customers who browsed catalogue / price list (either received Catalogue/Price list message or tapped Order now / Price list button)
  const browsedCustomerMap = new Map<string, { name: string; phone: string; detail: string; at: Date }>();
  for (const m of catalogueMsgs) {
    if (!browsedCustomerMap.has(m.customerId)) {
      browsedCustomerMap.set(m.customerId, {
        name: m.customer.name,
        phone: m.customer.phone,
        detail: `${m.templateName} (${m.status.toLowerCase()})`,
        at: m.createdAt,
      });
    }
  }
  for (const r of periodReplies) {
    if (/(price|rate|catalog|order now|view price)/i.test(r.text) && !browsedCustomerMap.has(r.customerId)) {
      browsedCustomerMap.set(r.customerId, {
        name: r.customer.name,
        phone: r.customer.phone,
        detail: `Tapped "${r.text.slice(0, 28)}"`,
        at: r.receivedAt,
      });
    }
  }

  const browsedNoCartLeads = [...browsedCustomerMap.entries()]
    .filter(([cidKey]) => !cartCustomerIds.has(cidKey))
    .map(([cidKey, info]) => ({
      customerId: cidKey,
      name: info.name,
      phone: info.phone,
      detail: info.detail,
      at: info.at,
      href: `/dashboard/customers/${cidKey}`,
    }));

  const inquiryOnlyMap = new Map<string, { name: string; phone: string; detail: string; at: Date }>();
  for (const r of periodReplies) {
    if (r.kind === "order") continue;
    if (cartCustomerIds.has(r.customerId) || browsedCustomerMap.has(r.customerId)) continue;
    if (!inquiryOnlyMap.has(r.customerId)) {
      inquiryOnlyMap.set(r.customerId, {
        name: r.customer.name,
        phone: r.customer.phone,
        detail: r.text.slice(0, 36),
        at: r.receivedAt,
      });
    }
  }

  const formatCartItems = (items: unknown) => {
    const arr = (items as OrderItem[] | null) ?? [];
    if (!arr.length) return "Cart";
    return arr
      .slice(0, 2)
      .map((i) => `${i.quantity}× ${i.name ?? i.id}`)
      .join(", ") + (arr.length > 2 ? ` +${arr.length - 2} more` : "");
  };

  const buyerOrderCounts = new Map<string, number>();
  for (const o of curOrders) buyerOrderCounts.set(o.customerId, (buyerOrderCounts.get(o.customerId) ?? 0) + 1);
  const repeatBuyersCount = [...buyerOrderCounts.values()].filter((c) => c > 1).length;

  const totalBrowsersOrCarts = new Set([...browsedCustomerMap.keys(), ...cartCustomerIds]).size;
  const nonCancelledCartCustomers = new Set(curAllOrders.filter((o) => o.status !== "CANCELLED").map((o) => o.customerId)).size;

  const f = funnelRows[0];
  const funnel = {
    messaged: Number(f?.messaged ?? 0),
    delivered: Number(f?.delivered ?? 0),
    read: Number(f?.read ?? 0),
    replied: Number(f?.replied ?? 0),
    browsed: Math.max(Number(f?.browsed ?? 0), totalBrowsersOrCarts),
    addedToCart: Math.max(Number(f?.added_to_cart ?? 0), nonCancelledCartCustomers),
    ordered: Number(f?.ordered ?? 0),
  };

  const scenariosData: CustomerScenariosData = {
    periodLabel: hourly ? "today so far" : `the last ${days} days`,
    addedToCartUnpaid: {
      customers: unpaidCartCustomerIds.size,
      carts: curUnpaidCarts.length,
      value: unpaidCartRevenue,
      leads: curUnpaidCarts.slice(0, 4).map((o) => ({
        customerId: o.customerId,
        name: o.customer.name,
        phone: o.customer.phone,
        detail: `RG-${1000 + o.number} · ${formatCartItems(o.items)}`,
        amount: o.total,
        at: o.createdAt,
        href: `/dashboard/customers/${o.customerId}`,
      })),
    },
    browsedNoCart: {
      customers: browsedNoCartLeads.length,
      leads: browsedNoCartLeads.slice(0, 4),
    },
    cancelledCarts: {
      customers: cancelledCustomerIds.size,
      carts: curCancelledCarts.length,
      value: cancelledCartRevenue,
      leads: curCancelledCarts.slice(0, 3).map((o) => ({
        customerId: o.customerId,
        name: o.customer.name,
        phone: o.customer.phone,
        detail: `RG-${1000 + o.number} · ${formatCartItems(o.items)}`,
        amount: o.total,
        at: o.createdAt,
        href: `/dashboard/customers/${o.customerId}`,
      })),
    },
    convertedBuyers: {
      customers: boughtCustomerIds.size,
      orders: curOrders.length,
      revenue,
      repeatBuyers: repeatBuyersCount,
      leads: curOrders.slice(0, 4).map((o) => ({
        customerId: o.customerId,
        name: o.customer.name,
        phone: o.customer.phone,
        detail: `RG-${1000 + o.number} (${o.status.toLowerCase()}) · ${formatCartItems(o.items)}`,
        amount: o.total,
        at: o.createdAt,
        href: `/dashboard/customers/${o.customerId}`,
      })),
    },
    repliedInquiryOnly: {
      customers: inquiryOnlyMap.size,
      leads: [...inquiryOnlyMap.entries()].slice(0, 4).map(([cidKey, info]) => ({
        customerId: cidKey,
        name: info.name,
        phone: info.phone,
        detail: info.detail,
        at: info.at,
        href: `/dashboard/customers/${cidKey}`,
      })),
    },
    readNoAction: {
      customers: Math.max(0, funnel.read - funnel.replied),
    },
    catalogueToCartPct: totalBrowsersOrCarts > 0 ? pct(cartCustomerIds.size, totalBrowsersOrCarts) : 0,
    cartToBuyPct: curAllOrders.length > 0 ? pct(curOrders.length, curAllOrders.length) : 0,
  };

  const nowHour = Number(formatInTimeZone(now, APP_TZ, "H"));
  const todayHours = Array.from({ length: nowHour + 1 }, (_, h) => {
    const k = String(h).padStart(2, "0");
    return { label: hourLabel(h), tip: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, sent: Number(todayMsgs.find((r) => r.k === k)?.n ?? 0), replies: Number(todayReplies.find((r) => r.k === k)?.n ?? 0) };
  });

  const adminActions = scope.isAdmin && (
    <>
      {campaignsOn && (
        <ActionButton action={runDispatcherNow} size="md" title="Process due campaigns and batches now">
          <Send className="size-4" /> Run scheduler
        </ActionButton>
      )}
      {campaignsOn ? (
        <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
          <Calendar3D className="size-4" /> New campaign
        </Link>
      ) : templatesOn ? (
        <Link href="/dashboard/templates" className={buttonClass("primary")}>
          <Template3D className="size-4" /> Templates
        </Link>
      ) : null}
    </>
  );

  // Group Latest messages so each customer appears once (newest message + count of recent messages to them).
  const recentByCustomer = new Map<string, (typeof recentRaw)[number] & { recentCount: number }>();
  for (const m of recentRaw) {
    const existing = recentByCustomer.get(m.customerId);
    if (existing) {
      existing.recentCount += 1;
    } else {
      recentByCustomer.set(m.customerId, { ...m, recentCount: 1 });
    }
  }
  const recent = [...recentByCustomer.values()].slice(0, 6);

  // Product and segment tags, largest first; the client-wide tag (e.g. thenan-oils) says nothing on its own.
  const clientTag = client?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const shown = segments.map((t) => ({ tag: t.tag, n: Number(t.n) })).filter((t) => t.tag !== clientTag || segments.length === 1).slice(0, 8);
  const top = shown[0]?.n ?? 0;
  // Location view: city vs outside, plus the busiest areas.
  const REGIONS = ["Madurai city", "Outside Madurai", "Not sure"];
  const byRegion = [
    ...REGIONS.map((r) => ({ key: r, label: r, n: areaRows.filter((a) => a.region === r).reduce((t, a) => t + a._count, 0), href: `region:${r}` })),
    { key: "none", label: "No location noted", n: areaRows.filter((a) => !a.location).reduce((t, a) => t + a._count, 0), href: "none" },
  ].filter((r) => r.n);
  const regionTotal = byRegion.reduce((t, r) => t + r.n, 0);
  const sortedAreas = areaRows
    .filter((a): a is typeof a & { location: string } => typeof a.location === "string" && a.location.length > 0)
    .sort((a, b) => b._count - a._count)
    .map((a) => ({ location: a.location as string, _count: a._count }));
  const topAreas = sortedAreas.slice(0, 10);
  const otherAreas = sortedAreas.slice(10);
  const byProduct = results
    .filter((r) => r.tag !== clientTag || results.length === 1)
    .map((r) => ({ tag: r.tag, sent: Number(r.sent), delivered: Number(r.delivered), read: Number(r.read), failed: Number(r.failed), replies: Number(repliesByTag.find((x) => x.tag === r.tag)?.n ?? 0) }));

  const every = hourly ? 3 : days > 7 ? 5 : 1;
  const periodText = hourly ? "today so far" : `the last ${days} days`;

  return (
    <>
      <BrandHero
        client={client}
        name={client?.name ?? (scope.isAdmin ? "all clients" : "there")}
        customers={customers}
        issues={issues}
        actions={adminActions}
        period={<RangeTabs range={range} />}
      />

      {heldToday > 0 && (
        <Callout tone="info" icon={<Clock />} className="mb-5" title={`Meta held back ${fmtNumber(heldToday)} marketing message${heldToday === 1 ? "" : "s"} in the last 24 hours. No action needed.`}>
          Those customers recently got a lot of marketing from businesses on WhatsApp, so Meta paused delivery to them. Held messages aren&apos;t charged, and campaign messages are
          retried automatically after a few days.{" "}
          <Link href="/dashboard/messages?status=FAILED">See them in the log</Link>
        </Callout>
      )}

      {issues > 0 && (
        <div className="mb-5 space-y-3">
          {paused && (
            <Callout role="alert" tone="danger" icon={<TriangleAlert />} title="Campaigns are paused: WhatsApp can't send right now">
              {scope.isAdmin ? (
                <>
                  {paused.error}. Queued messages are kept and go out automatically once it&apos;s fixed
                  {paused.run && (
                    <>
                      {" "}(first seen on <Link href={`/dashboard/campaigns/${paused.run.campaign.id}`}>{paused.run.campaign.name}</Link>)
                    </>
                  )}
                  .
                </>
              ) : (
                <>There&apos;s a problem with the WhatsApp account setup. Queued messages are kept and go out once your admin fixes it.</>
              )}
            </Callout>
          )}
          {schedulerQuiet && (
            <Callout tone="warning" icon={<Clock />} title={`The scheduler hasn't run ${settings.lastDispatchAt ? `since ${fmtDate(settings.lastDispatchAt, "d MMM, h:mm a")}` : "yet"}.`}>
              Scheduled campaigns won&apos;t start until it does. Check the &quot;Campaign scheduler&quot; workflow in GitHub → Actions (it pauses after 60 days without commits).
            </Callout>
          )}
          {failedToday > 0 && (
            <Callout tone="danger" icon={<TriangleAlert />} title={`${fmtNumber(failedToday)} message${failedToday === 1 ? "" : "s"} failed in the last 24 hours.`}>
              <ul className="mt-0.5 list-disc pl-5">
                {failures.map((x) => (
                  <li key={x.error ?? "unknown"}>
                    {x.error ?? "Unknown error"} ({x._count})
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/messages?status=FAILED" className="mt-1 inline-flex min-h-11 items-center sm:min-h-0">
                See failed messages
              </Link>
            </Callout>
          )}
          {blocked.length > 0 && (
            <Callout role="alert" tone="danger" icon={<TriangleAlert />} title={`${blocked.length === 1 ? "A campaign can't send" : `${blocked.length} campaigns can't send`}: Meta stopped the template`}>
              <ul className="space-y-1">
                {blocked.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/campaigns/${c.id}`}>{c.name}</Link>: template <span className="font-mono">{c.template.name}</span> is{" "}
                    {c.template.status === "PAUSED" ? "paused by Meta for low quality" : c.template.status === "DISABLED" ? "disabled by Meta" : "rejected"}
                    {c.template.statusReason ? ` (${c.template.statusReason.toLowerCase().replace(/_/g, " ")})` : ""}.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Edit the template so it&apos;s more useful to customers, or switch the campaign to another approved template.</p>
            </Callout>
          )}
        </div>
      )}

      <BusinessPriorityStrip
        unpaidCartsCount={curUnpaidCarts.length}
        unpaidCartsValue={unpaidCartRevenue}
        unpaidCustomersCount={unpaidCartCustomerIds.size}
        browsedNoCartCount={browsedNoCartLeads.length}
        toDispatchCount={toDispatchCount}
        unhandledRepliesCount={unhandledGroup.length}
        showOrders={ordersOn}
        showReplies={repliesOn}
      />

      {/* Headline figures for the period, each with its real change against the stretch before. */}
      <div
        role="group"
        aria-label={`Figures for ${periodText}`}
        className={`grid grid-cols-2 gap-3 sm:gap-4 ${repliesOn ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        {ordersOn ? (
          <KpiTile
            label="Confirmed sales"
            value={revenue}
            format="inr"
            sub={
              <>
                {fmtNumber(curOrders.length)} bought
                {curUnpaidCarts.length > 0 ? ` · +₹${Math.round(unpaidCartRevenue).toLocaleString("en-IN")} in ${curUnpaidCarts.length} unpaid cart${curUnpaidCarts.length === 1 ? "" : "s"}` : curOrders.length ? ` · avg ₹${Math.round(revenue / curOrders.length).toLocaleString("en-IN")}` : ""}
              </>
            }
            icon={Rupee3D}
            color={C.gold}
            spark={revenueSpark}
            delta={{ cur: revenue, prev: prevRevenue, kind: "pct" }}
            vs={prevLabel}
            href="/dashboard/orders?show=all"
          />
        ) : (
          <KpiTile
            label="Messages delivered"
            value={delivered}
            format="count"
            sub={`${pct(delivered, total)}% delivery rate · ${fmtNumber(read)} read`}
            icon={CheckCheck}
            color={C.read}
            spark={deliveredSpark}
            delta={{ cur: delivered, prev: prevDelivered, kind: "pct" }}
            vs={prevLabel}
            href="/dashboard/messages?status=DELIVERED"
          />
        )}
        <KpiTile
          label="Messages sent"
          value={total}
          format="count"
          sub={`${fmtNumber(failed)} failed · ${fmtNumber(customers)} active customers${optedOut ? `, ${fmtNumber(optedOut)} opted out` : ""}`}
          icon={Send3D}
          color={C.brand}
          spark={sentSpark}
          delta={{ cur: total, prev: prevTotal, kind: "pct" }}
          vs={prevLabel}
          href="/dashboard/messages"
        />
        <KpiTile
          label="Read rate"
          value={pct(read, delivered)}
          format="percent"
          sub={`${fmtNumber(read)} of ${fmtNumber(delivered)} delivered were read`}
          icon={Eye3D}
          color={C.read}
          spark={readRateSpark}
          delta={prevDelivered ? { cur: pct(read, delivered), prev: pct(prevRead, prevDelivered), kind: "pts" } : null}
          vs={prevLabel}
        />
        {repliesOn && (
          <KpiTile
            label="Customer replies"
            value={replies}
            format="count"
            sub={`from ${fmtNumber(repliers.length)} customer${repliers.length === 1 ? "" : "s"}${browsedNoCartLeads.length ? ` · ${browsedNoCartLeads.length} browsed only` : ""}`}
            icon={Messages3D}
            color={C.info}
            spark={replySpark}
            delta={{ cur: replies, prev: prevReplies, kind: "pct" }}
            vs={prevLabel}
            href="/dashboard/replies"
          />
        )}
      </div>

      {activeRuns.length > 0 && (
        <Card className="card-3d mt-4 sm:mt-5">
          <CardHeader tone="brand" icon={<Send3D />} title="Sending now" description="Campaigns delivering in batches. Batch size or interval changes apply from the next batch." />
          <ul className="divide-y divide-line">
            {activeRuns.map((r) => {
              const by = (s: string) => runProgress.find((p) => p.runId === r.id && p.status === s)?._count ?? 0;
              const queued = by("QUEUED");
              const done = r.total - queued;
              const eta = estimateDuration(queued, r.campaign.batchSize, r.campaign.intervalMinutes);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/campaigns/${r.campaignId}`} className="font-medium text-ink hover:underline">
                        {r.campaign.name}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <Meter raised className="mt-2" value={pct(done, r.total)} label={`${r.campaign.name} progress`} />
                    <p className="tabular mt-1.5 text-xs text-muted">
                      {fmtNumber(done)} of {fmtNumber(r.total)} processed · {by("FAILED")} failed ·{" "}
                      {queued ? `${r.campaign.batchSize} every ${r.campaign.intervalMinutes} min, about ${formatMinutes(eta)} left · next batch ${fmtDate(r.nextBatchAt, "h:mm a")}` : "finishing"}
                    </p>
                  </div>
                  {scope.isAdmin && (
                    <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run? Queued messages will not be sent.">
                      Stop
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Activity and delivery. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <ActivityCard
            title="Message activity"
            description={hourly ? "By hour, today so far" : `By day, the last ${days} days`}
            labels={keys.map(labelFor)}
            tooltipLabels={keys.map(tipFor)}
            every={every}
            series={[
              { key: "sent", label: "Sent", color: C.brand, values: sentSpark },
              { key: "read", label: "Read", color: C.read, values: readSpark },
              ...(repliesOn ? [{ key: "replies", label: "Replies", color: C.info, values: replySpark, area: false }] : []),
            ]}
          />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <DeliveryCard read={read} delivered={deliveredOnly} sent={sentOnly} failed={failed} />
        </div>
      </div>

      {/* Outcomes, live status and sending limits. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 md:grid-cols-2 xl:grid-cols-12">
        <div className="min-w-0 md:col-span-2 xl:col-span-5">
          <FunnelCard
            f={funnel}
            revenue={revenue || Number(f?.revenue ?? 0)}
            unpaidCartRevenue={unpaidCartRevenue}
            unpaidCartCount={curUnpaidCarts.length}
            showOrders={ordersOn}
            showReplies={repliesOn}
          />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <TodayCard
            hours={todayHours}
            sent={todayHours.reduce((n, h) => n + h.sent, 0)}
            replies={todayHours.reduce((n, h) => n + h.replies, 0)}
            sending={activeRuns.map((r) => ({ name: r.campaign.name, total: r.total, done: r.total - (runProgress.find((p) => p.runId === r.id && p.status === "QUEUED")?._count ?? 0) }))}
            next={campaignsOn && upcoming[0]?.nextRunAt ? { name: upcoming[0].name, at: upcoming[0].nextRunAt } : null}
          />
        </div>
        <div className="min-w-0 xl:col-span-3">
          <NumberLimitsCard numbers={health} />
        </div>
      </div>

      {/* Deep Customer Behaviour & Cart Drop-Off Scenarios */}
      {ordersOn && <CustomerScenariosCard data={scenariosData} />}


      {/* When to send, and what sells. */}
      {(repliesOn || ordersOn) && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-12">
          {repliesOn && (
            <div className={`min-w-0 ${ordersOn ? "xl:col-span-7" : "xl:col-span-12"}`}>
              <BestTimeCard cells={heat.map((h) => ({ d: h.d, b: h.b, n: Number(h.n) }))} days={90} />
            </div>
          )}
          {ordersOn && (
            <div className={`min-w-0 ${repliesOn ? "xl:col-span-5" : "xl:col-span-12"}`}>
              <TopProductsCard items={topProducts} rangeLabel={hourly ? "Today" : `Last ${days} days`} />
            </div>
          )}
        </div>
      )}

      {/* Day-to-day detail. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 sm:space-y-5 xl:col-span-7">
          <Card className="card-3d">
            <CardHeader
              tone="info"
              icon={<Messages3D />}
              title="Latest messages"
              description="One thread per customer · newest message sent from the portal"
              action={
                <Link href="/dashboard/messages" className={buttonClass("ghost", "sm")}>
                  Open log
                </Link>
              }
            />
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((m) => (
                  <li key={m.customerId} className="relative flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-subtle sm:px-5">
                    <Avatar name={m.customer.name} className="size-8 text-xs max-sm:hidden" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        <Link href={`/dashboard/customers/${m.customerId}`} className="after:absolute after:inset-0">
                          {m.customer.name}
                        </Link>{" "}
                        <span className="tabular font-normal text-muted">{formatPhone(m.customer.phone)}</span>
                        {m.recentCount > 1 && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                            {m.recentCount} msgs
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">{m.body ?? m.templateName}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={m.status} />
                      <time className="tabular text-xs text-muted max-sm:hidden" dateTime={(m.sentAt ?? m.createdAt).toISOString()}>
                        {fmtDate(m.sentAt ?? m.createdAt, "d MMM, h:mm a")}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Send3D />} title="No messages yet">
                Sent messages will appear here with their delivery status.
              </EmptyState>
            )}
          </Card>

          {byProduct.length > 0 && (
            <Card className="card-3d">
              <CardHeader tone="brand" icon={<BarChart3 />} title="Campaign results by product" description="Last 30 days · which product buyers read your messages and write back" />
              {/* Phones: one compact row per product instead of a sideways-scrolling table. */}
              <ul className="divide-y divide-line sm:hidden">
                {byProduct.map((r) => (
                  <li key={r.tag} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/dashboard/customers?tag=${encodeURIComponent(`product:${r.tag}`)}`} className="min-w-0 truncate text-sm font-medium text-ink">
                        {r.tag}
                      </Link>
                      <span className="tabular shrink-0 text-xs text-muted">
                        {fmtNumber(r.sent)} sent{r.failed > 0 && <span className="text-danger"> · {r.failed} failed</span>}
                      </span>
                    </div>
                    <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
                      {[
                        ["Delivered", `${pct(r.delivered, r.sent)}%`],
                        ["Read", `${pct(r.read, r.delivered)}%`],
                        ["Replies", fmtNumber(r.replies)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col-reverse rounded-control bg-sunken px-1 py-1.5">
                          <dt className="text-xs text-muted">{k}</dt>
                          <dd className="text-sm font-semibold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="max-sm:hidden">
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th numeric>Sent</Th>
                      <Th numeric>Delivered</Th>
                      <Th numeric>Read</Th>
                      <Th numeric>Replies</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProduct.map((r) => (
                      <tr key={r.tag} className={rowClass}>
                        <Td className="font-medium">
                          <Link href={`/dashboard/customers?tag=${encodeURIComponent(`product:${r.tag}`)}`} className="hover:underline">
                            {r.tag}
                          </Link>
                        </Td>
                        <Td numeric>
                          {fmtNumber(r.sent)}
                          {r.failed > 0 && <span className="ml-1 text-xs text-danger">({r.failed} failed)</span>}
                        </Td>
                        <Td numeric>{pct(r.delivered, r.sent)}%</Td>
                        <Td numeric>
                          <span className="inline-flex items-center gap-2">
                            <Meter raised className="hidden w-16 md:block" value={pct(r.read, r.delivered)} />
                            {pct(r.read, r.delivered)}%
                          </span>
                        </Td>
                        <Td numeric>
                          {r.replies ? (
                            <Link href="/dashboard/replies?show=all" className="font-medium text-brand-deep hover:underline">
                              {fmtNumber(r.replies)}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5 xl:col-span-5">
          {campaignsOn && (
            <Card className="card-3d">
              <CardHeader
                tone="violet"
                icon={<Calendar3D />}
                title="Coming up"
                description="Next scheduled campaign sends"
                action={
                  <Link href="/dashboard/campaigns" className={buttonClass("ghost", "sm")}>
                    All campaigns
                  </Link>
                }
              />
              {upcoming.length ? (
                <ul className="divide-y divide-line">
                  {upcoming.map((c) => (
                    <li key={c.id} className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle active:bg-sunken sm:px-5">
                      <div className="grid w-11 shrink-0 place-items-center rounded-control border border-line bg-panel py-1 text-center">
                        <span className="text-2xs font-medium uppercase text-muted">{fmtDate(c.nextRunAt, "EEE")}</span>
                        <span className="tabular text-sm font-semibold leading-tight text-ink">{fmtDate(c.nextRunAt, "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-sm font-medium text-ink after:absolute after:inset-0">
                          {c.name}
                        </Link>
                        <p className="truncate text-xs text-muted">
                          {fmtDate(c.nextRunAt, "h:mm a")} · {c.template.name}
                        </p>
                      </div>
                      {c.template.status !== "APPROVED" && <Badge tone="amber">Template not approved</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Calendar3D />} title="Nothing scheduled">
                  {scope.isAdmin ? "Create a weekly campaign to start sending automatically." : "Upcoming campaigns will show here."}
                </EmptyState>
              )}
            </Card>
          )}

          {cid && <SpendCard clientId={cid} canManage={scope.canManage} />}

          {shown.length > 0 && (
            <Card className="card-3d">
              <CardHeader tone="gold" icon={<ShoppingBag3D />} title="What your customers buy" description="Customers per product or group · each can get its own campaign" />
              <ul className="grid gap-x-6 gap-y-0.5 p-2 sm:grid-cols-2 sm:p-3">
                {shown.map((t) => (
                  <li key={t.tag}>
                    <Link href={`/dashboard/customers?tag=${encodeURIComponent(t.tag)}`} className="group block rounded-control px-2.5 py-2.5 transition hover:bg-subtle active:bg-sunken">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-ink group-hover:underline">{tagLabel(t.tag)}</span>
                        <span className="tabular text-xs font-medium text-ink-2">{fmtNumber(t.n)}</span>
                      </div>
                      <Meter raised className="mt-1.5" value={Math.max(4, pct(t.n, top))} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {byRegion.length > 1 && (
        <Card className="card-3d mt-4 sm:mt-5">
          <CardHeader tone="info" icon={<MapPin />} title="Customers by area" description="From the order sheets · tap an area to see its customers" />
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {byRegion.map((r, i) => (
                  <div key={r.key} className={`${REGION_COLORS[i] ?? "bg-line-2"} first:rounded-l-full last:rounded-r-full`} style={{ width: `${pct(r.n, regionTotal)}%` }} />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:gap-x-2">
                {byRegion.map((r, i) => (
                  <li key={r.key}>
                    <Link href={`/dashboard/customers?area=${encodeURIComponent(r.href)}`} className="group flex min-h-11 items-center gap-2 rounded-control px-1 text-sm transition hover:bg-subtle sm:min-h-9 sm:px-2">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-[3px] ${REGION_COLORS[i] ?? "bg-line-2"}`} />
                      <span className="text-ink-2 group-hover:underline">{r.label}</span>
                      <span className="tabular text-xs text-muted">
                        {fmtNumber(r.n)} · {pct(r.n, regionTotal)}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <AreaChips topAreas={topAreas} otherAreas={otherAreas} />
          </div>
        </Card>
      )}
    </>
  );
}
