import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  IndianRupee,
  ShoppingCart,
  Undo2,
  Wallet,
} from "@/components/icons";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Avatar, buttonClass, Card, CardHeader, DistributionBar, PageHeader, PickClientNotice, Stat } from "@/components/ui";
import { ColumnChart } from "@/components/viz";
import { revenueReport, type CashItem } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { keepFilters, readFilters, resolvePeriod, type FilterSection } from "@/lib/filters";
import { filterOptions, scopedCustomerIds } from "@/lib/filter-scope";
import { requestPayment } from "../actions/orders";
import { SpendCard } from "../spend-card";

export const metadata: Metadata = { title: "Revenue & cash" };
export const dynamic = "force-dynamic";

const REVENUE_FILTERS: FilterSection[] = ["period", "products", "area"];

// Paid by UPI = emerald, cash / COD = violet, other ways = blue, not received yet = neutral.
const UPI = "emerald";
const CASH = "violet";
const OTHER = "blue";
const PENDING = "neutral";
const GROUP_COLOR = { upi: UPI, cash: CASH, other: OTHER, pending: PENDING } as const;

function CashList({
  title,
  hint,
  items,
  icon,
  action,
}: {
  title: string;
  hint: string;
  items: CashItem[];
  icon: ReactNode;
  action?: (o: CashItem) => ReactNode;
}) {
  const sum = items.reduce((n, o) => n + o.total, 0);
  return (
    <Card className="card-3d flex h-full flex-col justify-between overflow-hidden">
      <div>
        <CardHeader
          icon={icon}
          title={
            <div className="flex flex-wrap items-center gap-2">
              <span>{title}</span>
              <span className="tabular rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-ink">
                {formatValue(sum, "inr")}
              </span>
            </div>
          }
          description={hint}
        />
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.slice(0, 12).map((o) => (
              <li
                key={o.id}
                className="group relative flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-subtle/70 sm:gap-3 sm:px-5 sm:py-3"
              >
                <Avatar name={o.name} className="size-8 text-2xs sm:size-8.5 sm:text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/dashboard/customers/${o.customerId}`}
                      className="truncate text-[13.5px] font-semibold text-ink hover:underline sm:text-sm"
                    >
                      {o.name}
                    </Link>
                    <span className="tabular rounded-[5px] bg-subtle px-1.5 py-0.5 text-3xs font-semibold text-muted">
                      {o.ref}
                    </span>
                  </div>
                  <span className="tabular block text-[11px] text-muted sm:text-xs">
                    {fmtDate(o.at, "d MMM")} · <span className="capitalize">{o.status.toLowerCase()}</span>
                  </span>
                </div>
                <span className="tabular font-display text-[13.5px] font-semibold text-ink sm:text-[15px]">
                  {formatValue(o.total, "inr")}
                </span>
                {action?.(o)}
              </li>
            ))}
            {items.length > 12 && (
              <li className="px-3.5 py-2 text-2xs text-muted sm:px-5">
                +{items.length - 12} more on the Orders page
              </li>
            )}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center sm:py-10">
            <span
              aria-hidden
              className="mb-2 grid size-9 place-items-center rounded-xl bg-success-bg text-success ring-1 ring-inset ring-success-border sm:size-10"
            >
              <CheckCircle2 className="size-5" />
            </span>
            <p className="text-xs font-semibold text-ink sm:text-sm">All clear</p>
            <p className="mt-0.5 text-2xs text-muted sm:text-xs">Nothing outstanding in this group</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = await getScope();
  const costs = sp.tab === "costs";
  const moneyTabs = (
    <nav aria-label="Money views" className="inline-flex rounded-control border-[1.5px] border-line bg-panel p-[3px]">
      {[
        { key: "cash", href: "/dashboard/revenue", label: "Cash in", icon: Banknote, on: !costs },
        { key: "costs", href: "/dashboard/revenue?tab=costs", label: "WhatsApp costs", icon: CreditCard, on: costs },
      ].map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-semibold transition-all duration-200 ease-out active:scale-[0.96] sm:text-[13.5px]",
              t.on
                ? "bg-ink text-canvas shadow-xs -translate-y-px"
                : "text-muted hover:text-ink hover:bg-subtle/60",
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
  if (costs) {
    return (
      <>
        <PageHeader
          title="Money"
          description="What WhatsApp costs you this month and last, live from Meta where it's connected."
          tabs={moneyTabs}
        />
        {scope.clientId ? <SpendCard clientId={scope.clientId} canManage={scope.canManage} /> : <PickClientNotice what="WhatsApp costs" />}
      </>
    );
  }
  // Shared filters: period (default 30 days), catalogue products, and delivery area.
  const filters = keepFilters(readFilters(sp, "30d"), REVENUE_FILTERS);
  const period = resolvePeriod(filters);
  // The filter choices and the customers the filters cover are read together.
  const [filterOpts, customers] = await Promise.all([
    scope.clientId ? filterOptions(scope.clientId) : null,
    scope.clientId ? scopedCustomerIds(scope.clientId, { ...filters, products: [] }) : null,
  ]);
  const header = (
    <PageHeader
      title="Money"
      description="What came in, what is still to collect, and what WhatsApp costs."
      tabs={
        filterOpts ? (
          <div className="flex flex-col gap-2">
            <div>{moneyTabs}</div>
            <FilterBar
              value={filters}
              options={filterOpts}
              basePath="/dashboard/revenue"
              defaultRange="30d"
              sections={REVENUE_FILTERS}
              note="Filter revenue, payment collections, and outstanding balances by date period, product, or delivery area."
              periodLabel={period.label}
            />
            <ActiveFilters value={filters} options={filterOpts} basePath="/dashboard/revenue" defaultRange="30d" />
          </div>
        ) : undefined
      }
    />
  );
  if (!scope.clientId)
    return (
      <>
        {header}
        <PickClientNotice what="revenue report" />
      </>
    );

  const r = await revenueReport(scope.clientId, { start: period.start, end: period.end, customers, products: filters.products });
  const weekly = r.days.length < period.days;
  const toCollect = [...r.awaitingPayment, ...r.codToCollect, ...r.owed, ...r.toVerify].reduce((n, o) => n + o.total, 0);
  const roi = r.spend > 0 ? r.paid / r.spend : null;

  return (
    <>
      {header}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Received"
          value={formatValue(r.received, "inr")}
          sub={`of ${formatValue(r.paid, "inr")} sold · ${fmtNumber(r.paidOrders)} orders · ${r.upiShare}% UPI${r.refunded ? ` · ${formatValue(r.refunded, "inr")} refunded` : ""}`}
          icon={<Banknote className="size-5 stroke-[2]" />}
          tone="brand"
          meter={r.paid > 0 ? Math.min(100, Math.round((r.received / r.paid) * 100)) : 100}
        />
        <Stat
          label="To collect"
          value={formatValue(toCollect, "inr")}
          sub={`${fmtNumber(r.awaitingPayment.length)} pay links · ${fmtNumber(r.codToCollect.length)} COD${r.toVerify.length ? ` · ${fmtNumber(r.toVerify.length)} to check` : ""}`}
          icon={<Wallet className="size-5 stroke-[2]" />}
          tone="amber"
          href="/dashboard/orders?show=unpaid"
        />
        <Stat
          label="WhatsApp cost"
          value={formatValue(r.spend, "inr")}
          sub="charged messages, incl. GST (estimate)"
          icon={<CreditCard className="size-5 stroke-[2]" />}
          tone="violet"
          href="/dashboard/revenue?tab=costs"
        />
        <Stat
          label="Return"
          value={roi === null ? "—" : `${roi.toFixed(roi >= 10 ? 0 : 1)}×`}
          sub={roi === null ? "no charged messages yet" : "paid sales per ₹1 of messaging"}
          icon={<IndianRupee className="size-5 stroke-[2]" />}
          tone="info"
        />
      </div>

      <Card className="card-3d">
        <CardHeader
          icon={<BarChart3 className="size-5" />}
          title={weekly ? "Sales per week" : "Sales per day"}
          description={`${period.label} · by how they paid, on the day the payment came in`}
        />
        <div className="p-3.5 sm:p-5">
          <ColumnChart
            format="inr"
            label={`Sales by payment method, ${period.phrase}`}
            minWidth={r.days.length > 31 ? r.days.length * 30 : 560}
            legend={r.methods.map((m) => ({ label: m.label, color: GROUP_COLOR[m.key] }))}
            columns={r.days.map((d, i) => ({
              key: d.key,
              label: d.label,
              sub: r.days.length > 14 ? (i === 0 || d.label === "1" || weekly ? d.sub : undefined) : d.sub,
              highlight: i === r.days.length - 1,
              parts: [
                { key: "upi", label: "UPI", value: d.upi, color: UPI },
                { key: "cash", label: "Cash / COD", value: d.cash, color: CASH },
                { key: "other", label: "Bank, card, other", value: d.other, color: OTHER },
                { key: "pending", label: "Not received yet", value: d.pending, color: PENDING },
              ],
            }))}
          />
          {r.paid > 0 && (
            <DistributionBar
              className="mt-4"
              segments={r.methods
                .filter((m) => m.amount > 0)
                .map((m) => ({
                  key: m.key,
                  label: m.label,
                  value: Math.round(m.amount),
                  color: GROUP_COLOR[m.key],
                }))}
            />
          )}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {r.toVerify.length > 0 && (
          <CashList
            title="Check payment"
            hint="Customer says they paid. Check your UPI app or bank, then confirm on the order"
            items={r.toVerify}
            icon={<Clock className="size-5" />}
          />
        )}
        {r.refundsDue.length > 0 && (
          <CashList
            title="Refund due"
            hint="Cancelled after paying. Send the money back, then record the refund on the order"
            items={r.refundsDue}
            icon={<Undo2 className="size-5" />}
          />
        )}
        <CashList
          title="Pay link sent"
          hint="WhatsApp “Review and pay” sent, not paid yet"
          items={r.awaitingPayment}
          icon={<CreditCard className="size-5" />}
        />
        <CashList
          title="Cash on delivery"
          hint="Confirmed as cash on delivery, cash not recorded yet"
          items={r.codToCollect}
          icon={<Wallet className="size-5" />}
        />
        {r.owed.length > 0 && (
          <CashList
            title="Confirmed, not paid"
            hint="Confirmed or delivered with no payment and no COD: ask for payment or record it"
            items={r.owed}
            icon={<AlertTriangle className="size-5" />}
          />
        )}
        <CashList
          title="Carts without a pay link"
          hint="New carts nobody has asked to pay yet"
          items={r.unpaidCarts}
          icon={<ShoppingCart className="size-5" />}
          action={
            scope.canOperate
              ? (o) => (
                  <ActionButton
                    action={requestPayment.bind(null, o.id)}
                    confirm={`Send ${o.name} the WhatsApp “Review and pay” message for ${o.ref}?`}
                    className={cn(buttonClass("secondary", "sm"), "shrink-0")}
                  >
                    Pay link
                  </ActionButton>
                )
              : undefined
          }
        />
      </div>
    </>
  );
}
