import { orderRef } from "@/lib/order-ref";
import { CheckCheck, Clock, Send, TriangleAlert } from "@/components/icons";
import Link from "@/components/intent-link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ActionButton } from "@/components/action-button";
import { Calendar3D, Clock3D, Eye3D, Messages3D, Rupee3D, Send3D, ShoppingBag3D, Sparkles3D, Template3D } from "@/components/icons-3d";
import { Avatar, Badge, Callout, Card, CardHeader, EmptyState, Meter, StatusBadge } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { detectCategory, getCatalogWithProducts } from "@/lib/catalog";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { APP_TZ, daysAgo, fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/provider";
import { estimateDuration, formatMinutes } from "@/lib/schedule";
import { homeCityOf, regionsFor } from "@/lib/regions";
import { getScope, owned, ownedMessages } from "@/lib/session";
import { numberHealth } from "@/lib/limits";
import { codesOf, PAUSING_KINDS } from "@/lib/meta-errors";
import { HELD_CODES } from "@/lib/held";
import { analyzeCartMentality } from "@/lib/cart-mentality";
import { computeCustomerLoyalty } from "@/lib/loyalty";
import { refillForecast } from "@/lib/refill-forecast";
import type { OrderItem } from "@/lib/orders";
import { cancelRun, runDispatcherNow } from "./actions/campaigns";
import { HomeTiers, type HomeCampaignRow, type HomeKpi } from "./home-tiers";
import { HomeWallet } from "./home-wallet";
import { plainError, templateLabel } from "@/lib/plain-error";
import { AreaChips } from "./area-chips";
import {
  AllProductsIntelligenceCard,
  CustomerGrowthPlaybookCard,
  ProductCampaignGraphCard,
  TopFrequentCustomersCard,
  type AllProductAnalyticsItem,
  type AllProductsSummaryData,
  type CustomerWinbackPlaybookData,
  type PlaybookScenario,
  type ProductBuyerSummary,
  type ProductPairInsight,
  type ProductUnpaidHolder,
  type TopCustomerLoyaltyItem,
  type TopFrequentCustomersData,
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
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { activeCount, keepFilters, narrowOrders, periodKeys, readFilters, resolvePeriod, weekKey } from "@/lib/filters";
import { filterOptions, scopedCustomerIds } from "@/lib/filter-scope";
import { catalogFor, catalogOrders, customerProducts } from "@/lib/product-scope";
import { catalogMatcher } from "@/lib/catalog-match";




/** Midnight of the given moment's day, in the app's time zone. */
const dayStart = (d: Date) => fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export type OverviewMode = "home" | "funnel" | "carts" | "audience" | "products";
const MODE_VIEW: Record<OverviewMode, View> = { home: "overview", funnel: "overview", carts: "carts", audience: "customers", products: "products" };

/**
 * One loader, two screens: Home's short live summary ("home"), and the full analysis views shown on
 * Reports (message-to-sale, carts, who and when, products). Every figure is read live per request.
 */
export async function OverviewScreen({ sp, mode }: { sp: Record<string, string | string[] | undefined>; mode: OverviewMode }) {
  // Each section offers (and uses) only the filters that change its figures; others in the link are dropped.
  const askedView = MODE_VIEW[mode];
  const filters = keepFilters(readFilters(sp), VIEW_FILTERS[askedView]);

  const scope = await getScope();
  const cid = scope.clientId;
  const now = new Date();
  // Everything that only needs the filters is read at once: the first order (for "all time"), the
  // customers the filters cover, the filter choices, and the live catalogue with what customers bought.
  // Products are catalogue items only (live from Meta): order lines and sheet notes are matched to
  // them, and anything else (customer tags, typed names that aren't catalogue items) is left out.
  const [firstOrder, allowed, filterOpts, [catalog, custProds, catOrders]] = await Promise.all([
    filters.range === "all" && cid ? db.order.findFirst({ where: { clientId: cid }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null,
    cid ? scopedCustomerIds(cid, filters) : null,
    cid ? filterOptions(cid) : null,
    (async () => (cid ? await Promise.all([catalogFor(cid), customerProducts(cid), catalogOrders(cid)]) : ([catalogMatcher([]), new Map<string, Set<string>>(), []] as const)))(),
  ]);
  // The period (any preset or custom dates) and the same stretch of time just before it.
  const period = resolvePeriod(filters, now, firstOrder?.createdAt);
  const { start, end, prevStart, prevEnd, prevLabel } = period;
  const hourly = period.bucket === "hour";
  const weekly = period.bucket === "week";

  // Who and what the figures cover: customers picked directly, by group, area, product or campaign.
  const ids = allowed;
  const mine = owned(scope);
  const mineOrders = allowed ? { ...mine, customerId: { in: allowed } } : mine;
  const mineCustomers = allowed ? { ...mine, id: { in: allowed } } : mine;
  const myMessages = allowed ? { customer: { ...(cid ? { clientId: cid } : {}), id: { in: allowed } } } : ownedMessages(scope);
  const filtered = activeCount(filters) > 0;
  const inScope = (customerId: string) => !allowed || allowedSet.has(customerId);
  const allowedSet = new Set(allowed ?? []);

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

  // One round for every independent read (several sequential rounds before).
  const [
    [client, reachable, msgByCustomer, repliersMonth, health, blocked, areaRows],
    [customers, optedOut, prevStatus, msgSeries, activeRuns, upcoming, recentRaw, failures, settings, ordersRaw, replySeries, repliers, prevReplies, funnelRows, heat, todayMsgs, todayReplies],
    [paymentsToCheckCount, refundsDueCount],
    [catalogueMsgs, periodReplies, unhandledGroup, toPackGroups, catalogRes, customerLifecycleRows],
    heldToday,
    paused,
    runProgress,
    refillForecastRes,
  ] = await Promise.all([
    Promise.all([
    cid ? db.client.findUnique({ where: { id: cid } }) : null,
    cid
      ? db.customer.findMany({ where: { clientId: cid, optedOut: false, ...(ids && { id: { in: ids } }) }, select: { id: true } })
      : [],
    cid
      ? db.$queryRaw<{ cid: string; sent: bigint; delivered: bigint; read: bigint; failed: bigint }[]>`
          SELECT m."customerId" AS cid,
            count(*) AS sent,
            count(*) FILTER (WHERE m.status IN ('DELIVERED', 'READ')) AS delivered,
            count(*) FILTER (WHERE m.status = 'READ') AS read,
            count(*) FILTER (WHERE m.status = 'FAILED') AS failed
          FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
          WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[]))
            AND m."createdAt" >= ${monthAgo} AND m.status NOT IN ('QUEUED', 'SKIPPED')
          GROUP BY 1`
      : [],
    cid
      ? db.$queryRaw<{ cid: string }[]>`
          SELECT DISTINCT r."customerId" AS cid FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
          WHERE c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])) AND r."receivedAt" >= ${monthAgo}`
      : [],
    cid ? numberHealth(cid) : [],
    // Active campaigns whose template Meta paused, disabled or rejected can't send.
    db.campaign.findMany({
      where: { ...mine, active: true, template: { status: { in: ["PAUSED", "DISABLED", "REJECTED"] } } },
      select: { id: true, name: true, template: { select: { name: true, status: true, statusReason: true } } },
    }),
    cid ? db.customer.groupBy({ by: ["region", "location"], where: { clientId: cid, optedOut: false, ...(allowed && { id: { in: allowed } }) }, _count: true }) : [],
    ]),
    Promise.all([
      db.customer.count({ where: { ...mineCustomers, optedOut: false } }),
      db.customer.count({ where: { ...mineCustomers, optedOut: true } }),
      db.message.groupBy({ by: ["status"], where: { ...myMessages, createdAt: { gte: prevStart, lt: prevEnd }, status: { notIn: ["QUEUED", "SKIPPED"] } }, _count: true }),
      db.$queryRaw<{ k: string; status: string; n: bigint }[]>`
        SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, ${bucketSql}) AS k, m.status::text AS status, count(*) AS n
        FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE m."createdAt" >= ${start} AND m."createdAt" < ${end} AND m.status NOT IN ('QUEUED', 'SKIPPED') AND (${cid}::text IS NULL OR c."clientId" = ${cid} AND (${ids}::text[] IS NULL OR c.id = ANY(${ids}::text[])))
        GROUP BY 1, 2`,
      db.campaignRun.findMany({
        where: { campaign: mine, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"] } },
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
            number: true, ref: true,
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
    ]),
    // Payments that need a person: a customer says they paid, or a cancelled order still owes a refund.
    Promise.all([
    db.order.count({ where: { ...mineOrders, paidAt: null, paymentClaimedAt: { not: null }, status: { not: "CANCELLED" } } }).catch(() => 0),
    db.order.count({ where: { ...mineOrders, status: "CANCELLED", refundedAt: null, OR: [{ paidAt: { not: null } }, { paidAmount: { gt: 0 } }] } }).catch(() => 0),
    ]),
    // Extra business-scenario queries: catalogue/price-list sends, period replies with customer info, unhandled chats, full product catalog, all-time product buyers, and customer lifecycle cohorts.
    Promise.all([
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
    db.reply.groupBy({ by: ["customerId"], where: { ...myMessages, handled: false }, _count: true, _min: { receivedAt: true } }).catch(() => []),
    // Orders to pack, split by how they're paid (Home shows "2 paid · 1 cash on delivery").
    db.order.groupBy({ by: ["status", "paymentMethod"], where: { ...mineOrders, status: { in: ["CONFIRMED", "PAID"] } }, _count: true }).catch(() => []),
    cid ? getCatalogWithProducts(cid).catch(() => null) : Promise.resolve(null),
    cid
      ? db
          .$queryRaw<{
            id: string;
            name: string;
            phone: string;
            location: string | null;
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
              c.location,
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
    ]),
    // Messages Meta held back (too much marketing to that person) are retried automatically and not
    // charged: worth knowing, but nothing to fix, so they don't count as something needing attention.
    db.message.count({ where: { ...myMessages, status: "FAILED", failedAt: { gte: daysAgo(1) }, errorCode: { in: HELD_CODES } } }),
    // A campaign paused because the token, app permissions or Meta account stopped every send.
    db.message.findFirst({
      where: { ...myMessages, status: "QUEUED", OR: [{ errorCode: { in: codesOf(PAUSING_KINDS) } }, { errorCode: { gte: 200, lte: 299 } }] },
      orderBy: { createdAt: "desc" },
      select: { error: true, run: { select: { campaign: { select: { id: true, name: true } } } } },
    }),
    // Progress of the campaigns sending right now (same runs as activeRuns above).
    db.message.groupBy({
      by: ["runId", "status"],
      where: { run: { campaign: mine, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"] } } },
      _count: true,
    }),
    // Reorders due this week (shown only when the Orders section is on).
    cid ? refillForecast(cid, now).catch(() => null) : null,
  ]);

  const toDispatchCount = toPackGroups.reduce((n, g) => n + g._count, 0);
  // Paid = marked paid; cash on delivery = confirmed with COD/cash; the rest are confirmed, payment not yet in.
  const isCod = (m: string | null) => m === "cod" || m === "cash";
  const toPackPaid = toPackGroups.filter((g) => g.status === "PAID").reduce((n, g) => n + g._count, 0);
  const toPackCod = toPackGroups.filter((g) => g.status === "CONFIRMED" && isCod(g.paymentMethod)).reduce((n, g) => n + g._count, 0);
  const toPackOther = toDispatchCount - toPackPaid - toPackCod;

  const failedToday = failures.reduce((n, f) => n + f._count, 0);
  // GitHub runs the scheduler every 5 minutes, sometimes late; 20 minutes of silence means it stopped.
  const schedulerQuiet = scope.isAdmin && (!settings.lastDispatchAt || settings.lastDispatchAt < daysAgo(20 / (24 * 60)));
  const issues = [paused, schedulerQuiet, failedToday > 0, blocked.length > 0].filter(Boolean).length;


  // A product filter narrows every order to the picked products' lines (and drops the rest).
  const orders = narrowOrders(ordersRaw, filters.products, catalog);
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

  const prevAllOrders = orders.filter((o) => o.createdAt >= prevStart && o.createdAt < prevEnd);
  const prevUnpaidCarts = prevAllOrders.filter(isUnpaidCart);
  const prevCancelledCarts = prevAllOrders.filter((o) => o.status === "CANCELLED");

  const cartSpark = keys.map((k) => curAllOrders.filter((o) => keyOf(o.createdAt) === k).length);
  const unpaidSpark = keys.map((k) => curUnpaidCarts.filter((o) => keyOf(o.createdAt) === k).length);
  const cancelledSpark = keys.map((k) => curCancelledCarts.filter((o) => keyOf(o.createdAt) === k).length);

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
      const name = catalog.item(it)?.name;
      if (!name) continue; // not a catalogue product
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
        detail: `${templateLabel(m.templateName)} (${m.status.toLowerCase()})`,
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
          detail: `${orderRef(o)} · ${formatCartItems(o.items)}${replacedNote}`,
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
        const supersedeMatch = /Superseded by ([A-Z]{2,5}-\d+)/i.exec(o.internalNote ?? "");
        const tag = supersedeMatch ? `Replaced by ${supersedeMatch[1]}` : "Cancelled";
        return {
          customerId: o.customerId,
          name: o.customer.name,
          phone: o.customer.phone,
          detail: `${orderRef(o)} (${tag}) · ${formatCartItems(o.items)}`,
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
        detail: `${orderRef(o)} (${o.status.toLowerCase()}) · ${formatCartItems(o.items)}`,
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
      ref: po.ref,
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
      { id: o.id, number: o.number, ref: o.ref, total: o.total, currency: "INR", items: curItems, createdAt: o.createdAt },
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
        latestOrderRef: orderRef(o),
        latestStatus: o.status,
        latestPaid: isBought(o),
        latestTotal: o.total,
        firstCartRef: firstCart ? orderRef(firstCart) : orderRef(o),
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
        const ref = catalog.item(d);
        if (!ref) continue;
        const key = ref.name.toLowerCase();
        const row = droppedMap.get(key) ?? { name: ref.name, count: 0, qty: 0, value: 0, customers: new Set<string>() };
        row.count += 1;
        row.qty += d.quantity;
        row.value += (d.price || 0) * d.quantity;
        row.customers.add(o.customer.name);
        droppedMap.set(key, row);
      }

      for (const k of m.keptItems) {
        const ref = catalog.item(k);
        if (!ref) continue;
        const key = ref.name.toLowerCase();
        const row = anchorMap.get(key) ?? { name: ref.name, count: 0, qty: 0, customers: new Set<string>() };
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
        .flatMap((x) => ((x.items as OrderItem[] | null) ?? []).map((it) => catalog.item(it)?.name.toLowerCase() ?? "")),
    );
    for (const it of (co.items as OrderItem[] | null) ?? []) {
      const name = catalog.item(it)?.name ?? "";
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

  // Catalogue products, by how many reachable customers (in the filter) bought or noted them.
  const reachableIds = reachable.map((r) => r.id);
  const buyersOf = new Map<string, string[]>();
  for (const id of reachableIds) for (const sku of custProds.get(id) ?? []) (buyersOf.get(sku) ?? buyersOf.set(sku, []).get(sku)!).push(id);
  const shown = catalog.products
    .map((p) => ({ name: p.name, n: buyersOf.get(p.retailerId)?.length ?? 0 }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  // Location view: city vs outside, plus the busiest areas.
  const REGIONS = regionsFor(homeCityOf(client));
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
  // Last 30 days of messages and replies, per catalogue product's buyers.
  const msgOf = new Map(msgByCustomer.map((r) => [r.cid, r]));
  const repliedSet = new Set(repliersMonth.map((r) => r.cid));
  const allBuyers = new Map<string, string[]>();
  for (const [id, set] of custProds) if (inScope(id)) for (const sku of set) (allBuyers.get(sku) ?? allBuyers.set(sku, []).get(sku)!).push(id);
  const byProduct = catalog.products
    .map((p) => {
      const who = allBuyers.get(p.retailerId) ?? [];
      const sum = (f: "sent" | "delivered" | "read" | "failed") => who.reduce((n, id) => n + Number(msgOf.get(id)?.[f] ?? 0), 0);
      return { tag: p.name, sent: sum("sent"), delivered: sum("delivered"), read: sum("read"), failed: sum("failed"), replies: who.filter((id) => repliedSet.has(id)).length };
    })
    .filter((r) => r.sent > 0)
    .sort((a, b) => b.sent - a.sent || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  const every = hourly ? 3 : keys.length > 16 ? Math.ceil(keys.length / 7) : 1;
  const periodText = period.phrase;

  /* ── Full All-Products Analytics (Including 0-Sales / Non-Selling SKUs) ── */
  const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Product groups come from the catalogue (lib/catalog detectCategory), never a list made for one business.
  const inferCat = (name: string) => detectCategory(name);

  // Period order & cart breakdown by normalized product name (plus top buyers, unpaid cart holders, and bundle partners)
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
      buyers: Map<string, ProductBuyerSummary>;
      unpaidHolders: ProductUnpaidHolder[];
      paired: Map<string, { name: string; count: number }>;
    }
  >();
  for (const o of curAllOrders) {
    if (o.status === "CANCELLED") continue;
    const bought = isBought(o);
    const orderItems = (o.items as OrderItem[] | null) ?? [];
    const orderCatalogNames = [
      ...new Set(
        orderItems
          .map((it) => catalog.item(it)?.name ?? "")
          .filter(Boolean),
      ),
    ];
    for (const it of orderItems) {
      const rawName = catalog.item(it)?.name ?? "";
      if (!rawName) continue; // not a catalogue product
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
        buyers: new Map<string, ProductBuyerSummary>(),
        unpaidHolders: [],
        paired: new Map<string, { name: string; count: number }>(),
      };
      if (price > 0 && entry.unitPrice === 0) entry.unitPrice = price;
      if (bought) {
        entry.soldQty += qty;
        entry.soldRevenue += val;
        entry.soldOrders.add(o.id);
        const existingBuyer = entry.buyers.get(o.customerId) ?? {
          customerId: o.customerId,
          name: o.customer.name,
          phone: o.customer.phone,
          qty: 0,
          spent: 0,
          ordersCount: 0,
        };
        existingBuyer.qty += qty;
        existingBuyer.spent += val;
        existingBuyer.ordersCount += 1;
        entry.buyers.set(o.customerId, existingBuyer);

        for (const otherName of orderCatalogNames) {
          const ok = normKey(otherName);
          if (ok === k) continue;
          const pairRow = entry.paired.get(ok) ?? { name: otherName, count: 0 };
          pairRow.count += 1;
          entry.paired.set(ok, pairRow);
        }
      } else {
        entry.cartQty += qty;
        entry.cartValue += val;
        entry.cartOrders.add(o.id);
        entry.unpaidHolders.push({
          customerId: o.customerId,
          name: o.customer.name,
          phone: o.customer.phone,
          orderRef: orderRef(o),
          qty,
          value: val,
        });
      }
      periodProdStats.set(k, entry);
    }
  }

  // All-time buyers & units per catalogue product (bought orders + sheet purchase notes), in the filter.
  const allTimeMap = new Map<string, { rawName: string; buyers: number; units: number }>();
  {
    const units = new Map<string, number>();
    for (const o of catOrders) {
      if (!inScope(o.customerId) || !(o.paidAt || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status))) continue;
      for (const l of o.lines) units.set(l.ref.retailerId, (units.get(l.ref.retailerId) ?? 0) + l.qty);
    }
    for (const p of catalog.products) {
      const buyers = allBuyers.get(p.retailerId)?.length ?? 0;
      if (!buyers && !units.get(p.retailerId)) continue;
      allTimeMap.set(normKey(p.name), { rawName: p.name, buyers, units: units.get(p.retailerId) ?? buyers });
    }
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

  // Only catalogue products are listed: order lines that don't match a catalogue item are left out.

  // Every map is keyed by the catalogue name, so lookups are exact (no borrowing another size's figures).
  const findStat = <T,>(m: Map<string, T>, key: string): T | undefined => m.get(key);

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
    const topBuyers: ProductBuyerSummary[] = pStat
      ? [...pStat.buyers.values()].sort((a, b) => b.qty - a.qty || b.spent - a.spent).slice(0, 6)
      : [];
    const unpaidHolders: ProductUnpaidHolder[] = pStat ? pStat.unpaidHolders.slice(0, 5) : [];
    const pairedProducts: ProductPairInsight[] = pStat
      ? [...pStat.paired.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5)
      : [];

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
      topBuyers,
      unpaidHolders,
      pairedProducts,
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
          solution: `Use ${p.name} as your hero bundle anchor to pull along 0-sale products, and keep a 30-day reorder reminder active for its ${p.allTimeBuyers} buyers.`,
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
        note: `${orderRef(o)} · ₹${Math.round(o.total).toLocaleString("en-IN")} · ${formatCartItems(o.items)}`,
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
      title: "Reorder Window Buyers (Ordered 31–60 Days Ago — Running Low Now)",
      shortTitle: "Reorder due (31–60d)",
      badge: "High-conversion reorder window",
      badgeTone: "blue",
      color: "#0ea5e9",
      customersCount: refill31to60List.length,
      sharePct: pct(refill31to60List.length, Math.max(1, customers)),
      revenueAtStake: refill31to60List.length * avgOrderVal,
      revenueLabel: `~₹${Math.round(refill31to60List.length * avgOrderVal).toLocaleString("en-IN")} repeat cycle potential`,
      whyItHappens:
        "Everyday products such as groceries, personal care and household items usually run out between day 30 and day 45. Reaching out just before they run low catches them at peak need, before they buy elsewhere.",
      howToGetThemBack: [
        `Turn on the Automated Reorder Reminder (${client?.refillDays ?? 30} days after order) on the Campaigns page so every buyer gets a timely nudge without manual effort.`,
        "Send a 1-tap 'Reorder your usual' message with the WhatsApp Catalogue attached so they can reorder in 15 seconds.",
        "Suggest upgrading from 500ml/1L to a monthly family combo pack to increase Average Order Value (AOV).",
      ],
      suggestedWhatsappCopy: `Hi {{name}}, hope you enjoyed your last order from ${client?.name ?? "us"}! Running low on your monthly stock? Tap below to view the catalogue and get fresh stock delivered to your doorstep.`,
      primaryCtaLabel: "Create reorder campaign",
      primaryCtaHref: "/dashboard/campaigns/new",
      secondaryCtaLabel: "View customers",
      secondaryCtaHref: "/dashboard/customers",
      leads: refill31to60List.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: c.last_order_at ? `Ordered ${fmtDate(c.last_order_at, "d MMM")} (due for reorder)` : "Due for monthly reorder",
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
        "Share a quick trust proof (genuine products, quality checks, fast doorstep delivery or happy-customer reviews) to overcome first-order hesitation.",
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

  /* ── Frequent Buyers, Top Customers, RFM Ratio & Loyalty Rewards Engine ── */
  const rankedCustomersList: TopCustomerLoyaltyItem[] = [];
  let totalLtvSum = 0;
  let totalBuyersWithSpend = 0;
  let totalLoyaltyPool = 0;
  let totalRewardRupeesPool = 0;

  for (const c of customerLifecycleRows) {
    const custOrders = [...(ordersByCust.get(c.id) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const paidCustOrders = custOrders.filter(isBought);
    const unpaidCustOrders = custOrders.filter(isUnpaidCart);
    const cancelledCustOrders = custOrders.filter((o) => o.status === "CANCELLED");

    const custSpent = paidCustOrders.reduce((s, o) => s + o.total, 0);
    const custUnpaidVal = unpaidCustOrders.reduce((s, o) => s + o.total, 0);
    const paidOrdersCount = Math.max(Number(c.paid_orders ?? 0), paidCustOrders.length);
    const custAov = paidCustOrders.length > 0 ? Math.round(custSpent / paidCustOrders.length) : 0;

    const gaps = paidCustOrders
      .slice(1)
      .map((o, i) => (o.createdAt.getTime() - paidCustOrders[i].createdAt.getTime()) / 86_400_000)
      .filter((g) => g >= 4);
    const avgGapDays = gaps.length ? Math.round(gaps.reduce((n, g) => n + g, 0) / gaps.length) : null;
    const lastPaidAt = paidCustOrders[paidCustOrders.length - 1]?.createdAt ?? (c.last_order_at ? new Date(c.last_order_at) : null);
    const daysSinceLastOrder = lastPaidAt ? Math.max(0, Math.round((now.getTime() - lastPaidAt.getTime()) / 86_400_000)) : null;

    const boughtItemMap = new Map<string, { name: string; qty: number; spent: number }>();
    for (const po of paidCustOrders) {
      for (const it of (po.items as OrderItem[] | null) ?? []) {
        const rawName = (catalog.item(it)?.name ?? it.name ?? it.id ?? "").trim();
        if (!rawName) continue;
        const k = rawName.toLowerCase();
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const row = boughtItemMap.get(k) ?? { name: rawName, qty: 0, spent: 0 };
        row.qty += qty;
        row.spent += price * qty;
        boughtItemMap.set(k, row);
      }
    }
    const mostlyBought = [...boughtItemMap.values()].sort((a, b) => b.qty - a.qty || b.spent - a.spent);

    const droppedItemMap = new Map<string, { name: string; qty: number; value: number }>();
    for (const co of cancelledCustOrders) {
      for (const it of (co.items as OrderItem[] | null) ?? []) {
        const rawName = (catalog.item(it)?.name ?? it.name ?? it.id ?? "").trim();
        if (!rawName) continue;
        const k = rawName.toLowerCase();
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const row = droppedItemMap.get(k) ?? { name: rawName, qty: 0, value: 0 };
        row.qty += qty;
        row.value += price * qty;
        droppedItemMap.set(k, row);
      }
    }
    const mostlyDropped = [...droppedItemMap.values()].sort((a, b) => b.qty - a.qty || b.value - a.value);

    const loyalty = computeCustomerLoyalty({
      name: c.name,
      brandName: client?.name,
      paidOrdersCount,
      totalSpent: custSpent,
      sheetPurchases: c.purchases,
      tags: c.tags,
      favoriteProduct: mostlyBought[0]?.name ?? null,
      droppedProduct: mostlyDropped[0]?.name ?? null,
      unpaidCartValue: custUnpaidVal,
      daysSinceLastOrder,
      avgGapDays,
      redeemedPoints: custOrders.reduce((n, o) => n + (o.status !== "CANCELLED" ? ((o as { pointsRedeemed?: number | null }).pointsRedeemed ?? 0) : 0), 0),
    });

    if (custSpent > 0) {
      totalLtvSum += custSpent;
      totalBuyersWithSpend += 1;
    }
    totalLoyaltyPool += loyalty.totalPoints;
    totalRewardRupeesPool += loyalty.rewardRupees;

    if (
      paidOrdersCount > 0 ||
      custSpent > 0 ||
      mostlyDropped.length > 0 ||
      custUnpaidVal > 0 ||
      Boolean(c.purchases && c.purchases.trim().length > 0) ||
      loyalty.manualPoints !== 0
    ) {
      rankedCustomersList.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        location: c.location,
        paidOrdersCount,
        totalSpent: custSpent,
        aov: custAov,
        avgGapDays,
        daysSinceLastOrder,
        lastOrderLabel: lastPaidAt ? fmtDate(lastPaidAt, "d MMM yyyy") : null,
        mostlyBought,
        mostlyDropped,
        unpaidCartValue: custUnpaidVal,
        sheetPurchases: c.purchases,
        loyalty,
      });
    }
  }

  rankedCustomersList.sort(
    (a, b) =>
      b.totalSpent - a.totalSpent ||
      b.paidOrdersCount - a.paidOrdersCount ||
      b.loyalty.totalPoints - a.loyalty.totalPoints,
  );

  const topFrequentCustomersData: TopFrequentCustomersData = {
    canManage: scope.canManage,
    totalBuyersCount: Math.max(totalEverBuyers, totalBuyersWithSpend),
    frequentBuyersCount: rankedCustomersList.filter((c) => c.loyalty.isFrequentBuyer).length,
    topSpendersCount: rankedCustomersList.filter((c) => c.loyalty.isTopCustomer).length,
    repeatPurchaseRatioPct: retentionRatePct,
    avgCustomerLtv: totalBuyersWithSpend > 0 ? Math.round(totalLtvSum / totalBuyersWithSpend) : avgOrderVal,
    totalLoyaltyPointsPool: totalLoyaltyPool,
    totalRewardRupeesPool,
    customers: rankedCustomersList,
  };

  const refillsWeek = ordersOn && cid ? refillForecastRes?.due.filter((d) => d.daysLeft <= 7) ?? [] : [];

  const view: View = askedView;

  if (mode !== "home") {
    // Reports → one of the analysis views, filtered by its own period and audience controls.
    return (
      <div key={view} className="animate-view-in">

      {/* Each section carries its own filters: the period and who/what it covers, right above its figures. */}
      <section
        aria-label={`${VIEWS[view].label} filters`}
        className="ui-card mb-3.5 rounded-card border border-line bg-panel px-3 py-2.5 shadow-xs sm:mb-5 sm:px-4 sm:py-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink sm:text-sm">
              {VIEWS[view].label} <span className="font-normal text-muted">· {period.label}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted sm:text-xs">
              {period.prevLabel !== "before" ? <>Compared with {prevLabel}</> : VIEWS[view].hint}
              {filtered && allowed && <> · {fmtNumber(allowed.length)} customer{allowed.length === 1 ? "" : "s"} in this filter</>}
            </p>
          </div>
          {filterOpts && (
            <FilterBar
              value={filters}
              options={filterOpts}
              basePath="/dashboard/report"
              extra={{ tab: mode }}
              periodLabel={period.label}
              sections={VIEW_FILTERS[view]}
              note={VIEW_FILTER_NOTE[view]}
              className="shrink-0"
            />
          )}
        </div>
        {filterOpts && <ActiveFilters className="mt-2 border-t border-line pt-2 sm:mt-2.5 sm:pt-2.5" value={filters} options={filterOpts} basePath="/dashboard/report" extra={{ tab: mode }} />}
      </section>

      {view === "overview" && (
        <>

      {/* Headline figures for the period, each with its real change against the stretch before. */}
      <div
        role="group"
        aria-label={`Figures for ${periodText}`}
        className={`grid grid-cols-2 gap-2.5 sm:gap-4 ${repliesOn ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
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
        <Card className="card-3d mt-3.5 sm:mt-5">
          <CardHeader tone="brand" icon={<Send3D />} title="Sending now" description="Campaigns delivering in batches. Batch size or interval changes apply from the next batch." />
          <ul className="divide-y divide-line">
            {activeRuns.map((r) => {
              const by = (s: string) => runProgress.find((p) => p.runId === r.id && p.status === s)?._count ?? 0;
              const queued = by("QUEUED");
              const done = r.total - queued;
              const eta = estimateDuration(queued, r.campaign.batchSize, r.campaign.intervalMinutes);
              return (
                <li key={r.id} className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/campaigns/${r.campaignId}`} className="text-[13px] font-medium text-ink hover:underline sm:text-sm">
                        {r.campaign.name}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <Meter raised className="mt-2" value={pct(done, r.total)} label={`${r.campaign.name} progress`} />
                    <p className="tabular mt-1.5 text-[11px] text-muted sm:text-xs">
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
      <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:mt-5 sm:gap-5 xl:grid-cols-12">
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
      <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:mt-5 sm:gap-5 md:grid-cols-2 xl:grid-cols-12">
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

          <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:mt-5 sm:gap-5 xl:grid-cols-12">
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
                  <li key={m.customerId} className="relative flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-subtle sm:gap-3 sm:px-5 sm:py-3 sm:text-sm">
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
                      <p className="truncate text-[11px] text-muted sm:text-xs">{m.body ?? templateLabel(m.templateName)}</p>
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
            <div className="min-w-0 space-y-3.5 sm:space-y-5 xl:col-span-5">
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
                    <li key={c.id} className="relative flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-subtle active:bg-sunken sm:gap-3 sm:px-5 sm:py-3">
                      <div className="grid w-10 shrink-0 place-items-center rounded-control border border-line bg-panel py-0.5 text-center sm:w-11 sm:py-1">
                        <span className="text-2xs font-medium uppercase text-muted">{fmtDate(c.nextRunAt, "EEE")}</span>
                        <span className="tabular text-[13px] font-semibold leading-tight text-ink sm:text-sm">{fmtDate(c.nextRunAt, "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-[13px] font-medium text-ink after:absolute after:inset-0 sm:text-sm">
                          {c.name}
                        </Link>
                        <p className="truncate text-[11px] text-muted sm:text-xs">
                          {fmtDate(c.nextRunAt, "h:mm a")} · {templateLabel(c.template.name)}
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
            </div>
          </div>
        </>
      )}

      {view === "customers" && (
        <div className="space-y-3.5 sm:space-y-5">
          <TopFrequentCustomersCard data={topFrequentCustomersData} />
          {ordersOn && <CustomerScenariosCard data={scenariosData} />}
          <CustomerGrowthPlaybookCard data={winbackPlaybookData} />
          <div className="grid grid-cols-1 gap-3.5 sm:gap-5 xl:grid-cols-2">
            <CustomerProductsCard items={shown.map((p) => ({ tag: `product:${p.name}`, label: p.name, n: p.n }))} />
            <CustomerAreasCard regions={byRegion}>
              <AreaChips topAreas={topAreas} otherAreas={otherAreas} />
            </CustomerAreasCard>
          </div>
          {repliesOn && <BestTimeCard cells={heat.map((h) => ({ d: h.d, b: h.b, n: Number(h.n) }))} days={90} />}
        </div>
      )}

      {view === "products" && ordersOn && (
        <div className="space-y-3.5 sm:space-y-5">
          <AllProductsIntelligenceCard data={allProductsData} />
          <div className="grid grid-cols-1 gap-3.5 sm:gap-5 xl:grid-cols-2">
            <TopProductsCard items={topProducts} rangeLabel={period.label} />
            {byProduct.length > 0 && <ProductCampaignGraphCard rows={byProduct} />}
          </div>
        </div>
      )}

      {view === "carts" && ordersOn && (
        <div className="space-y-3.5 sm:space-y-5">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
            <KpiTile
              label="Carts placed"
              value={curAllOrders.length}
              format="count"
              sub={`₹${Math.round(revenue + unpaidCartRevenue + cancelledCartRevenue).toLocaleString("en-IN")} total value · ${new Set(curAllOrders.map((o) => o.customerId)).size} buyers`}
              icon={ShoppingBag3D}
              color={C.brand}
              spark={cartSpark}
              delta={{ cur: curAllOrders.length, prev: prevAllOrders.length, kind: "pct" }}
              vs={prevLabel}
              href="/dashboard/orders?show=all"
            />
            <KpiTile
              label="Paid orders"
              value={curOrders.length}
              format="count"
              sub={`${curAllOrders.length ? Math.round((curOrders.length / curAllOrders.length) * 100) : 0}% converted · ₹${Math.round(revenue).toLocaleString("en-IN")}`}
              icon={Rupee3D}
              color={C.gold}
              spark={revenueSpark}
              delta={{ cur: revenue, prev: prevRevenue, kind: "pct" }}
              vs={prevLabel}
              href="/dashboard/orders?show=paid"
            />
            <KpiTile
              label="Unpaid carts waiting"
              value={curUnpaidCarts.length}
              format="count"
              sub={`₹${Math.round(unpaidCartRevenue).toLocaleString("en-IN")} awaiting payment`}
              icon={Clock3D}
              color={C.glow}
              spark={unpaidSpark}
              delta={{ cur: curUnpaidCarts.length, prev: prevUnpaidCarts.length, kind: "pct", goodWhenUp: false }}
              vs={prevLabel}
              href="/dashboard/orders?show=unpaid"
            />
            <KpiTile
              label="Replaced / cancelled"
              value={curCancelledCarts.length}
              format="count"
              sub={`₹${Math.round(cancelledCartRevenue).toLocaleString("en-IN")} revised away`}
              icon={Sparkles3D}
              color={C.failed}
              spark={cancelledSpark}
              delta={{ cur: curCancelledCarts.length, prev: prevCancelledCarts.length, kind: "pct", goodWhenUp: false }}
              vs={prevLabel}
              href="/dashboard/orders?show=cancelled"
            />
          </div>
          <CartMentalityCard data={cartMentalityData} />
        </div>
      )}
      </div>
    );
  }

  /* ── Home: a short live summary ── */
  const greetingText = nowHour < 12 ? "Good morning" : nowHour < 17 ? "Good afternoon" : "Good evening";
  const oldestWaitingAt = unhandledGroup.reduce<Date | null>((min, g) => {
    const t = g._min?.receivedAt ?? null;
    return t && (!min || t < min) ? t : min;
  }, null);

  const kpis: HomeKpi[] = [
    ordersOn
      ? { label: "Confirmed sales", value: `₹${Math.round(revenue).toLocaleString("en-IN")}`, cur: revenue, prev: prevRevenue, kind: "pct", spark: revenueSpark, href: "/dashboard/report?tab=funnel" }
      : { label: "Messages delivered", value: fmtNumber(delivered), cur: delivered, prev: prevDelivered, kind: "pct", spark: deliveredSpark, href: "/dashboard/report?tab=funnel" },
    { label: "Messages sent", value: fmtNumber(total), cur: total, prev: prevTotal, kind: "pct", spark: sentSpark, href: "/dashboard/messages" },
    {
      label: "Read rate",
      value: delivered ? `${Math.round(pct(read, delivered))}%` : "—",
      cur: delivered ? Math.round(pct(read, delivered)) : 0,
      prev: prevDelivered ? Math.round(pct(prevRead, prevDelivered)) : 0,
      // Nothing delivered before: there's no earlier rate to compare with ("New", not "+68 pts").
      kind: prevDelivered ? "pts" : "pct",
      spark: readRateSpark,
    },
    ...(repliesOn
      ? [{ label: "Customer replies", value: fmtNumber(replies), cur: replies, prev: prevReplies, kind: "pct" as const, spark: replySpark, href: "/dashboard/replies" }]
      : [{ label: "Customers", value: fmtNumber(customers), cur: customers, prev: customers, kind: "pct" as const, spark: [], href: "/dashboard/customers" }]),
  ];

  const sendingIds = new Set(activeRuns.map((r) => r.campaignId));
  const campaignRows: HomeCampaignRow[] = [
    ...activeRuns.map((r) => {
      const queued = runProgress.find((x) => x.runId === r.id && x.status === "QUEUED")?._count ?? 0;
      return { id: r.campaignId, name: r.campaign.name, when: `Sending now · ${fmtNumber(r.total - queued)} of ${fmtNumber(r.total)} done`, status: "Sending" as const };
    }),
    ...upcoming
      .filter((c) => !sendingIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        when: `${c.nextRunAt ? fmtDate(c.nextRunAt, "EEE, d MMM · h:mm a") : "Not scheduled"}${c.template.name ? ` · Template “${templateLabel(c.template.name)}”` : ""}`,
        status: c.template.status === "APPROVED" ? ("Scheduled" as const) : ("Template not approved" as const),
      })),
  ].slice(0, 3);

  // The brief: the same live figures in a sentence or two, with buttons to the pages it mentions.
  const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
  const facts: string[] = [];
  if (ordersOn) facts.push(`${plural(curOrders.length, "confirmed order")} worth ₹${Math.round(revenue).toLocaleString("en-IN")} (${period.label.toLowerCase()})`);
  if (ordersOn && curUnpaidCarts.length) facts.push(`${plural(curUnpaidCarts.length, "cart")} worth ₹${Math.round(unpaidCartRevenue).toLocaleString("en-IN")} still unpaid`);
  if (ordersOn && toDispatchCount) facts.push(`${plural(toDispatchCount, "order")} to pack`);
  if (repliesOn) facts.push(unhandledGroup.length ? `${plural(unhandledGroup.length, "chat")} waiting for a reply` : "no chats waiting");
  if (refillsWeek.length) facts.push(`${plural(refillsWeek.length, "regular customer")} due to reorder this week`);
  const brief = facts.length
    ? `${client?.name ?? "Your business"}: ${facts.join(", ")}.`
    : "Nothing to report yet. Figures appear here as soon as customers message and order.";
  const briefActions = [
    repliesOn && unhandledGroup.length ? { label: `Reply to ${plural(unhandledGroup.length, "chat")}`, href: "/dashboard/replies" } : null,
    ordersOn && curUnpaidCarts.length ? { label: "Chase unpaid carts", href: "/dashboard/orders?show=unpaid" } : null,
    ordersOn && toDispatchCount ? { label: "Packing list", href: "/dashboard/orders/packing" } : null,
    refillsWeek.length ? { label: "Reorders due", href: "/dashboard/refills" } : null,
  ].filter((a): a is { label: string; href: string } => Boolean(a)).slice(0, 3);

  // Warnings that need someone, shown right under the greeting.
  const alerts = (
    <>
        {ordersOn && (paymentsToCheckCount > 0 || refundsDueCount > 0) && (
          <Callout tone="warning" icon={<Clock />} className="mb-5" title="Payments to look at">
            {paymentsToCheckCount > 0 && (
              <>
                <Link href="/dashboard/orders?show=verify">{plural(paymentsToCheckCount, "customer")} say they paid</Link>: check the money came in, then mark the order paid.{" "}
              </>
            )}
            {refundsDueCount > 0 && (
              <>
                <Link href="/dashboard/orders?show=refund">{plural(refundsDueCount, "cancelled order")}</Link> still {refundsDueCount === 1 ? "owes" : "owe"} a refund.
              </>
            )}
          </Callout>
        )}
  
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
                    {plainError(paused.error)}. Queued messages are kept and go out automatically once it&apos;s fixed
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
                Scheduled campaigns won&apos;t start until it does. Check the &quot;Campaign scheduler&quot; workflow in GitHub → Actions.
              </Callout>
            )}
            {failedToday > 0 && (
              <Callout tone="danger" icon={<TriangleAlert />} title={`${fmtNumber(failedToday)} message${failedToday === 1 ? "" : "s"} failed in the last 24 hours.`}>
                <ul className="mt-0.5 list-disc pl-5">
                  {failures.map((x) => (
                    <li key={x.error ?? "unknown"}>
                      {plainError(x.error) || "Unknown error"} ({x._count})
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
                      <Link href={`/dashboard/campaigns/${c.id}`}>{c.name}</Link>: its message template is{" "}
                      {c.template.status === "PAUSED" ? "paused by Meta for low quality" : c.template.status === "DISABLED" ? "disabled by Meta" : "rejected"}.
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Edit the template so it&apos;s more useful to customers, or switch the campaign to another approved template.</p>
              </Callout>
            )}
          </div>
        )}
    </>
  );

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <HomeTiers
          greetingText={greetingText}
          businessName={cid ? scope.clientName : null}
          ordersOn={ordersOn}
          repliesOn={repliesOn}
          campaignsOn={campaignsOn}
          unpaidCartsCount={curUnpaidCarts.length}
          unpaidCartsValue={unpaidCartRevenue}
          toPackCount={toDispatchCount}
          toPackSplit={{ paid: toPackPaid, cod: toPackCod, other: toPackOther }}
          today={{ sent: todayMsgs.reduce((n, r) => n + Number(r.n), 0), replies: todayReplies.reduce((n, r) => n + Number(r.n), 0) }}
          unhandledRepliesCount={unhandledGroup.length}
          oldestWaitingAt={oldestWaitingAt}
          activeRange={filters.range}
          kpis={kpis}
          wallet={cid ? <HomeWallet clientId={cid} isWallet={client?.billingMode === "wallet"} lowAlert={client?.walletLowAlert ?? 0} canManage={scope.canManage} /> : null}
          campaigns={campaignRows}
          reminderDays={ordersOn && client ? client.refillDays : undefined}
          refillsDueCount={refillsWeek.length}
          brief={brief}
          briefActions={briefActions}
          actions={adminActions || null}
          alerts={alerts}
        />
      </div>

    </>
  );
}
