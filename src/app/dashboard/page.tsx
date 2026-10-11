import { CheckCheck, Clock, Send, TriangleAlert } from "@/components/icons";
import Link from "next/link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ActionButton } from "@/components/action-button";
import { Calendar3D, Eye3D, Messages3D, Rupee3D, Send3D, Template3D } from "@/components/icons-3d";
import { Avatar, Badge, buttonClass, Callout, Card, CardHeader, EmptyState, Meter, StatusBadge } from "@/components/ui";
import { getCatalogWithProducts } from "@/lib/catalog";
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
import { analyzeCartMentality } from "@/lib/cart-mentality";
import { refillForecast } from "@/lib/refill-forecast";
import type { OrderItem } from "@/lib/orders";
import { cancelRun, runDispatcherNow } from "./actions/campaigns";
import { BrandHero } from "./brand-hero";
import { AreaChips } from "./area-chips";
import { SpendCard } from "./spend-card";
import {
  AllProductsIntelligenceCard,
  CustomerGrowthPlaybookCard,
  ProductCampaignGraphCard,
  type AllProductAnalyticsItem,
  type AllProductsSummaryData,
  type CustomerWinbackPlaybookData,
  type PlaybookScenario,
} from "./intelligence-hub";
import { CartMentalityCard, CustomerAreasCard, CustomerProductsCard, CustomerScenariosCard } from "./insight-cards";
import {
  ActivityCard,
  BestTimeCard,
  C,
  DeliveryCard,
  FunnelCard,
  KpiTile,
  NumberLimitsCard,
  TodayCard,
  TopProductsCard,
  VIEW_FILTER_NOTE,
  VIEW_FILTERS,
  VIEWS,
  type AnchorProductInsight,
  type CartMentalitySummaryData,
  type CartRevisionJourney,
  type CustomerScenariosData,
  type DroppedProductInsight,
  type ProductDemandRow,
  type View,
} from "./overview-cards";
import { ViewTabs } from "./view-tabs";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { activeCount, filterQuery, keepFilters, narrowOrders, periodKeys, readFilters, resolvePeriod, weekKey } from "@/lib/filters";
import { filterOptions, scopedCustomerIds } from "@/lib/filter-scope";

export const dynamic = "force-dynamic";


const tagLabel = (tag: string) => (tag === "no-item-info" ? "No item recorded" : tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));

/** Midnight of the given moment's day, in the app's time zone. */
const dayStart = (d: Date) => fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export default async function Overview({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  // Each section offers (and uses) only the filters that change its figures; others in the link are dropped.
  const askedView = (typeof sp.view === "string" && sp.view in VIEW_FILTERS ? sp.view : "overview") as View;
  const filters = keepFilters(readFilters(sp), VIEW_FILTERS[askedView]);

  const scope = await getScope();
  const cid = scope.clientId;
  const now = new Date();
  const firstOrder = filters.range === "all" && cid ? await db.order.findFirst({ where: { clientId: cid }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null;
  // The period (any preset or custom dates) and the same stretch of time just before it.
  const period = resolvePeriod(filters, now, firstOrder?.createdAt);
  const { start, end, prevStart, prevEnd, prevLabel } = period;
  const hourly = period.bucket === "hour";
  const weekly = period.bucket === "week";

  // Who and what the figures cover: customers picked directly, by group, area, product or campaign.
  const allowed = cid ? await scopedCustomerIds(cid, filters) : null;
  const ids = allowed;
  const mine = owned(scope);
  const mineOrders = allowed ? { ...mine, customerId: { in: allowed } } : mine;
  const mineCustomers = allowed ? { ...mine, id: { in: allowed } } : mine;
  const myMessages = allowed ? { customer: { ...(cid ? { clientId: cid } : {}), id: { in: allowed } } } : ownedMessages(scope);
  const filterOpts = cid ? await filterOptions(cid) : null;
  const filtered = activeCount(filters) > 0;

  const todayStart = dayStart(now);
  const monthAgo = daysAgo(30);

  // Buckets for the charts: hours of one day, calendar days, or weeks for long periods.
  const bucketSql = hourly ? "HH24" : "YYYY-MM-DD";
  const keys = periodKeys(period, now);
  const bucketOf = (k: string) => (weekly ? weekKey(k) : k);
  const labelFor = (k: string) => (hourly ? hourLabel(Number(k)) : formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", keys.length > 7 ? "d MMM" : "EEE d"));
  const tipFor = (k: string) =>
    hourly ? `${hourLabel(Number(k))} – ${hourLabel((Number(k) + 1) % 24)}` : weekly ? `Week of ${formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", "d MMM")}` : formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", "EEE d MMM");
  const keyOf = (d: Date) => bucketOf(formatInTimeZone(d, APP_TZ, hourly ? "HH" : "yyyy-MM-dd"));

  const [client, segments, results, repliesByTag, health, blocked, areaRows] = await Promise.all([
    cid ? db.client.findUnique({ where: { id: cid } }) : null,
    cid
      ? db.$queryRaw<{ tag: string; n: bigint }[]>`
          SELECT t.tag, count(*) AS n
          FROM "Customer" c CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
          WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])) AND c."optedOut" = false
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
            WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[]))
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
            WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[]))
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
    cid ? db.customer.groupBy({ by: ["region", "location"], where: { clientId: cid, optedOut: false, ...(allowed && { id: { in: allowed } }) }, _count: true }) : [],
  ]);

  const [customers, optedOut, prevStatus, msgSeries, activeRuns, upcoming, recentRaw, failures, settings, ordersRaw, replySeries, repliers, prevReplies, funnelRows, heat, todayMsgs, todayReplies] =
    await Promise.all([
      db.customer.count({ where: { ...mineCustomers, optedOut: false } }),
      db.customer.count({ where: { ...mineCustomers, optedOut: true } }),
      db.message.groupBy({ by: ["status"], where: { ...myMessages, createdAt: { gte: prevStart, lt: prevEnd }, status: { notIn: ["QUEUED", "SKIPPED"] } }, _count: true }),
      db.$queryRaw<{ k: string; status: string; n: bigint }[]>`
        SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, ${bucketSql}) AS k, m.status::text AS status, count(*) AS n
        FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE m."createdAt" >= ${start} AND m."createdAt" < ${end} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
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
          where: { ...mineOrders, createdAt: { gte: prevStart, lt: end } },
          select: {
            id: true,
            number: true,
            customerId: true,
            status: true,
            paidAt: true,
            paymentRequestedAt: true,
            internalNote: true,
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
        WHERE r."receivedAt" >= ${start} AND r."receivedAt" < ${end} AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
        GROUP BY 1`,
      db.reply.groupBy({ by: ["customerId"], where: { ...myMessages, receivedAt: { gte: start, lt: end } }, _count: true }),
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
          WHERE m."createdAt" >= ${start} AND m."createdAt" < ${end} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
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
          (SELECT count(DISTINCT "customerId") FROM carts) AS added_to_cart,
          (SELECT count(DISTINCT "customerId") FROM bought) AS ordered,
          (SELECT coalesce(sum(total), 0)::float FROM bought) AS revenue
        FROM sent`.catch(() => []),
      // Replies by weekday and 3-hour block over 90 days: when customers actually answer.
      db.$queryRaw<{ d: number; b: number; n: bigint }[]>`
        SELECT extract(dow FROM (r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ})::int AS d,
          (extract(hour FROM (r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ})::int / 3) AS b, count(*) AS n
        FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."receivedAt" >= ${daysAgo(90)} AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
        GROUP BY 1, 2`,
      db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'HH24') AS k, count(*) AS n
        FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE m."createdAt" >= ${todayStart} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
        GROUP BY 1`,
      db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT to_char((r."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'HH24') AS k, count(*) AS n
        FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."receivedAt" >= ${todayStart} AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
        GROUP BY 1`,
    ]);

  // Extra business-scenario queries: catalogue/price-list sends, period replies with customer info, unhandled chats, full product catalog, all-time product buyers, and customer lifecycle cohorts.
  // Payments that need a person: a customer says they paid, or a cancelled order still owes a refund.
  const [paymentsToCheckCount, refundsDueCount] = await Promise.all([
    db.order.count({ where: { ...mineOrders, paidAt: null, paymentClaimedAt: { not: null }, status: { not: "CANCELLED" } } }).catch(() => 0),
    db.order.count({ where: { ...mineOrders, status: "CANCELLED", refundedAt: null, OR: [{ paidAt: { not: null } }, { paidAmount: { gt: 0 } }] } }).catch(() => 0),
  ]);
  const [catalogueMsgs, periodReplies, unhandledGroup, toDispatchCount, catalogRes, allTimeProdRows, customerLifecycleRows] = await Promise.all([
    db.message
      .findMany({
        where: { ...myMessages, createdAt: { gte: start, lt: end }, templateName: { in: ["Catalogue", "Price list"] } },
        select: { customerId: true, templateName: true, status: true, createdAt: true, customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
    db.reply
      .findMany({
        where: { ...myMessages, receivedAt: { gte: start, lt: end } },
        select: { customerId: true, text: true, kind: true, handled: true, receivedAt: true, customer: { select: { name: true, phone: true } } },
        orderBy: { receivedAt: "desc" },
      })
      .catch(() => []),
    db.reply.groupBy({ by: ["customerId"], where: { ...myMessages, handled: false }, _count: true }).catch(() => []),
    db.order.count({ where: { ...mineOrders, status: { in: ["CONFIRMED", "PAID"] } } }).catch(() => 0),
    cid ? getCatalogWithProducts(cid).catch(() => null) : Promise.resolve(null),
    cid
      ? db
          .$queryRaw<{ prod: string; buyers: bigint; units: bigint }[]>`
            WITH raw_items AS (
              SELECT o."customerId" AS cid, trim(elem->>'name') AS prod, coalesce((elem->>'quantity')::int, 1) AS qty
              FROM "Order" o
              JOIN "Customer" c ON c.id = o."customerId"
              CROSS JOIN LATERAL jsonb_array_elements(o.items) AS elem
              WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[]))
                AND (o.status IN ('CONFIRMED', 'PAID', 'DISPATCHED', 'DELIVERED') OR o."paidAt" IS NOT NULL)
                AND trim(coalesce(elem->>'name', '')) <> ''
                AND trim(elem->>'name') !~* '^manual-[0-9]+$'
              UNION ALL
              SELECT c.id AS cid, trim(part) AS prod, 1 AS qty
              FROM "Customer" c
              CROSS JOIN LATERAL regexp_split_to_table(coalesce(c.purchases, ''), '[,/;&]+') AS part
              WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[]))
                AND trim(part) <> ''
                AND NOT EXISTS (SELECT 1 FROM "Order" o2 WHERE o2."customerId" = c.id)
            )
            SELECT prod, count(DISTINCT cid) AS buyers, coalesce(sum(qty), 0) AS units
            FROM raw_items
            WHERE prod IS NOT NULL AND prod <> ''
            GROUP BY 1`
          .catch(() => [])
      : Promise.resolve([]),
    cid
      ? db
          .$queryRaw<{
            id: string;
            name: string;
            phone: string;
            purchases: string | null;
            tags: string[];
            paid_orders: bigint;
            last_order_at: Date | null;
            last_reply_at: Date | null;
          }[]>`
            SELECT
              c.id,
              c.name,
              c.phone,
              c.purchases,
              c.tags,
              count(o.id) FILTER (WHERE o.status IN ('CONFIRMED', 'PAID', 'DISPATCHED', 'DELIVERED') OR o."paidAt" IS NOT NULL) AS paid_orders,
              max(o."createdAt") FILTER (WHERE o.status IN ('CONFIRMED', 'PAID', 'DISPATCHED', 'DELIVERED') OR o."paidAt" IS NOT NULL) AS last_order_at,
              (SELECT max(r."receivedAt") FROM "Reply" r WHERE r."customerId" = c.id) AS last_reply_at
            FROM "Customer" c
            LEFT JOIN "Order" o ON o."customerId" = c.id
            WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])) AND c."optedOut" = false
            GROUP BY c.id`
          .catch(() => [])
      : Promise.resolve([]),
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

  // A product filter narrows every order to the picked products' lines (and drops the rest).
  const orders = narrowOrders(ordersRaw, filters.products);
  // Weekly charts: fold the daily series into weeks.
  if (weekly) {
    for (const r of msgSeries) r.k = weekKey(r.k);
    for (const r of replySeries) r.k = weekKey(r.k);
  }

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

  // Distinguish actual bought/confirmed orders from unpaid active WhatsApp carts ("NEW" or "CONFIRMED" with paidAt == null) and replaced/cancelled carts.
  const isBought = (o: (typeof orders)[number]) =>
    o.status === "PAID" || o.status === "DISPATCHED" || o.status === "DELIVERED" || o.paidAt !== null;
  const isUnpaidCart = (o: (typeof orders)[number]) =>
    (o.status === "NEW" || o.status === "CONFIRMED") && o.paidAt === null;

  const curAllOrders = orders.filter((o) => o.createdAt >= start && o.createdAt < end);
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
  const nonCancelledCartCustomers = new Set(curAllOrders.map((o) => o.customerId)).size;

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
    periodLabel: period.phrase,
    addedToCartUnpaid: {
      customers: unpaidCartCustomerIds.size,
      carts: curUnpaidCarts.length,
      value: unpaidCartRevenue,
      leads: curUnpaidCarts.slice(0, 4).map((o) => {
        const replacedNote = o.internalNote && /replaced unpaid cart/i.test(o.internalNote) ? ` (${o.internalNote})` : "";
        return {
          customerId: o.customerId,
          name: o.customer.name,
          phone: o.customer.phone,
          detail: `RG-${1000 + o.number} · ${formatCartItems(o.items)}${replacedNote}`,
          amount: o.total,
          at: o.createdAt,
          href: `/dashboard/customers/${o.customerId}`,
        };
      }),
    },
    browsedNoCart: {
      customers: browsedNoCartLeads.length,
      leads: browsedNoCartLeads.slice(0, 4),
    },
    cancelledCarts: {
      customers: cancelledCustomerIds.size,
      carts: curCancelledCarts.length,
      value: cancelledCartRevenue,
      leads: curCancelledCarts.slice(0, 4).map((o) => {
        const supersedeMatch = /Superseded by (RG-\d+)/i.exec(o.internalNote ?? "");
        const tag = supersedeMatch ? `Replaced by ${supersedeMatch[1]}` : "Cancelled";
        return {
          customerId: o.customerId,
          name: o.customer.name,
          phone: o.customer.phone,
          detail: `RG-${1000 + o.number} (${tag}) · ${formatCartItems(o.items)}`,
          amount: o.total,
          at: o.createdAt,
          href: `/dashboard/customers/${o.customerId}`,
        };
      }),
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

  // Multi-Cart Customer Mentality & Product Hesitation Analytics
  const ordersByCust = new Map<string, (typeof orders)[number][]>();
  for (const o of orders) {
    const arr = ordersByCust.get(o.customerId) ?? [];
    arr.push(o);
    ordersByCust.set(o.customerId, arr);
  }

  const journeys: CartRevisionJourney[] = [];
  const droppedMap = new Map<string, { name: string; count: number; qty: number; value: number; customers: Set<string> }>();
  const anchorMap = new Map<string, { name: string; count: number; qty: number; customers: Set<string> }>();

  let totalSupersededCarts = 0;
  let downsizedCount = 0;
  let downsizedValueLost = 0;
  let upsizedCount = 0;
  let upsizedValueGained = 0;
  let swappedCount = 0;
  let retriedCount = 0;
  const reviserCustomerIds = new Set<string>();

  // Evaluate each non-cancelled order in the current period against that customer's prior cart history
  for (const o of curAllOrders) {
    if (o.status === "CANCELLED") continue;
    const custHistory = (ordersByCust.get(o.customerId) ?? []).map((po) => ({
      id: po.id,
      number: po.number,
      total: po.total,
      currency: "INR",
      status: po.status,
      items: ((po.items as OrderItem[] | null) ?? []),
      internalNote: po.internalNote ?? null,
      createdAt: po.createdAt,
      paidAt: po.paidAt,
    }));
    const curItems = ((o.items as OrderItem[] | null) ?? []);
    const m = analyzeCartMentality(
      { id: o.id, number: o.number, total: o.total, currency: "INR", items: curItems, createdAt: o.createdAt },
      custHistory,
    );
    if (m.attemptCount > 1 && m.behavior !== "first_cart") {
      reviserCustomerIds.add(o.customerId);
      totalSupersededCarts += m.previousCarts.length;
      if (m.behavior === "downsized") {
        downsizedCount += 1;
        downsizedValueLost += Math.abs(m.deltaAmount);
      } else if (m.behavior === "upsized") {
        upsizedCount += 1;
        upsizedValueGained += Math.max(0, m.deltaAmount);
      } else if (m.behavior === "swapped") {
        swappedCount += 1;
      } else if (m.behavior === "duplicate_retry") {
        retriedCount += 1;
      }

      const firstCart = m.previousCarts[m.previousCarts.length - 1] ?? m.previousCarts[0];
      journeys.push({
        customerId: o.customerId,
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
        latestOrderId: o.id,
        latestOrderRef: `RG-${1000 + o.number}`,
        latestStatus: o.status,
        latestPaid: isBought(o),
        latestTotal: o.total,
        firstCartRef: firstCart ? `RG-${1000 + firstCart.number}` : `RG-${1000 + o.number}`,
        firstCartTotal: firstCart ? firstCart.total : o.total,
        attemptCount: m.attemptCount,
        behavior: m.behavior,
        headline: m.headline,
        deltaAmount: m.deltaAmount,
        droppedItems: m.droppedItems,
        addedItems: m.addedItems,
        keptItems: m.keptItems,
        at: o.createdAt,
      });

      for (const d of m.droppedItems) {
        const key = d.name.toLowerCase();
        const row = droppedMap.get(key) ?? { name: d.name, count: 0, qty: 0, value: 0, customers: new Set<string>() };
        row.count += 1;
        row.qty += d.quantity;
        row.value += (d.price || 0) * d.quantity;
        row.customers.add(o.customer.name);
        droppedMap.set(key, row);
      }

      for (const k of m.keptItems) {
        const key = k.name.toLowerCase();
        const row = anchorMap.get(key) ?? { name: k.name, count: 0, qty: 0, customers: new Set<string>() };
        row.count += 1;
        row.qty += k.quantity;
        row.customers.add(o.customer.name);
        anchorMap.set(key, row);
      }
    }
  }

  // Also include items from standalone cancelled carts where the customer hasn't bought that item in any active order
  for (const co of curCancelledCarts) {
    if (co.internalNote && /superseded by/i.test(co.internalNote)) continue; // already accounted in journeys above
    const custActiveItems = new Set(
      (ordersByCust.get(co.customerId) ?? [])
        .filter((x) => x.status !== "CANCELLED")
        .flatMap((x) => ((x.items as OrderItem[] | null) ?? []).map((it) => (it.name ?? it.id).toLowerCase())),
    );
    for (const it of (co.items as OrderItem[] | null) ?? []) {
      const name = (it.name ?? it.id).trim();
      const key = name.toLowerCase();
      if (!name || custActiveItems.has(key)) continue;
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const row = droppedMap.get(key) ?? { name, count: 0, qty: 0, value: 0, customers: new Set<string>() };
      row.count += 1;
      row.qty += qty;
      row.value += price * qty;
      row.customers.add(co.customer.name);
      droppedMap.set(key, row);
    }
  }

  const droppedProducts: DroppedProductInsight[] = [...droppedMap.values()]
    .map((r) => ({
      name: r.name,
      droppedCount: r.count,
      droppedQty: r.qty,
      droppedValue: r.value,
      customerNames: [...r.customers],
    }))
    .sort((a, b) => b.droppedValue - a.droppedValue || b.droppedCount - a.droppedCount)
    .slice(0, 6);

  const anchorProducts: AnchorProductInsight[] = [...anchorMap.values()]
    .map((r) => ({
      name: r.name,
      keptCount: r.count,
      boughtQty: r.qty,
      customerNames: [...r.customers],
    }))
    .sort((a, b) => b.keptCount - a.keptCount || b.boughtQty - a.boughtQty)
    .slice(0, 5);

  const cartMentalityData: CartMentalitySummaryData = {
    periodLabel: period.phrase,
    totalRevisers: reviserCustomerIds.size,
    totalSupersededCarts,
    downsizedCount,
    downsizedValueLost,
    upsizedCount,
    upsizedValueGained,
    swappedCount,
    retriedCount,
    journeys: journeys.slice(0, 6),
    droppedProducts,
    anchorProducts,
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
  // Location view: city vs outside, plus the busiest areas.
  const REGIONS = ["Madurai city", "Outside Madurai", "Not sure"];
  const byRegion = [
    ...REGIONS.map((r) => ({ key: r, label: r, n: areaRows.filter((a) => a.region === r).reduce((t, a) => t + a._count, 0), href: `region:${r}` })),
    { key: "none", label: "No location noted", n: areaRows.filter((a) => !a.location).reduce((t, a) => t + a._count, 0), href: "none" },
  ].filter((r) => r.n);
  const sortedAreas = areaRows
    .filter((a): a is typeof a & { location: string } => typeof a.location === "string" && a.location.length > 0)
    .sort((a, b) => b._count - a._count)
    .map((a) => ({ location: a.location as string, _count: a._count }));
  const topAreas = sortedAreas.slice(0, 10);
  const otherAreas = sortedAreas.slice(10);
  const byProduct = results
    .filter((r) => r.tag !== clientTag || results.length === 1)
    .map((r) => ({ tag: r.tag, sent: Number(r.sent), delivered: Number(r.delivered), read: Number(r.read), failed: Number(r.failed), replies: Number(repliesByTag.find((x) => x.tag === r.tag)?.n ?? 0) }));

  const every = hourly ? 3 : keys.length > 16 ? Math.ceil(keys.length / 7) : 1;
  const periodText = period.phrase;

  /* ── Full All-Products Analytics (Including 0-Sales / Non-Selling SKUs) ── */
  const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const inferCat = (name: string) => {
    const l = name.toLowerCase();
    if (/(soap|wash|bath|bar)/i.test(l)) return "Handmade Soaps";
    if (/(hair|shikakai|hibiscus|bhringraj|neeli|dandruff)/i.test(l)) return "Hair Care";
    if (/(ghee|honey|jaggery|spice|pod|masala|pickle)/i.test(l)) return "Pantry & Traditionals";
    if (/(oil|chekku|gingelly|groundnut|coconut|castor|mustard|sesame)/i.test(l)) return "Cold-Pressed Oils";
    if (/(combo|pack|kit|gift|bundle)/i.test(l)) return "Value Combos";
    return "General Catalogue";
  };

  // Period order & cart breakdown by normalized product name
  const periodProdStats = new Map<
    string,
    {
      displayName: string;
      soldQty: number;
      soldRevenue: number;
      soldOrders: Set<string>;
      cartQty: number;
      cartValue: number;
      cartOrders: Set<string>;
      unitPrice: number;
    }
  >();
  for (const o of curAllOrders) {
    if (o.status === "CANCELLED") continue;
    const bought = isBought(o);
    for (const it of (o.items as OrderItem[] | null) ?? []) {
      const rawName = (it.name ?? it.id ?? "").trim();
      if (!rawName || /^manual-\d+$/i.test(rawName)) continue;
      const k = normKey(rawName);
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const val = price * qty;
      const entry = periodProdStats.get(k) ?? {
        displayName: rawName,
        soldQty: 0,
        soldRevenue: 0,
        soldOrders: new Set<string>(),
        cartQty: 0,
        cartValue: 0,
        cartOrders: new Set<string>(),
        unitPrice: price,
      };
      if (price > 0 && entry.unitPrice === 0) entry.unitPrice = price;
      if (bought) {
        entry.soldQty += qty;
        entry.soldRevenue += val;
        entry.soldOrders.add(o.id);
      } else {
        entry.cartQty += qty;
        entry.cartValue += val;
        entry.cartOrders.add(o.id);
      }
      periodProdStats.set(k, entry);
    }
  }

  // All-time buyer & unit map
  const allTimeMap = new Map<string, { rawName: string; buyers: number; units: number }>();
  for (const r of allTimeProdRows) {
    const k = normKey(r.prod);
    if (!k) continue;
    const prev = allTimeMap.get(k);
    allTimeMap.set(k, {
      rawName: prev?.rawName ?? r.prod,
      buyers: (prev?.buyers ?? 0) + Number(r.buyers),
      units: (prev?.units ?? 0) + Number(r.units),
    });
  }

  // Campaign 30d reach map
  const campaignProdMap = new Map<string, { sent: number; read: number; replies: number }>();
  for (const r of byProduct) {
    const k = normKey(r.tag);
    campaignProdMap.set(k, { sent: r.sent, read: r.read, replies: r.replies });
  }

  // Start from the full Meta / Demo catalogue so every 0-sale SKU is guaranteed to appear
  const catalogList = catalogRes?.products ?? [];
  const combinedProdMap = new Map<
    string,
    {
      id: string;
      retailerId: string;
      name: string;
      category: string;
      priceAmount: number;
      inStock: boolean;
    }
  >();

  for (const cp of catalogList) {
    const k = normKey(cp.name);
    combinedProdMap.set(k, {
      id: cp.id,
      retailerId: cp.retailerId,
      name: cp.name,
      category: cp.category || inferCat(cp.name),
      priceAmount: cp.priceAmount,
      inStock: cp.inStock,
    });
  }

  // Also include any ordered, dropped, or historical product not already matched by exact normalized name
  let extraIdx = 1;
  const ensureProductInMap = (rawName: string, unitPrice = 0) => {
    const k = normKey(rawName);
    if (!k || combinedProdMap.has(k)) return;
    // Check if a catalogue item partially matches (e.g. "Cold Pressed Groundnut Oil" vs "Groundnut Oil 1L")
    for (const [ck] of combinedProdMap) {
      if (ck.includes(k) || k.includes(ck)) return;
    }
    combinedProdMap.set(k, {
      id: `hist-${extraIdx}`,
      retailerId: `SKU-${100 + extraIdx}`,
      name: rawName,
      category: inferCat(rawName),
      priceAmount: unitPrice,
      inStock: true,
    });
    extraIdx += 1;
  };

  for (const [, st] of periodProdStats) ensureProductInMap(st.displayName, st.unitPrice);
  for (const [, dr] of droppedMap) ensureProductInMap(dr.name, dr.qty > 0 ? Math.round(dr.value / dr.qty) : 0);
  for (const [, atSt] of allTimeMap) ensureProductInMap(atSt.rawName, 0);

  // Helper to look up stats by exact normalized key or fuzzy substring match
  const findStat = <T,>(m: Map<string, T>, key: string): T | undefined => {
    const exact = m.get(key);
    if (exact) return exact;
    for (const [mk, val] of m) {
      if (mk.length >= 5 && key.length >= 5 && (mk.includes(key) || key.includes(mk))) return val;
    }
    return undefined;
  };

  const heroTopSellerName = topProducts[0]?.name ?? catalogList[0]?.name ?? "your #1 bestseller";

  // First pass: assemble metrics for every product
  const rawAllProducts = [...combinedProdMap.entries()].map(([k, base]) => {
    const pStat = findStat(periodProdStats, k);
    const dStat = findStat(droppedMap, k);
    const aStat = findStat(anchorMap, k);
    const histStat = findStat(allTimeMap, k);
    const cStat = findStat(campaignProdMap, k);

    const soldQty = pStat?.soldQty ?? 0;
    const soldRevenue = pStat?.soldRevenue ?? 0;
    const soldOrders = pStat?.soldOrders.size ?? 0;
    const cartQty = pStat?.cartQty ?? 0;
    const cartValue = pStat?.cartValue ?? 0;
    const cartCount = pStat?.cartOrders.size ?? 0;
    const droppedQty = dStat?.qty ?? 0;
    const droppedValue = dStat?.value ?? 0;
    const droppedCount = dStat?.count ?? 0;
    const droppedCustomers = dStat ? [...dStat.customers] : [];
    const anchorKeptCount = aStat?.count ?? 0;
    const allTimeBuyers = Math.max(soldOrders, histStat?.buyers ?? 0);
    const allTimeSoldQty = Math.max(soldQty, histStat?.units ?? 0);
    const campaignSent = cStat?.sent ?? 0;
    const campaignRead = cStat?.read ?? 0;
    const campaignReplies = cStat?.replies ?? 0;
    const priceAmount = base.priceAmount || pStat?.unitPrice || 0;

    return {
      ...base,
      priceAmount,
      soldQty,
      soldRevenue,
      soldOrders,
      cartQty,
      cartValue,
      cartCount,
      droppedQty,
      droppedValue,
      droppedCount,
      droppedCustomers,
      anchorKeptCount,
      allTimeBuyers,
      allTimeSoldQty,
      campaignSent,
      campaignRead,
      campaignReplies,
    };
  });

  // Identify top 3 revenue generators with positive sales
  const topSellerIds = new Set(
    [...rawAllProducts]
      .filter((p) => p.soldRevenue > 0)
      .sort((a, b) => b.soldRevenue - a.soldRevenue || b.soldQty - a.soldQty)
      .slice(0, 3)
      .map((p) => p.id),
  );

  const allProductItems: AllProductAnalyticsItem[] = rawAllProducts
    .map((p): AllProductAnalyticsItem => {
      if (topSellerIds.has(p.id)) {
        return {
          ...p,
          status: "top_seller",
          statusLabel: "Top seller",
          statusTone: "green",
          diagnosis: `Leading revenue generator (${p.soldQty} units · ₹${Math.round(p.soldRevenue).toLocaleString("en-IN")}) with strong customer conviction${p.anchorKeptCount > 0 ? ` and kept across ${p.anchorKeptCount} cart revision${p.anchorKeptCount === 1 ? "" : "s"}` : ""}.`,
          solution: `Use ${p.name} as your hero bundle anchor to pull along 0-sale products, and keep a 30-day refill reminder active for its ${p.allTimeBuyers} buyers.`,
          nextActionLabel: "Message buyers",
          nextActionHref: `/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`,
        };
      }
      if (p.soldQty > 0) {
        const extraCartNote =
          p.cartQty > 0
            ? ` +${p.cartQty} unit${p.cartQty === 1 ? "" : "s"} waiting in unpaid carts right now.`
            : p.droppedQty > 0
              ? ` (${p.droppedQty} unit${p.droppedQty === 1 ? "" : "s"} also dropped during cart edits).`
              : ".";
        return {
          ...p,
          status: "selling",
          statusLabel: "Selling",
          statusTone: "green",
          diagnosis: `${p.soldQty} unit${p.soldQty === 1 ? "" : "s"} sold (₹${Math.round(p.soldRevenue).toLocaleString("en-IN")}) in ${periodText}${extraCartNote}`,
          solution:
            p.cartQty > 0
              ? `Follow up on the ${p.cartCount} open unpaid cart${p.cartCount === 1 ? "" : "s"} to convert another ₹${Math.round(p.cartValue).toLocaleString("en-IN")} immediately.`
              : `Cross-sell ${p.name} in a 2-pack value combo or send a restock check-in to its ${p.allTimeBuyers} past buyers.`,
          nextActionLabel: p.cartQty > 0 ? "Recover unpaid carts" : "View product buyers",
          nextActionHref: p.cartQty > 0 ? "/dashboard/orders?show=unpaid" : `/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`,
        };
      }
      if (p.cartQty > 0) {
        return {
          ...p,
          status: "stuck_in_cart",
          statusLabel: "Stuck in unpaid cart",
          statusTone: "amber",
          diagnosis: `0 paid orders in ${periodText}, but ${p.cartQty} unit${p.cartQty === 1 ? "" : "s"} (₹${Math.round(p.cartValue).toLocaleString("en-IN")}) are sitting in ${p.cartCount} active unpaid WhatsApp cart${p.cartCount === 1 ? "" : "s"} right now.`,
          solution: `Customers want ${p.name} but paused at checkout. Re-send the payment link inside the free 24-hour reply window or offer UPI/COD help to close the sale.`,
          nextActionLabel: "Close unpaid cart",
          nextActionHref: "/dashboard/orders?show=unpaid",
        };
      }
      if (p.droppedQty > 0) {
        const who = p.droppedCustomers.slice(0, 2).join(", ");
        return {
          ...p,
          status: "dropped_hesitation",
          statusLabel: "Added then dropped",
          statusTone: "red",
          diagnosis: `Added to cart ${p.droppedCount} time${p.droppedCount === 1 ? "" : "s"} (${p.droppedQty} units · ₹${Math.round(p.droppedValue).toLocaleString("en-IN")})${who ? ` by ${who}` : ""} and then removed or cancelled before payment — price or pack-size hesitation.`,
          solution: `Offer a smaller trial size or a ₹30 combo discount in Catalogue, and send a quick reassurance note (purity/benefits) to ${who || "those hesitating customers"}.`,
          nextActionLabel: "Adjust price / pack",
          nextActionHref: "/dashboard/catalogue",
        };
      }
      if (p.allTimeBuyers > 0) {
        return {
          ...p,
          status: "dormant_past",
          statusLabel: "0 sales this period (Past buyers exist)",
          statusTone: "blue",
          diagnosis: `0 orders in ${periodText}, even though ${p.allTimeBuyers} customer${p.allTimeBuyers === 1 ? "" : "s"} bought ${p.name} previously (${p.allTimeSoldQty} all-time units).`,
          solution: `Launch a targeted "Time to restock ${p.name}?" WhatsApp broadcast specifically to those ${p.allTimeBuyers} past buyer${p.allTimeBuyers === 1 ? "" : "s"}.`,
          nextActionLabel: `Retarget ${p.allTimeBuyers} past buyers`,
          nextActionHref: `/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`,
        };
      }
      return {
        ...p,
        status: "not_selling",
        statusLabel: "Not selling (0 orders)",
        statusTone: "gray",
        diagnosis: !p.inStock
          ? `Marked Out of Stock in your WhatsApp Catalogue — customers cannot add it to cart.`
          : `0 paid sales, 0 cart adds, and 0 historical buyers — customers are scrolling past ${p.name} in the catalogue without adding it.`,
        solution: !p.inStock
          ? `Restock ${p.name} in Catalogue or replace it with an active in-stock SKU.`
          : `Pair ${p.name} as a discounted trial add-on with ${heroTopSellerName}, move it higher in your WhatsApp Catalogue, or feature its benefits in a broadcast.`,
        nextActionLabel: "Optimize in Catalogue",
        nextActionHref: "/dashboard/catalogue",
      };
    })
    // A product filter shows just the picked products (names can differ slightly between catalogue and carts).
    .filter((p) => {
      if (!filters.products.length) return true;
      const k = normKey(p.name);
      return filters.products.some((f) => {
        const fk = normKey(f);
        return fk === k || k.includes(fk) || fk.includes(k);
      });
    })
    .sort((a, b) => {
      // Order: stuck_in_cart / dropped_hesitation first when filtering hesitation, otherwise sort by total activity then not_selling visibility
      const score = (x: AllProductAnalyticsItem) =>
        x.soldRevenue * 10 + x.cartValue * 8 + x.droppedValue * 6 + x.allTimeBuyers * 50 + (x.inStock ? 1 : 0);
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });

  const allProductsData: AllProductsSummaryData = {
    periodLabel: periodText,
    totalCatalogProducts: allProductItems.length,
    sellingCount: allProductItems.filter((p) => p.status === "top_seller" || p.status === "selling").length,
    stuckInCartCount: allProductItems.filter((p) => p.status === "stuck_in_cart").length,
    droppedCount: allProductItems.filter((p) => p.status === "dropped_hesitation").length,
    dormantPastCount: allProductItems.filter((p) => p.status === "dormant_past").length,
    notSellingCount: allProductItems.filter((p) => p.status === "not_selling").length,
    totalSoldRevenue: revenue,
    totalCartPendingValue: unpaidCartRevenue,
    totalDroppedValue: droppedProducts.reduce((s, d) => s + d.droppedValue, 0),
    products: allProductItems,
  };

  /* ── Customer Lifecycle, Win-Back & Next-Action Growth Playbook Engine ── */
  const day30Ago = daysAgo(30);
  const day60Ago = daysAgo(client?.lapsedDays ?? 60);
  const avgOrderVal = curOrders.length > 0 ? Math.round(revenue / curOrders.length) : 650;

  type LifecycleCust = (typeof customerLifecycleRows)[number];
  const active30List: LifecycleCust[] = [];
  const refill31to60List: LifecycleCust[] = [];
  const lapsedOver60List: LifecycleCust[] = [];
  const warmNonBuyerList: LifecycleCust[] = [];
  const coldNeverOrderedList: LifecycleCust[] = [];
  const vipRepeatList: LifecycleCust[] = [];

  for (const c of customerLifecycleRows) {
    const paidOrdersCount = Number(c.paid_orders ?? 0);
    const hasSheetPurchase = Boolean(c.purchases && c.purchases.trim().length > 0);
    const isRepeat = paidOrdersCount >= 2 || (hasSheetPurchase && c.purchases!.split(/[,/;&]+/).filter((x) => x.trim()).length >= 2);
    if (isRepeat) vipRepeatList.push(c);

    if (unpaidCartCustomerIds.has(c.id)) {
      // Unpaid cart customers are tracked in the unpaid cart cohort
      continue;
    }

    if (c.last_order_at) {
      const lastAt = new Date(c.last_order_at);
      if (lastAt >= day30Ago) {
        active30List.push(c);
      } else if (lastAt >= day60Ago) {
        refill31to60List.push(c);
      } else {
        lapsedOver60List.push(c);
      }
    } else if (hasSheetPurchase || c.tags.includes("lapsed")) {
      // Imported from historical order sheet with no recent WhatsApp order
      lapsedOver60List.push(c);
    } else if (c.last_reply_at || browsedCustomerMap.has(c.id)) {
      warmNonBuyerList.push(c);
    } else {
      coldNeverOrderedList.push(c);
    }
  }

  const totalEverBuyers = active30List.length + refill31to60List.length + lapsedOver60List.length;
  const retentionRatePct = totalEverBuyers > 0 ? pct(vipRepeatList.length, totalEverBuyers) : 0;

  // Best reply day & time window from 90d heatmap
  const DOW_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const BLOCK_NAMES = ["12am–3am", "3am–6am", "6am–9am", "9am–12pm", "12pm–3pm", "3pm–6pm", "6pm–9pm", "9pm–12am"];
  const topHeatCell = [...heat].sort((a, b) => Number(b.n) - Number(a.n))[0];
  const bestReplyDayAndTime =
    topHeatCell && Number(topHeatCell.n) > 0
      ? `${DOW_NAMES[topHeatCell.d] ?? "Weekdays"} ${BLOCK_NAMES[topHeatCell.b] ?? "6pm–9pm"}`
      : null;

  const recoverableRevenuePool =
    unpaidCartRevenue +
    downsizedValueLost +
    refill31to60List.length * avgOrderVal +
    Math.round(lapsedOver60List.length * avgOrderVal * 0.35);

  const playbookScenarios: PlaybookScenario[] = [
    {
      id: "unpaid_cart_recovery",
      title: "Unpaid WhatsApp Carts — High-Intent Checkout Drop-Off",
      shortTitle: "Unpaid carts",
      badge: "Highest immediate ROI · Convert today",
      badgeTone: "amber",
      color: "#d97706",
      customersCount: unpaidCartCustomerIds.size,
      sharePct: pct(unpaidCartCustomerIds.size, Math.max(1, customers)),
      revenueAtStake: unpaidCartRevenue,
      revenueLabel: `₹${Math.round(unpaidCartRevenue).toLocaleString("en-IN")} pending in ${curUnpaidCarts.length} cart${curUnpaidCarts.length === 1 ? "" : "s"}`,
      whyItHappens:
        "These customers already selected products from your WhatsApp Catalogue and submitted a cart, but paused at the UPI payment step (switched apps, waited to confirm total/delivery charge, or paid via an external UPI app without webhook confirmation).",
      howToGetThemBack: [
        "Open each unpaid order below and click 'Send payment request' while the customer's 24-hour service window is still open (₹0 Meta fee).",
        "If they already paid on Google Pay / PhonePe / Paytm outside WhatsApp's native checkout, verify the UTR or screenshot in Replies and click 'Confirm UPI / Mark paid'.",
        "If they hesitate on online payment, offer Cash on Delivery (COD) or a fast UPI QR link to lock in the order immediately.",
      ],
      suggestedWhatsappCopy: `Hi {{name}}, we have reserved your ${client?.name ?? ""} cart items so they don't go out of stock! Tap the payment link above to complete your order via UPI, or reply here if you already paid / prefer Cash on Delivery.`,
      primaryCtaLabel: "Recover unpaid carts",
      primaryCtaHref: "/dashboard/orders?show=unpaid",
      secondaryCtaLabel: "Open customer replies",
      secondaryCtaHref: "/dashboard/replies",
      leads: curUnpaidCarts.slice(0, 4).map((o) => ({
        id: o.id,
        name: o.customer.name,
        phone: o.customer.phone,
        note: `RG-${1000 + o.number} · ₹${Math.round(o.total).toLocaleString("en-IN")} · ${formatCartItems(o.items)}`,
        href: `/dashboard/customers/${o.customerId}`,
      })),
    },
    {
      id: "winback_lapsed",
      title: `Dormant & Lapsed Past Buyers (> ${client?.lapsedDays ?? 60} Days Since Last Order)`,
      shortTitle: "Win-back lapsed buyers",
      badge: "Win-back campaign · Past buyers",
      badgeTone: "red",
      color: "#e11d48",
      customersCount: lapsedOver60List.length,
      sharePct: pct(lapsedOver60List.length, Math.max(1, customers)),
      revenueAtStake: Math.round(lapsedOver60List.length * avgOrderVal * 0.35),
      revenueLabel: `~₹${Math.round(lapsedOver60List.length * avgOrderVal * 0.35).toLocaleString("en-IN")} est. win-back value`,
      whyItHappens:
        "These customers trusted your brand and bought before (via WhatsApp or your order sheets), but haven't reordered in over 60 days — usually because they forgot to restock, switched to a local store for convenience, or haven't seen your latest batch.",
      howToGetThemBack: [
        "Run a targeted 'We miss you / Fresh batch ready' broadcast filtered to the 'lapsed' tag or specific past-product tags.",
        "Enable the Automated Win-Back Template in Client Settings so any buyer crossing 60 days automatically receives a personalized check-in.",
        `Lead with your #1 anchor product (${heroTopSellerName}) plus a small returning-customer perk (free local delivery or a free soap/sample on orders above ₹499).`,
      ],
      suggestedWhatsappCopy: `Vanakkam {{name}}! This week's fresh batch of ${heroTopSellerName} is just pressed and ready. Since you ordered from us earlier, enjoy free priority delivery on your next WhatsApp order this week. Tap 'View catalog' below!`,
      primaryCtaLabel: "Launch win-back campaign",
      primaryCtaHref: "/dashboard/campaigns/new",
      secondaryCtaLabel: "View lapsed customers",
      secondaryCtaHref: "/dashboard/customers?tag=lapsed",
      leads: lapsedOver60List.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: c.last_order_at
          ? `Last ordered ${fmtDate(c.last_order_at, "d MMM yyyy")}`
          : c.purchases
            ? `Past sheet buyer: ${c.purchases.slice(0, 38)}`
            : "Tagged lapsed",
        href: `/dashboard/customers/${c.id}`,
      })),
    },
    {
      id: "refill_due",
      title: "Refill Window Buyers (Ordered 31–60 Days Ago — Running Low Now)",
      shortTitle: "Refill due (31–60d)",
      badge: "High-conversion refill window",
      badgeTone: "blue",
      color: "#0ea5e9",
      customersCount: refill31to60List.length,
      sharePct: pct(refill31to60List.length, Math.max(1, customers)),
      revenueAtStake: refill31to60List.length * avgOrderVal,
      revenueLabel: `~₹${Math.round(refill31to60List.length * avgOrderVal).toLocaleString("en-IN")} repeat cycle potential`,
      whyItHappens:
        "Household consumables (cooking oils, ghee, soaps, hair oils) typically run out between day 30 and day 45. Reaching out right before their bottle is empty catches them at peak need before they buy elsewhere.",
      howToGetThemBack: [
        `Turn on the Automated Refill Reminder (${client?.refillDays ?? 30} days after order) so every buyer gets a timely nudge without manual effort.`,
        "Send a 1-tap 'Reorder your usual' message with the WhatsApp Catalogue attached so they can reorder in 15 seconds.",
        "Suggest upgrading from 500ml/1L to a monthly family combo pack to increase Average Order Value (AOV).",
      ],
      suggestedWhatsappCopy: `Hi {{name}}, hope you enjoyed your last order from ${client?.name ?? "us"}! Running low on your monthly stock? Tap below to view the catalogue and get fresh stock delivered to your doorstep.`,
      primaryCtaLabel: "Create refill campaign",
      primaryCtaHref: "/dashboard/campaigns/new",
      secondaryCtaLabel: "View customers",
      secondaryCtaHref: "/dashboard/customers",
      leads: refill31to60List.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: c.last_order_at ? `Ordered ${fmtDate(c.last_order_at, "d MMM")} (due for refill)` : "Due for monthly refill",
        href: `/dashboard/customers/${c.id}`,
      })),
    },
    {
      id: "cart_downsize_recovery",
      title: "Multi-Cart Hesitators — Trimmed Items or Replaced Larger Carts",
      shortTitle: "Cart downsizers",
      badge: "Psychology insight · Bundle opportunity",
      badgeTone: "amber",
      color: "#f59e0b",
      customersCount: reviserCustomerIds.size,
      sharePct: pct(reviserCustomerIds.size, Math.max(1, customers)),
      revenueAtStake: downsizedValueLost + droppedProducts.reduce((s, d) => s + d.droppedValue, 0),
      revenueLabel: `₹${Math.round(downsizedValueLost + droppedProducts.reduce((s, d) => s + d.droppedValue, 0)).toLocaleString("en-IN")} trimmed across ${totalSupersededCarts} replaced cart${totalSupersededCarts === 1 ? "" : "s"}`,
      whyItHappens:
        "When a customer sends Cart #1 with 3 items and then sends Cart #2 with only 1 item, they genuinely wanted the dropped items (`" +
        (droppedProducts[0]?.name ?? "secondary items") +
        "`) but felt the total bill was too high at once.",
      howToGetThemBack: [
        "Never ignore the superseded cart — check the 'Dropped items' badge on their order or customer page.",
        "Offer the dropped item as an add-on at ₹30–₹50 off ('Add it back to your current delivery with zero extra shipping!').",
        "Create a smaller trial size (100ml / 250ml) in Catalogue for the most frequently dropped products.",
      ],
      suggestedWhatsappCopy: `Hi {{name}}, we noticed you also checked out ${droppedProducts[0]?.name ?? "our specialty range"} earlier! Since your order is being packed, you can add it to the same box with ₹40 combo savings and no extra delivery charge. Would you like us to include it?`,
      primaryCtaLabel: "Inspect revised carts",
      primaryCtaHref: "/dashboard/orders?show=all",
      secondaryCtaLabel: "Edit catalogue packs",
      secondaryCtaHref: "/dashboard/catalogue",
      leads: journeys.slice(0, 4).map((j) => ({
        id: j.latestOrderId,
        name: j.customerName,
        phone: j.customerPhone,
        note: `${j.firstCartRef} → ${j.latestOrderRef} (${j.headline})`,
        href: `/dashboard/customers/${j.customerId}`,
      })),
    },
    {
      id: "warm_browsers",
      title: "Warm Browsers & Inquiry Leads — Checked Prices/Catalogue, No Cart Yet",
      shortTitle: "Warm browsers",
      badge: "Free 24h reply window · Assisted sale",
      badgeTone: "violet",
      color: "#7c3aed",
      customersCount: Math.max(warmNonBuyerList.length, browsedNoCartLeads.length + inquiryOnlyMap.size),
      sharePct: pct(Math.max(warmNonBuyerList.length, browsedNoCartLeads.length + inquiryOnlyMap.size), Math.max(1, customers)),
      revenueAtStake: Math.max(warmNonBuyerList.length, browsedNoCartLeads.length + inquiryOnlyMap.size) * avgOrderVal,
      revenueLabel: `${Math.max(warmNonBuyerList.length, browsedNoCartLeads.length + inquiryOnlyMap.size)} warm leads ready for assisted checkout`,
      whyItHappens:
        "These people tapped 'Send price list' or 'Order now', or asked a question in chat, but didn't build a cart — often because they weren't sure which variant/size to pick first or how WhatsApp cart checkout works.",
      howToGetThemBack: [
        "Reply inside the 24-hour free service window with a simple 2-item starter recommendation instead of making them scroll through all 16+ items.",
        "Use the 'New manual order' button in Orders to create their cart for them on the spot and send a 1-tap UPI payment request.",
        "Share a quick trust proof (wood-pressed purity / lab-tested / Madurai doorstep delivery) to overcome first-order hesitation.",
      ],
      suggestedWhatsappCopy: `Hi {{name}}! If you're ordering for the first time, our most loved starter pair is ${heroTopSellerName}. Just reply with the quantity you need and we'll set up your order & payment link right away!`,
      primaryCtaLabel: "Reply to warm leads",
      primaryCtaHref: "/dashboard/replies",
      secondaryCtaLabel: "Create assisted order",
      secondaryCtaHref: "/dashboard/orders",
      leads: [...browsedNoCartLeads, ...[...inquiryOnlyMap.entries()].map(([cidKey, info]) => ({
        customerId: cidKey,
        name: info.name,
        phone: info.phone,
        detail: info.detail,
        href: `/dashboard/customers/${cidKey}`,
      }))].slice(0, 4).map((l) => ({
        id: l.customerId,
        name: l.name,
        phone: l.phone,
        note: l.detail,
        href: l.href,
      })),
    },
    {
      id: "never_ordered",
      title: "Cold Opted-In Contacts — In Database but Never Ordered Yet",
      shortTitle: "Never ordered yet",
      badge: "First-order activation",
      badgeTone: "gray",
      color: "#64748b",
      customersCount: coldNeverOrderedList.length,
      sharePct: pct(coldNeverOrderedList.length, Math.max(1, customers)),
      revenueAtStake: Math.round(coldNeverOrderedList.length * avgOrderVal * 0.2),
      revenueLabel: `${fmtNumber(coldNeverOrderedList.length)} contacts yet to place Order #1`,
      whyItHappens:
        "Contacts imported from inquiries, QR scans, or sheets who haven't placed their first WhatsApp order yet. Sending generic price lists rarely converts cold contacts — they need a low-risk 'first taste' offer.",
      howToGetThemBack: [
        `Schedule your broadcast during your highest-response window (${bestReplyDayAndTime ?? "evenings 6pm–9pm"}) for maximum read & reply rate.`,
        "Lead with a 'First Order Trial Combo' or free shipping on their first order rather than a full catalogue dump.",
        "Include a 'Send price list' quick-reply button so tapping it opens a free 24-hour service window where your bot auto-sends the interactive catalogue.",
      ],
      suggestedWhatsappCopy: `Vanakkam {{name}}! Welcome to ${client?.name ?? "our store"}. Try our pure, freshly made ${heroTopSellerName} with FREE doorstep delivery on your first WhatsApp order. Tap 'View catalog' or reply 'PRICE' to see today's rates!`,
      primaryCtaLabel: "Send activation broadcast",
      primaryCtaHref: "/dashboard/campaigns/new",
      secondaryCtaLabel: "Browse contacts",
      secondaryCtaHref: "/dashboard/customers",
      leads: coldNeverOrderedList.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: "Opted-in · 0 orders so far",
        href: `/dashboard/customers/${c.id}`,
      })),
    },
    {
      id: "vip_repeat",
      title: "VIP & Repeat Champions (2+ Orders — Highest Lifetime Value)",
      shortTitle: "VIP repeat buyers",
      badge: `${retentionRatePct}% repeat rate · Brand champions`,
      badgeTone: "green",
      color: "#059669",
      customersCount: vipRepeatList.length,
      sharePct: pct(vipRepeatList.length, Math.max(1, customers)),
      revenueAtStake: vipRepeatList.length * avgOrderVal,
      revenueLabel: `${fmtNumber(vipRepeatList.length)} repeat buyers driving recurring revenue`,
      whyItHappens:
        "These customers already love your core products and buy repeatedly. They are 4× more likely to try your slow-moving or newly launched products than cold leads.",
      howToGetThemBack: [
        "Tag these customers as 'vip' and give them early access whenever you press a fresh batch or launch a new product.",
        "Use VIP buyers to kickstart your 0-sale / non-selling catalogue items by offering a complimentary sample or VIP bundle add-on.",
        "Ask them for a quick WhatsApp referral or Google review right after their order is marked DELIVERED.",
      ],
      suggestedWhatsappCopy: `Thank you for being one of our most valued regular customers, {{name}}! On your next order of ${heroTopSellerName}, we'd love to include a special VIP discount on our new range. Tap below to explore!`,
      primaryCtaLabel: "View VIP customers",
      primaryCtaHref: "/dashboard/customers?tag=vip",
      secondaryCtaLabel: "New VIP campaign",
      secondaryCtaHref: "/dashboard/campaigns/new",
      leads: vipRepeatList.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: `${Number(c.paid_orders)} WhatsApp orders${c.purchases ? ` · ${c.purchases.slice(0, 28)}` : ""}`,
        href: `/dashboard/customers/${c.id}`,
      })),
    },
  ];

  const winbackPlaybookData: CustomerWinbackPlaybookData = {
    totalCustomers: customers,
    activeBuyers30d: active30List.length,
    refillDue31to60d: refill31to60List.length,
    lapsedOver60d: lapsedOver60List.length,
    unpaidCartCustomers: unpaidCartCustomerIds.size,
    warmNonBuyers: warmNonBuyerList.length,
    coldNeverOrdered: coldNeverOrderedList.length,
    repeatVipBuyers: vipRepeatList.length,
    retentionRatePct,
    recoverableRevenuePool,
    refillConfigured: Boolean(client?.refillDays && client?.refillTemplateId),
    winbackConfigured: Boolean(client?.winbackTemplateId),
    bestReplyDayAndTime,
    scenarios: playbookScenarios,
  };

  const refillsWeek = ordersOn && cid ? (await refillForecast(cid, now).catch(() => null))?.due.filter((d) => d.daysLeft <= 7) ?? [] : [];

  const views: View[] = ordersOn ? ["overview", "customers", "products", "carts"] : ["overview", "customers"];
  const view: View = views.includes(sp.view as View) ? (sp.view as View) : "overview";
  const viewBadges: Partial<Record<View, number>> = {
    customers: browsedNoCartLeads.length || undefined,
    carts: cartMentalityData.totalRevisers || undefined,
  };

  return (
    <>
      <BrandHero
        client={client}
        name={client?.name ?? (scope.isAdmin ? "all clients" : "there")}
        customers={customers}
        issues={issues}
        actions={adminActions}
        work={{
          unpaidCartsCount: curUnpaidCarts.length,
          unpaidCartsValue: unpaidCartRevenue,
          browsedNoCartCount: browsedNoCartLeads.length,
          toDispatchCount,
          paymentsToCheckCount,
          refundsDueCount,
          unhandledRepliesCount: unhandledGroup.length,
          refillsDueCount: refillsWeek.length,
          showOrders: ordersOn,
          showReplies: repliesOn,
        }}
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

      <ViewTabs
        view={view}
        views={views}
        badges={viewBadges}
        queries={Object.fromEntries(views.map((v) => [v, filterQuery(keepFilters(filters, VIEW_FILTERS[v]))]))}
      />

      <div key={view} className="animate-view-in">

      {/* Each section carries its own filters: the period and who/what it covers, right above its figures. */}
      <section
        aria-label={`${VIEWS[view].label} filters`}
        className="mb-4 rounded-card border border-line bg-panel px-3.5 py-3 shadow-xs sm:mb-5 sm:px-4"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {VIEWS[view].label} <span className="font-normal text-muted">· {period.label}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {period.prevLabel !== "before" ? <>Compared with {prevLabel}</> : VIEWS[view].hint}
              {filtered && allowed && <> · {fmtNumber(allowed.length)} customer{allowed.length === 1 ? "" : "s"} in this filter</>}
            </p>
          </div>
          {filterOpts && (
            <FilterBar
              value={filters}
              options={filterOpts}
              basePath="/dashboard"
              extra={{ view: view === "overview" ? undefined : view }}
              periodLabel={period.label}
              sections={VIEW_FILTERS[view]}
              note={VIEW_FILTER_NOTE[view]}
              className="shrink-0"
            />
          )}
        </div>
        {filterOpts && <ActiveFilters className="mt-2.5 border-t border-line pt-2.5" value={filters} options={filterOpts} basePath="/dashboard" extra={{ view: view === "overview" ? undefined : view }} />}
      </section>

      {view === "overview" && (
        <>

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
            description={`${hourly ? "By hour" : weekly ? "By week" : "By day"}, ${period.phrase}`}
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
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
            </div>
          </div>
        </>
      )}

      {view === "customers" && (
        <div className="space-y-4 sm:space-y-5">
          {ordersOn && <CustomerScenariosCard data={scenariosData} />}
          <CustomerGrowthPlaybookCard data={winbackPlaybookData} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            <CustomerProductsCard items={shown.map((t) => ({ tag: t.tag, label: tagLabel(t.tag), n: t.n }))} />
            <CustomerAreasCard regions={byRegion}>
              <AreaChips topAreas={topAreas} otherAreas={otherAreas} />
            </CustomerAreasCard>
          </div>
          {repliesOn && <BestTimeCard cells={heat.map((h) => ({ d: h.d, b: h.b, n: Number(h.n) }))} days={90} />}
        </div>
      )}

      {view === "products" && ordersOn && (
        <div className="space-y-4 sm:space-y-5">
          <AllProductsIntelligenceCard data={allProductsData} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            <TopProductsCard items={topProducts} rangeLabel={period.label} />
            {byProduct.length > 0 && <ProductCampaignGraphCard rows={byProduct} />}
          </div>
        </div>
      )}

      {view === "carts" && ordersOn && (
        <div className="space-y-4 sm:space-y-5">
          <CartMentalityCard data={cartMentalityData} />
        </div>
      )}
      </div>
    </>
  );
}
