import { Banknote, CreditCard, Hourglass, ReceiptText, ShoppingCart, Undo2, Wallet } from "@/components/icons";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Rupee3D } from "@/components/icons-3d";
import { Card, CardHeader, DistributionBar, PageHeader, PickClientNotice, Stat } from "@/components/ui";
import { ColumnChart } from "@/components/viz";
import { revenueReport, type CashItem } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { keepFilters, readFilters, resolvePeriod, type FilterSection } from "@/lib/filters";
import { filterOptions, scopedCustomerIds } from "@/lib/filter-scope";
import { requestPayment } from "../actions/orders";

export const metadata: Metadata = { title: "Revenue & cash" };
export const dynamic = "force-dynamic";

const REVENUE_FILTERS: FilterSection[] = ["period", "products", "area"];

// Paid by UPI = emerald, cash / COD = violet, other ways = blue, not received yet = neutral.
const UPI = "emerald";
const CASH = "violet";
const OTHER = "blue";
const PENDING = "neutral";
const GROUP_COLOR = { upi: UPI, cash: CASH, other: OTHER, pending: PENDING } as const;

function CashList({ title, hint, items, icon, tone, action }: { title: string; hint: string; items: CashItem[]; icon: ReactNode; tone: "amber" | "info" | "violet" | "rose"; action?: (o: CashItem) => ReactNode }) {
  const sum = items.reduce((n, o) => n + o.total, 0);
  return (
    <Card className="card-3d h-full">
      <CardHeader tone={tone} icon={icon} title={`${title} · ${formatValue(sum, "inr")}`} description={hint} />
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.slice(0, 12).map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/customers/${o.customerId}`} className="block truncate text-sm font-medium text-ink hover:underline">
                  {o.name}
                </Link>
                <span className="tabular block text-2xs text-muted">
                  {o.ref} · {fmtDate(o.at, "d MMM")} · {o.status.toLowerCase()}
                </span>
              </div>
              <span className="tabular text-sm font-semibold text-ink">{formatValue(o.total, "inr")}</span>
              {action?.(o)}
            </li>
          ))}
          {items.length > 12 && <li className="px-4 py-2 text-2xs text-muted sm:px-5">+{items.length - 12} more on the Orders page</li>}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-muted sm:px-5">Nothing outstanding.</p>
      )}
    </Card>
  );
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  // Shared filters: period (default 30 days), catalogue products, and delivery area.
  const filters = keepFilters(readFilters(sp, "30d"), REVENUE_FILTERS);
  const period = resolvePeriod(filters);
  const filterOpts = scope.clientId ? await filterOptions(scope.clientId) : null;
  const header = (
    <PageHeader
      title="Revenue & cash"
      description="Money in, money still to collect, and what WhatsApp cost to get it."
      tabs={
        filterOpts ? (
          <div className="flex flex-col gap-2">
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

  const customers = await scopedCustomerIds(scope.clientId, { ...filters, products: [] });
  const r = await revenueReport(scope.clientId, { start: period.start, end: period.end, customers, products: filters.products });
  const weekly = r.days.length < period.days;
  const toCollect = [...r.awaitingPayment, ...r.codToCollect, ...r.owed, ...r.toVerify].reduce((n, o) => n + o.total, 0);
  const roi = r.spend > 0 ? r.paid / r.spend : null;

  return (
    <>
      {header}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Received"
          value={formatValue(r.received, "inr")}
          sub={`of ${formatValue(r.paid, "inr")} sold · ${fmtNumber(r.paidOrders)} orders · ${r.upiShare}% UPI${r.refunded ? ` · ${formatValue(r.refunded, "inr")} refunded` : ""}`}
          icon={<Banknote />}
          tone="brand"
        />
        <Stat
          label="To collect"
          value={formatValue(toCollect, "inr")}
          sub={`${fmtNumber(r.awaitingPayment.length)} pay links · ${fmtNumber(r.codToCollect.length)} COD${r.toVerify.length ? ` · ${fmtNumber(r.toVerify.length)} to check` : ""}`}
          icon={<Wallet />}
          tone="amber"
          href="/dashboard/orders?show=unpaid"
        />
        <Stat label="WhatsApp cost" value={formatValue(r.spend, "inr")} sub="charged messages, incl. GST (estimate)" icon={<CreditCard />} tone="violet" />
        <Stat label="Return" value={roi === null ? "—" : `${roi.toFixed(roi >= 10 ? 0 : 1)}×`} sub={roi === null ? "no charged messages yet" : "paid sales per ₹1 of messaging"} icon={<Rupee3D />} tone="info" />
      </div>

      <Card className="card-3d">
        <CardHeader tone="brand" icon={<Rupee3D />} title={weekly ? "Sales per week" : "Sales per day"} description={`${period.label} · by how they paid, on the day the payment came in`} />
        <div className="p-4 sm:p-5">
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
              segments={r.methods.filter((m) => m.amount > 0).map((m) => ({ key: m.key, label: `${m.label} · ${formatValue(m.amount, "inr")}`, value: Math.round(m.amount), color: GROUP_COLOR[m.key] }))}
            />
          )}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-3">
        {r.toVerify.length > 0 && (
          <CashList title="Check payment" hint="Customer says they paid. Check your UPI app or bank, then confirm on the order" items={r.toVerify} icon={<Hourglass className="size-5" />} tone="amber" />
        )}
        {r.refundsDue.length > 0 && (
          <CashList title="Refund due" hint="Cancelled after paying. Send the money back, then record the refund on the order" items={r.refundsDue} icon={<Undo2 className="size-5" />} tone="rose" />
        )}
        <CashList
          title="Pay link sent"
          hint="WhatsApp “Review and pay” sent, not paid yet"
          items={r.awaitingPayment}
          icon={<CreditCard className="size-5" />}
          tone="amber"
        />
        <CashList title="Cash on delivery" hint="Confirmed as cash on delivery, cash not recorded yet" items={r.codToCollect} icon={<Wallet className="size-5" />} tone="violet" />
        {r.owed.length > 0 && (
          <CashList title="Confirmed, not paid" hint="Confirmed or delivered with no payment and no COD: ask for payment or record it" items={r.owed} icon={<ReceiptText className="size-5" />} tone="rose" />
        )}
        <CashList
          title="Carts without a pay link"
          hint="New carts nobody has asked to pay yet"
          items={r.unpaidCarts}
          icon={<ShoppingCart className="size-5" />}
          tone="info"
          action={
            scope.canOperate
              ? (o) => (
                  <ActionButton action={requestPayment.bind(null, o.id)} confirm={`Send ${o.name} the WhatsApp “Review and pay” message for ${o.ref}?`}>
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
