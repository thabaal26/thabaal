import { PackageCheck, PackageOpen, Search, Store, Truck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Rupee3D, ShoppingBag3D } from "@/components/icons-3d";
import { Picker } from "@/components/picker";
import { buttonClass, Callout, Card, DistributionBar, EmptyState, FilterChips, PageHeader, Section, Stat } from "@/components/ui";
import { parseAddressText } from "@/lib/address";
import { getCatalogWithProducts } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getOrderPricing } from "@/lib/order-pricing";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { sendableTemplates } from "@/lib/senders";
import { META_SAMPLES } from "@/lib/template";
import { ActionButton } from "@/components/action-button";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { createOrderTemplates } from "../actions/orders";
import { NewOrder } from "./new-order";
import { OrderCard } from "./order-card";
import type { CatalogProductOption } from "./order-items-editor";
import { PrintButton, type ExportableOrderRow } from "./packing/print-button";
import { PaymentForm } from "./payment-form";
import { RefillForm } from "./refill-form";
import { OrdersRefreshButton } from "./orders-refresh-button";

/** The utility templates that let order updates go out after the customer's 24-hour window. */
const ORDER_TEMPLATES = ["order_confirmation", "order_dispatched", "order_delivered", "order_cancelled"];

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "Active", where: { status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } },
  { key: "new", label: "New", where: { status: "NEW" } },
  { key: "confirmed", label: "Confirmed", where: { status: "CONFIRMED" } },
  { key: "paid", label: "Paid", where: { OR: [{ status: "PAID" }, { paidAt: { not: null } }] } },
  { key: "unpaid", label: "Unpaid", where: { status: { in: ["NEW", "CONFIRMED", "DISPATCHED"] }, paidAt: null } },
  { key: "dispatched", label: "Dispatched", where: { status: "DISPATCHED" } },
  { key: "done", label: "Delivered", where: { status: "DELIVERED" } },
  { key: "cancelled", label: "Cancelled", where: { status: "CANCELLED" } },
  { key: "all", label: "All", where: {} },
] as const;

const DATE_RANGES = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
];

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
  const show = typeof sp.show === "string" ? sp.show : "";
  const date = typeof sp.date === "string" ? sp.date : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "new";

  const scope = await getScope();
  const tab = TABS.find((t) => t.key === show) ?? TABS[0];
  const mine = owned(scope);
  const dateWhere = getDateWhere(date);

  const cleanPhone = q.replace(/\D/g, "");
  const orderNumMatch = q.match(/(?:rg-?)?(\d+)/i);
  const orderNum = orderNumMatch ? parseInt(orderNumMatch[1], 10) : null;
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
        ],
      }
    : {};

  const orderBy =
    sort === "old"
      ? [{ createdAt: "asc" as const }]
      : sort === "total"
        ? [{ total: "desc" as const }]
        : [{ createdAt: "desc" as const }];

  const baseWhere = { ...mine, ...(tab.where as object), ...dateWhere, ...searchWhere };

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
    orderTemplates,
    client,
    approved,
    ownPaymentTemplate,
    paymentTemplate,
    catalogData,
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
            client: { select: { name: true } },
            orders: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                number: true,
                total: true,
                currency: true,
                status: true,
                items: true,
                internalNote: true,
                createdAt: true,
                paidAt: true,
              },
            },
          },
        },
        client: { select: { paymentConfig: true } },
      },
      orderBy,
      take: 200,
    }),
    db.order.count({ where: { ...mine, ...dateWhere, status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: "NEW" } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: "CONFIRMED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, OR: [{ status: "PAID" }, { paidAt: { not: null } }] } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: { in: ["NEW", "CONFIRMED", "DISPATCHED"] }, paidAt: null } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: "DISPATCHED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: "DELIVERED" } }),
    db.order.count({ where: { ...mine, ...dateWhere, status: "CANCELLED" } }),
    db.order.count({ where: { ...mine, ...dateWhere } }),
    scope.clientId ? db.template.findMany({ where: { clientId: scope.clientId, name: { in: [...ORDER_TEMPLATES, ...ORDER_TEMPLATES.map((n) => `thenan_${n}`)] } }, select: { name: true, status: true } }) : [],
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { refillDays: true, refillTemplateId: true, lapsedDays: true, winbackTemplateId: true, paymentConfig: true } }) : null,
    scope.clientId && scope.canManage
      ? db.template.findMany({ where: { clientId: scope.clientId, status: "APPROVED", category: { not: "AUTHENTICATION" }, name: { notIn: [...ORDER_TEMPLATES, ...META_SAMPLES] }, ...(await sendableTemplates(scope.clientId)) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    scope.clientId ? db.template.findFirst({ where: { clientId: scope.clientId, name: PAYMENT_TEMPLATE }, select: { status: true } }) : null,
    scope.clientId ? paymentTemplateFor(scope.clientId) : null,
    scope.clientId ? getCatalogWithProducts(scope.clientId) : null,
  ]);

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
    const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true });
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
      customerName: o.customer.name,
      customerPhone: formatPhone(o.customer.phone),
      area,
      address: fullAddress,
      items,
      total: pricing.total,
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
  };

  // An order update is covered when either the plain or the picture version is approved.
  const notReady = ORDER_TEMPLATES.filter((name) => !orderTemplates.some((t) => (t.name === name || t.name === `thenan_${name}`) && t.status === "APPROVED"));
  const pictureStatus = ORDER_TEMPLATES.map((name) => ({ name: `thenan_${name}`, status: orderTemplates.find((t) => t.name === `thenan_${name}`)?.status ?? null }));
  const h = await headers();
  const headerImage = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/thenan-order-header.jpg`;
  const missing = ORDER_TEMPLATES.filter((name) => !orderTemplates.some((t) => t.name === name));
  // Client staff pack and dispatch their own orders, so they get the order buttons too.
  const canEdit = scope.canOperate && (scope.canManage || !!scope.clientId);

  const filtered = Boolean(q || date || (sort && sort !== "new"));

  const qs = (patch: Record<string, string | undefined>) => {
    const next = {
      show: tab.key || undefined,
      date: date || undefined,
      sort: sort !== "new" ? sort : undefined,
      q: q || undefined,
      ...patch,
    };
    const s = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/orders${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="WhatsApp catalogue carts and orders you add by hand. Confirm, dispatch and deliver them here; the customer gets a WhatsApp update at each step."
        actions={
          <div className="flex items-center gap-2">
            <OrdersRefreshButton className="max-sm:w-11 max-sm:px-0" />
            <Link href="/dashboard/catalogue" aria-label="Catalogue Menu" className={cn(buttonClass("secondary"), "max-sm:w-11 max-sm:px-0")}>
              <Store aria-hidden className="size-4" /> <span className="max-sm:hidden">Catalogue</span>
            </Link>
            {scope.clientId && canEdit ? (
              <>
                <Link href="/dashboard/orders/packing" aria-label="Packing list" className={cn(buttonClass("secondary"), "max-sm:w-11 max-sm:px-0")}>
                  <PackageOpen aria-hidden className="size-4" /> <span className="max-sm:hidden">Packing list</span>
                </Link>
                <NewOrder
                  catalogProducts={catalogProducts}
                  catalogId={catalogId}
                  isLiveCatalog={isLiveCatalog}
                  hasPaymentConfig={Boolean(client?.paymentConfig)}
                />
              </>
            ) : null}
          </div>
        }
        inlineActions
        tabs={
          <FilterChips
            label="Order status"
            items={TABS.map((t) => ({
              href: qs({ show: t.key || undefined }),
              label: t.label,
              count: fmtNumber(tabCount[t.key]),
              active: tab.key === t.key,
            }))}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Active pipeline"
          value={fmtNumber(activeCount)}
          sub={`${fmtNumber(unpaidCount)} unpaid · ${fmtNumber(dispatchedCount)} in transit`}
          icon={<ShoppingBag3D />}
          tone="brand"
          href={qs({ show: undefined })}
        />
        <Stat
          label="New · To confirm"
          value={fmtNumber(newCount)}
          sub={newCount > 0 ? "Waiting for confirmation" : "All caught up"}
          icon={<PackageOpen />}
          tone="amber"
          href={qs({ show: "new" })}
        />
        <Stat
          label="To pack & dispatch"
          value={fmtNumber(confirmedCount + paidCount)}
          sub={`${fmtNumber(confirmedCount)} confirmed · ${fmtNumber(paidCount)} paid`}
          icon={<Truck />}
          tone="info"
          href="/dashboard/orders/packing"
        />
        <Stat
          label="Shown order value"
          value={money(
            orders
              .filter((o) => o.status !== "CANCELLED")
              .reduce((sum, o) => sum + getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true }).total, 0),
          )}
          sub={`${fmtNumber(deliveredCount)} delivered · ${fmtNumber(allCount)} total`}
          icon={<Rupee3D />}
          tone="gold"
          href={qs({ show: "done" })}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Card className="card-3d">
          <form role="search" aria-label="Filter orders" className="grid gap-2 p-3 sm:flex sm:flex-wrap sm:items-center sm:p-4">
            {tab.key && <input type="hidden" name="show" value={tab.key} />}
            <div className="relative min-w-0 sm:min-w-56 sm:flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                name="q"
                type="search"
                enterKeyHint="search"
                defaultValue={q}
                placeholder="Search customer, phone, RG-1001, item…"
                aria-label="Search customer, phone, order number or item"
                className="field pl-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <Picker
                name="date"
                autoSubmit
                title="Time range"
                defaultValue={date}
                className="sm:w-40"
                options={DATE_RANGES}
              />
              <Picker
                name="sort"
                autoSubmit
                title="Sort orders"
                defaultValue={sort}
                className="sm:w-48"
                options={SORT_OPTIONS}
              />
            </div>
            <button className={cn(buttonClass("secondary"), "max-sm:hidden")}>Filter</button>
            {filtered && (
              <Link
                href={tab.key ? `/dashboard/orders?show=${tab.key}` : "/dashboard/orders"}
                className={cn(buttonClass("ghost"), "max-sm:h-9 max-sm:justify-self-start max-sm:px-1 max-sm:text-sm")}
              >
                Clear filters
              </Link>
            )}
          </form>
          {allCount > 0 && (
            <div className="border-t border-line px-3 py-3 sm:px-4">
              <DistributionBar
                segments={[
                  { key: "new", label: "New", value: newCount, color: "#b7791f", href: qs({ show: "new" }) },
                  { key: "confirmed", label: "Confirmed", value: confirmedCount, color: "#1d64a8", href: qs({ show: "confirmed" }) },
                  { key: "dispatched", label: "Dispatched", value: dispatchedCount, color: "#6941c6", href: qs({ show: "dispatched" }) },
                  { key: "done", label: "Delivered", value: deliveredCount, color: "#167d63", href: qs({ show: "done" }) },
                  { key: "cancelled", label: "Cancelled", value: cancelledCount, color: "#98a2b3", href: qs({ show: "cancelled" }) },
                ]}
              />
            </div>
          )}
          {exportOrders.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle/40 px-3 py-2.5 sm:px-4">
              <span className="text-xs font-medium text-muted">
                Export or print {exportOrders.length} shown order{exportOrders.length === 1 ? "" : "s"} ({tab.label}):
              </span>
              <PrintButton
                orders={exportOrders}
                picks={[]}
                title={`Orders · ${tab.label}`}
                filenamePrefix={`orders-${tab.key || "active"}`}
              />
            </div>
          )}
        </Card>

        {scope.clientId && notReady.length > 0 && (
          <Callout
            className="order-last sm:order-first"
            title="Order updates after 24 hours need approved templates."
            action={
              scope.canManage &&
              missing.length > 0 && (
                <ActionButton action={createOrderTemplates} confirm={`Create and submit ${missing.join(", ")} to Meta?`}>
                  Create order templates
                </ActionButton>
              )
            }
          >
            Not ready yet: {notReady.join(", ")}.{" "}
            {missing.length === 0 ? "They're waiting for Meta's approval." : scope.canManage ? "Create them once and Meta usually approves within minutes." : "Ask your admin to create them."}
          </Callout>
        )}

        {orders.length ? (
          <ul className="grid gap-3 sm:gap-4 xl:grid-cols-2">
            {orders.map((o) => (
              <li key={o.id} className="min-w-0">
                <OrderCard
                  order={o}
                  items={o.items as OrderItem[]}
                  showClient={!scope.clientId}
                  canEdit={canEdit}
                  catalogProducts={catalogProducts}
                  isLiveCatalog={isLiveCatalog}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="card-3d">
            <EmptyState icon={show === "done" ? <PackageCheck className="size-5" /> : <ShoppingBag3D className="size-5" />} title="No orders here yet">
              {filtered
                ? "No orders matched your active filters. Try picking another status, time range or clearing your search."
                : "When a customer sends a cart from your WhatsApp catalogue, it appears here with items, total and a one-tap confirmation."}
            </EmptyState>
          </Card>
        )}
      </div>

      {/* Settings below the orders, so staff on a phone see today's orders first. */}
      {scope.canManage && scope.clientId && (
        <Section title="Order settings" description="Order message pictures, WhatsApp payments, refill reminders and win-back messages.">
          <Card className="card-3d">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- our own public image */}
              <img src="/thenan-order-header.jpg" alt="Order message picture" width={64} height={64} className="size-16 shrink-0 rounded-control object-cover ring-1 ring-line" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Order messages with your picture</p>
                <p className="mt-0.5 text-xs text-muted">
                  {pictureStatus.map((p) => `${p.name.replace("thenan_order_", "")}: ${p.status ? p.status.toLowerCase() : "not created"}`).join(" · ")}. Used automatically once approved; the plain versions cover the wait.
                </p>
              </div>
              {pictureStatus.some((p) => !p.status) && (
                <ActionButton action={createOrderTemplates.bind(null, headerImage)} confirm="Create the picture versions of the order templates and submit them to Meta?">
                  Create with picture
                </ActionButton>
              )}
            </div>
          </Card>
          {client && (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />
              <RefillForm days={client.refillDays} templateId={client.refillTemplateId} templates={approved} />
            </div>
          )}
        </Section>
      )}
    </>
  );
}
