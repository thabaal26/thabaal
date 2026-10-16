import { Search } from "@/components/icons";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "@/components/intent-link";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { activeCount as filterCount, filterQuery, keepFilters, readFilters, resolvePeriod, type FilterSection } from "@/lib/filters";
import { filterOptions, orderScope } from "@/lib/filter-scope";
import { parseAddressText } from "@/lib/address";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { maxPointsDiscount } from "@/lib/loyalty-redeem";
import { LoyaltyRedeemSetting } from "./loyalty-points-ui";
import { readFields } from "@/lib/custom-fields";
import { isPictureVersion, isTemplatePicture, ORDER_TEMPLATE_NAMES, orderTemplateNames } from "@/lib/order-templates";
import { orderRef, type OrderItem } from "@/lib/orders";
import { ORDER_REF_RE, orderWhereRef } from "@/lib/order-ref";
import { slipPay } from "@/lib/payment-state";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { createOrderTemplates } from "../actions/orders";
import { NewOrder } from "./new-order";
import { OrderCard } from "./order-card";
import type { CatalogProductOption } from "./order-items-editor";
import { PrintButton, type ExportableOrderRow } from "./packing/print-button";
import { PaymentForm } from "./payment-form";
import { inr } from "../portal-format";
import { AutoSelect, PAction, PortalPage } from "../portal-ui";
import { OrdersTabs } from "./orders-tabs";

/** The utility templates that let order updates go out after the customer's 24-hour window. */
const ORDER_FILTERS: FilterSection[] = ["period", "products", "area"];

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

/** Cash on delivery not collected yet: the recorded method, or a team note saying COD for older orders. */
const COD_WHERE = {
  paidAt: null,
  status: { in: ["NEW", "CONFIRMED", "DISPATCHED", "DELIVERED"] },
  OR: [
    { paymentMethod: "cod" },
    { paymentMethod: null, internalNote: { contains: "cash on delivery", mode: "insensitive" } },
    { paymentMethod: null, internalNote: { contains: "COD" } },
  ],
};
const VERIFY_WHERE = { paidAt: null, paymentClaimedAt: { not: null }, status: { not: "CANCELLED" } };
const REFUND_WHERE = { status: "CANCELLED", refundedAt: null, OR: [{ paidAt: { not: null } }, { paidAmount: { gt: 0 } }] };
/** Shown only while they have orders (or are open), so the usual tabs stay short and uncluttered. */

/** Status chips (the order's stage). */
const TABS = [
  { key: "", label: "Active", where: { status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } },
  { key: "all", label: "All", where: {} },
  { key: "new", label: "New", where: { status: "NEW" } },
  { key: "confirmed", label: "Confirmed", where: { status: "CONFIRMED" } },
  { key: "paid", label: "Paid", where: { OR: [{ status: "PAID" }, { paidAt: { not: null } }] } },
  { key: "dispatched", label: "Dispatched", where: { status: "DISPATCHED" } },
  { key: "done", label: "Delivered", where: { status: "DELIVERED" } },
  { key: "cancelled", label: "Cancelled", where: { status: "CANCELLED" } },
] as const;

/** The payment filter (where the money stands), combined with the status chip. */
const PAY = [
  { key: "", label: "Payment: all", where: {} },
  { key: "unpaid", label: "Payment: waiting", where: { status: { in: ["NEW", "CONFIRMED", "DISPATCHED"] }, paidAt: null } },
  { key: "verify", label: "Payment: customer says paid", where: VERIFY_WHERE },
  { key: "cod", label: "Payment: cash on delivery", where: COD_WHERE },
  { key: "refund", label: "Payment: refund due", where: REFUND_WHERE },
] as const;

/** Where the order came from. */
const SOURCES = [
  { key: "", label: "From: everywhere", where: {} },
  { key: "wa", label: "From: WhatsApp cart", where: { waMessageId: { not: null } } },
  { key: "manual", label: "From: manual entry", where: { waMessageId: null } },
] as const;

const SORT_OPTIONS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "total", label: "Amount: High to low" },
];

function getDateWhere(range?: string) {
  if (!range) return {};
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { createdAt: { gte: start } };
  }
  if (range === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { createdAt: { gte: start, lt: end } };
  }
  if (range === "7d") {
    const start = new Date(Date.now() - 7 * 86400000);
    return { createdAt: { gte: start } };
  }
  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { createdAt: { gte: start } };
  }
  return {};
}

export default async function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const sp = await searchParams;
  const rawShow = typeof sp.show === "string" ? sp.show : "";
  // Older links (Home, Payments) put payment states in ?show=; they are the payment filter now.
  const legacyPay = PAY.some((x) => x.key && x.key === rawShow) ? rawShow : "";
  const show = legacyPay ? "all" : rawShow;
  const payKey = legacyPay || (typeof sp.pay === "string" && PAY.some((x) => x.key === sp.pay) ? sp.pay : "");
  const srcKey = typeof sp.src === "string" && SOURCES.some((x) => x.key === sp.src) ? sp.src : "";
  const payF = PAY.find((x) => x.key === payKey) ?? PAY[0];
  const srcF = SOURCES.find((x) => x.key === srcKey) ?? SOURCES[0];
  const date = typeof sp.date === "string" ? sp.date : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "new";

  const scope = await getScope();
  const tab = TABS.find((t) => t.key === show) ?? TABS[0];
  const mine = owned(scope);
  // Shared filters: period (presets or custom dates), catalogue products, and delivery area.
  const filters = keepFilters(readFilters(sp, "all"), ORDER_FILTERS);
  const period = resolvePeriod(filters);
  const dateWhere = filters.range !== "all" ? { createdAt: { gte: period.start, lt: period.end } } : getDateWhere(date);
  const [extraWhere, filterOpts] = await Promise.all([orderScope(scope.clientId, filters), scope.clientId ? filterOptions(scope.clientId) : null]);

  const cleanPhone = q.replace(/\D/g, "");
  const orderNumMatch = q.match(/(?:rg-?)?(\d+)/i);
  const orderNum = orderNumMatch ? parseInt(orderNumMatch[1], 10) : null;
  const itemSearchIds =
    q && scope.clientId
      ? (
          await db.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Order"
            WHERE "clientId" = ${scope.clientId} AND items::text ILIKE ${`%${q}%`}
          `
        ).map((r) => r.id)
      : [];
  const searchWhere = q
    ? {
        OR: [
          { customer: { name: { contains: q, mode: "insensitive" as const } } },
          { customer: { location: { contains: q, mode: "insensitive" as const } } },
          { customer: { locationRaw: { contains: q, mode: "insensitive" as const } } },
          { internalNote: { contains: q, mode: "insensitive" as const } },
          { note: { contains: q, mode: "insensitive" as const } },
          ...(cleanPhone.length >= 3 ? [{ customer: { phone: { contains: cleanPhone } } }] : []),
          ...(orderNum && !isNaN(orderNum) ? [{ number: orderNum }] : []),
          // This client's own order numbers (FM-1001) and the older shared ones (RG-1023 → number 23).
          ...(ORDER_REF_RE.test(q) ? [orderWhereRef(ORDER_REF_RE.exec(q)![1])] : []),
          ...(itemSearchIds.length > 0 ? [{ id: { in: itemSearchIds } }] : []),
        ],
      }
    : {};

  const orderBy =
    sort === "old"
      ? [{ createdAt: "asc" as const }]
      : sort === "total"
        ? [{ total: "desc" as const }]
        : [{ createdAt: "desc" as const }];

  // AND keeps each part's OR separate (the Paid tab and the search both use OR).
  const scoped = { ...mine, ...dateWhere, ...extraWhere };
  const baseWhere = { ...scoped, AND: [tab.where as object, payF.where as object, srcF.where as object, searchWhere] };

  const [
    orders,
    activeCount,
    newCount,
    confirmedCount,
    paidCount,
    unpaidCount,
    dispatchedCount,
    deliveredCount,
    cancelledCount,
    allCount,
    verifyCount,
    codCount,
    refundCount,
    orderTemplates,
    client,
    ownPaymentTemplate,
    paymentTemplate,
    catalogData,
    paidToPackCount,
    activeSum,
  ] = await Promise.all([
    db.order.findMany({
      where: baseWhere,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            location: true,
            locationRaw: true,
            tags: true,
            purchases: true,
            client: { select: { name: true } },
            orders: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                number: true, ref: true,
                total: true,
                currency: true,
                status: true,
                items: true,
                internalNote: true,
                createdAt: true,
                paidAt: true,
                pointsRedeemed: true,
              },
            },
          },
        },
        client: { select: { paymentConfig: true } },
      },
      orderBy,
      take: 200,
    }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "NEW" } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "CONFIRMED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, OR: [{ status: "PAID" }, { paidAt: { not: null } }] } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: { in: ["NEW", "CONFIRMED", "DISPATCHED"] }, paidAt: null } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "DISPATCHED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "DELIVERED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "CANCELLED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere } }),
    db.order.count({ where: { ...scoped, ...VERIFY_WHERE } as object }),
    db.order.count({ where: { ...scoped, ...COD_WHERE } as object }),
    db.order.count({ where: { ...scoped, ...REFUND_WHERE } as object }),
    scope.clientId ? db.template.findMany({ where: { clientId: scope.clientId, name: { in: ORDER_TEMPLATE_NAMES.flatMap(orderTemplateNames) } }, select: { name: true, status: true, headerMediaUrl: true } }) : [],
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { paymentConfig: true, defaultImageUrl: true, bannerUrl: true, customFields: true, loyaltyAutoRedeem: true } }) : null,
    scope.clientId ? db.template.findFirst({ where: { clientId: scope.clientId, name: PAYMENT_TEMPLATE }, select: { status: true } }) : null,
    scope.clientId ? paymentTemplateFor(scope.clientId) : null,
    scope.clientId ? getCatalogWithProducts(scope.clientId) : null,
    // Paid and not sent yet: the paid half of "to pack" (the Paid tab also counts dispatched and delivered ones).
    db.order.count({ where: { ...mine, ...dateWhere, ...extraWhere, status: "PAID" } }),
    // What the active orders are worth (the list below may be a filtered or capped view).
    db.order.findMany({ where: { ...mine, ...dateWhere, ...extraWhere, status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } }, select: { items: true, total: true, pointsRedeemed: true } }),
  ]);

  const waiting = await db.order.aggregate({ where: { ...scoped, status: { in: ["NEW", "CONFIRMED", "DISPATCHED"] }, paidAt: null }, _sum: { total: true } });
  const waitingSum = waiting._sum.total ?? 0;

  // Unpaid orders: what each customer could take off in loyalty points right now.
  const pointsFor = (o: (typeof orders)[number]) =>
    o.status === "CANCELLED" || o.paidAt || (o.paidAmount ?? 0) > 0 ? null : maxPointsDiscount(o);

  const catalogProducts: CatalogProductOption[] = (catalogData?.products ?? []).map((p) => ({
    id: p.id,
    retailerId: p.retailerId,
    name: p.name,
    priceAmount: p.priceAmount,
    category: p.category,
    inStock: p.inStock,
  }));
  const catalogId = catalogData?.catalogId ?? null;
  const isLiveCatalog = Boolean(catalogData?.isLive);

  const exportOrders: ExportableOrderRow[] = orders.map((o) => {
    const items = (o.items as OrderItem[]).map((i) => ({
      name: i.name ?? i.id,
      quantity: i.quantity,
      price: i.price,
    }));
    const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) });
    const fullAddress =
      o.note?.trim() || o.customer.locationRaw?.trim() || o.customer.location?.trim() || "";
    const area =
      o.customer.location?.trim() ||
      (fullAddress ? parseAddressText(fullAddress).area : null) ||
      "Area not noted";
    return {
      id: o.id,
      orderRef: orderRef(o),
      createdAt: fmtDate(o.createdAt, "EEE d MMM, h:mm a"),
      status: o.status,
      isPaid: o.status === "PAID" || o.paidAt !== null,
      payLabel: slipPay(o, pricing.total).label,
      collect: slipPay(o, pricing.total).collect,
      customerName: o.customer.name,
      customerPhone: formatPhone(o.customer.phone),
      area,
      address: fullAddress,
      items,
      total: pricing.total,
      discount: pricing.discount,
      currency: o.currency,
      note: [o.note, o.internalNote].filter(Boolean).join(" · "),
    };
  });

  const tabCount: Record<string, number> = {
    "": activeCount,
    new: newCount,
    confirmed: confirmedCount,
    paid: paidCount,
    unpaid: unpaidCount,
    dispatched: dispatchedCount,
    done: deliveredCount,
    cancelled: cancelledCount,
    all: allCount,
    verify: verifyCount,
    cod: codCount,
    refund: refundCount,
  };

  // An order update is covered when either the plain or the picture version is approved.
  const notReady = ORDER_TEMPLATE_NAMES.filter((name) => !orderTemplates.some((t) => (t.name === name || isPictureVersion(t.name, name)) && t.status === "APPROVED"));
  const pictureStatus = ORDER_TEMPLATE_NAMES.map((name) => ({ name, status: orderTemplates.find((t) => isPictureVersion(t.name, name))?.status ?? null }));
  // The order picture: the one their picture templates already use, else this client's message picture or banner.
  const h = await headers();
  const fullUrl = (u: string | null | undefined) => (u?.startsWith("/") ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}${u}` : u?.trim() || null);
  const headerImage =
    orderTemplates.map((t) => t.headerMediaUrl).find(isTemplatePicture) ??
    [fullUrl(client?.defaultImageUrl), fullUrl(client?.bannerUrl)].find(isTemplatePicture) ??
    null;
  const missing = ORDER_TEMPLATE_NAMES.filter((name) => !orderTemplates.some((t) => t.name === name));
  const orderFields = readFields(client?.customFields, "order");
  // Client staff pack and dispatch their own orders, so they get the order buttons too.
  const canEdit = scope.canOperate && (scope.canManage || !!scope.clientId);

  const filtered = Boolean(q || date || payKey || srcKey || (sort && sort !== "new") || filterCount(filters) || filters.range !== "all");

  const qs = (patch: Record<string, string | undefined>) => {
    const next = {
      show: tab.key || undefined,
      pay: payKey || undefined,
      src: srcKey || undefined,
      date: date || undefined,
      sort: sort !== "new" ? sort : undefined,
      q: q || undefined,
      ...patch,
    };
    const s = filterQuery(filters, next, "all");
    return `/dashboard/orders${s ? `?${s}` : ""}`;
  };

  const activeWorth = activeSum.reduce((sum, o) => sum + getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) }).total, 0);
  const hidden = [...new URLSearchParams(filterQuery(filters, {}, "all"))];

  return (
    <PortalPage title="Orders" titleTa="ஆர்டர்கள்" sub="Track, pack, dispatch and deliver every order." subTa="ஒவ்வொரு ஆர்டரையும் கண்காணித்து, பேக் செய்து, அனுப்பி, டெலிவரி செய்யுங்கள்.">
      <OrdersTabs active="orders" />

      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <Link className="card stat" href={qs({ show: "new" })} style={{ textDecoration: "none" }}>
          <div className="l">New orders</div>
          <div className="v">{fmtNumber(newCount)}</div>
          <div className="d muted">{newCount > 0 ? "Confirm these first" : "All caught up"}</div>
        </Link>
        <Link className="card stat" href={qs({ show: "all", pay: "unpaid" })} style={{ textDecoration: "none" }}>
          <div className="l">Payment waiting</div>
          <div className="v">{inr(waitingSum)}</div>
          <div className="d muted">{fmtNumber(unpaidCount)} order{unpaidCount === 1 ? "" : "s"} · not received yet</div>
        </Link>
        <Link className="card stat" href="/dashboard/orders/packing" style={{ textDecoration: "none" }}>
          <div className="l">To pack</div>
          <div className="v">{fmtNumber(confirmedCount + paidToPackCount)}</div>
          <div className="d muted">
            {fmtNumber(paidToPackCount)} paid · {fmtNumber(confirmedCount)} confirmed
          </div>
        </Link>
        <Link className="card stat" href={qs({ show: "dispatched" })} style={{ textDecoration: "none" }}>
          <div className="l">Dispatched</div>
          <div className="v">{fmtNumber(dispatchedCount)}</div>
          <div className="d muted">{activeCount > 0 ? `${inr(activeWorth)} in active orders` : "Nothing in progress"}</div>
        </Link>
      </div>

      <form role="search" aria-label="Filter orders" className="toolbar">
        {tab.key && <input type="hidden" name="show" value={tab.key} />}
        {hidden.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}
        <div className="search">
          <Search aria-hidden />
          <input key={q} name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="Search customer, phone, order or item" aria-label="Search orders" />
        </div>
        <AutoSelect name="pay" label="Payment status" value={payKey} options={PAY.map((x) => ({ value: x.key, label: x.label }))} />
        <AutoSelect name="src" label="Where the order came from" value={srcKey} options={SOURCES.map((x) => ({ value: x.key, label: x.label }))} />
        <AutoSelect name="sort" label="Sort orders" value={sort} options={SORT_OPTIONS} />
        {filterOpts && (
          <FilterBar
            value={filters}
            options={filterOpts}
            basePath="/dashboard/orders"
            extra={{ show: tab.key || undefined, pay: payKey || undefined, src: srcKey || undefined, q: q || undefined, sort: sort !== "new" ? sort : undefined }}
            defaultRange="all"
            sections={ORDER_FILTERS}
            note="Filter orders by date period, catalogue product, or delivery area."
            periodLabel={filters.range === "all" ? "Any date" : period.label}
          />
        )}
        {exportOrders.length > 0 && (
          <PrintButton orders={exportOrders} picks={[]} title={`Orders · ${tab.label}`} filenamePrefix={`orders-${tab.key || "active"}`} compact />
        )}
        {scope.clientId && canEdit && (
          <span style={{ marginLeft: "auto" }}>
            <NewOrder catalogProducts={catalogProducts} catalogId={catalogId} isLiveCatalog={isLiveCatalog} hasPaymentConfig={Boolean(client?.paymentConfig)} initialOpen={sp.new === "1"} />
          </span>
        )}
      </form>
      {filterOpts && filterCount(filters) > 0 && (
        <div style={{ marginBottom: 14 }}>
          <ActiveFilters value={filters} options={filterOpts} basePath="/dashboard/orders" extra={{ show: tab.key || undefined, pay: payKey || undefined, src: srcKey || undefined, q: q || undefined, sort: sort !== "new" ? sort : undefined }} defaultRange="all" />
        </div>
      )}

      <div className="chips" style={{ marginBottom: 14, alignItems: "center" }}>
        {TABS.map((t) => (
          <Link key={t.key} className="chip" href={qs({ show: t.key || undefined })} aria-pressed={tab.key === t.key} scroll={false}>
            {t.label} <small>{fmtNumber(tabCount[t.key])}</small>
          </Link>
        ))}
        {filtered && (
          <Link className="btn sm ghost" href={tab.key ? `/dashboard/orders?show=${tab.key}` : "/dashboard/orders"} style={{ marginLeft: "auto" }}>
            Reset filters
          </Link>
        )}
      </div>
      <p className="muted small" style={{ margin: "-6px 0 14px" }}>
        Steps: New › Confirmed › Paid / COD › Dispatched › Delivered
      </p>

      <div className="stack">
        {(verifyCount > 0 || refundCount > 0 || codCount > 0) && !payKey && (
          <div className="note">
            <b>Payments that need you: </b>
            {[
              verifyCount > 0 && (
                <Link key="v" className="linkb" href={qs({ show: "all", pay: "verify" })}>
                  {fmtNumber(verifyCount)} customer{verifyCount === 1 ? " says" : "s say"} paid: check and confirm
                </Link>
              ),
              codCount > 0 && (
                <Link key="c" className="linkb" href={qs({ show: "all", pay: "cod" })}>
                  {fmtNumber(codCount)} cash on delivery to collect
                </Link>
              ),
              refundCount > 0 && (
                <Link key="r" className="linkb" href={qs({ show: "all", pay: "refund" })}>
                  {fmtNumber(refundCount)} cancelled after payment: refund due
                </Link>
              ),
            ]
              .filter(Boolean)
              .flatMap((x, i) => (i ? [" · ", x] : [x]))}
          </div>
        )}

        {scope.clientId && notReady.length > 0 && (
          <div className="note small" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 220 }}>
              <b>Order updates after 24 hours need approved templates.</b> Not ready yet: {notReady.join(", ")}.{" "}
              {missing.length === 0 ? "They're waiting for Meta's approval." : scope.canManage ? "Create them once and Meta usually approves within minutes." : "Ask your admin to create them."}
            </span>
            {scope.canManage && missing.length > 0 && (
              <PAction action={createOrderTemplates} confirm={`Create and submit ${missing.join(", ")} to Meta?`}>
                Create order templates
              </PAction>
            )}
          </div>
        )}

        {orders.length ? (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              items={o.items as OrderItem[]}
              showClient={!scope.clientId}
              canEdit={canEdit}
              catalogProducts={catalogProducts}
              isLiveCatalog={isLiveCatalog}
              orderFields={orderFields}
              points={pointsFor(o)}
            />
          ))
        ) : (
          <section className="card">
            <h2>No orders match.</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              {filtered
                ? "Try another status, payment filter or date, or clear your search."
                : "When a customer sends a cart from your WhatsApp catalogue, it appears here with items, total and a one-tap confirmation."}
            </p>
          </section>
        )}
      </div>

      {scope.canManage && scope.clientId && (
        <details className="card more" style={{ marginTop: 24 }}>
          <summary>
            <span>
              Order and payment settings
              <span className="muted small" style={{ display: "block", fontWeight: 400 }}>
                Loyalty points at checkout, WhatsApp payments and the order message picture
              </span>
            </span>
          </summary>
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              {headerImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- the client's own picture
                <img src={headerImage} alt="Order message picture" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />
              ) : (
                <span className="note small" style={{ width: 64, height: 64, display: "grid", placeItems: "center", padding: 0 }}>
                  No picture
                </span>
              )}
              <div className="grow">
                <div className="t">Order messages with your picture</div>
                <p className="muted small">
                  {pictureStatus.map((p) => `${p.name.replace("order_", "")}: ${p.status ? p.status.toLowerCase() : "not created"}`).join(" · ")}. Used automatically once approved; the plain versions cover the
                  wait.
                </p>
                {!headerImage && <p className="muted small">Add a message picture (a public JPG or PNG link) under Clients → Edit branding to create these.</p>}
              </div>
              {headerImage && pictureStatus.some((p) => !p.status) && (
                <PAction action={createOrderTemplates.bind(null, headerImage)} confirm="Create the picture versions of the order templates and submit them to Meta?">
                  Create with picture
                </PAction>
              )}
            </div>
            {client && <LoyaltyRedeemSetting on={client.loyaltyAutoRedeem} />}
            {client && <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />}
          </div>
        </details>
      )}
    </PortalPage>
  );
}
