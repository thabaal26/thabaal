import { Banknote, CreditCard, ShoppingCart, Wallet } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Rupee3D } from "@/components/icons-3d";
import { Card, CardHeader, PageHeader, PickClientNotice, Stat } from "@/components/ui";
import { ColumnChart } from "@/components/viz";
import { revenueReport, type CashItem } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { readFilters, resolvePeriod } from "@/lib/filters";
import { filterOptions, scopedCustomerIds } from "@/lib/filter-scope";
import { requestPayment } from "../actions/orders";

export const metadata: Metadata = { title: "Revenue & cash" };
export const dynamic = "force-dynamic";

const UPI = "#059669";
const OTHER = "#0ea5e9";

function CashList({ title, hint, items, icon, tone, action }: { title: string; hint: string; items: CashItem[]; icon: ReactNode; tone: "amber" | "info" | "violet"; action?: (o: CashItem) => ReactNode }) {
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
  // Shared filters: any period (default 30 days), products, customers, groups, area, campaign.
  const filters = readFilters(sp, "30d");
  const period = resolvePeriod(filters);
  const filterOpts = scope.clientId ? await filterOptions(scope.clientId) : null;
  const header = (
    <PageHeader
      title="Revenue & cash"
      description="Money in, money still to collect, and what WhatsApp cost to get it."
      tabs={
        filterOpts ? (
          <div className="flex flex-col gap-2">
            <FilterBar value={filters} options={filterOpts} basePath="/dashboard/revenue" defaultRange="30d" periodLabel={period.label} />
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
  const toCollect = [...r.awaitingPayment, ...r.codToCollect].reduce((n, o) => n + o.total, 0);
  const roi = r.spend > 0 ? r.paid / r.spend : null;

  return (
    <>
      {header}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <Stat label="Paid" value={formatValue(r.paid, "inr")} sub={`${fmtNumber(r.paidOrders)} orders · ${r.upiShare}% by UPI`} icon={<Banknote />} tone="brand" />
        <Stat label="To collect" value={formatValue(toCollect, "inr")} sub={`${fmtNumber(r.awaitingPayment.length)} pay links · ${fmtNumber(r.codToCollect.length)} COD`} icon={<Wallet />} tone="amber" />
        <Stat label="WhatsApp cost" value={formatValue(r.spend, "inr")} sub="charged messages, incl. GST (estimate)" icon={<CreditCard />} tone="violet" />
        <Stat label="Return" value={roi === null ? "—" : `${roi.toFixed(roi >= 10 ? 0 : 1)}×`} sub={roi === null ? "no charged messages yet" : "paid sales per ₹1 of messaging"} icon={<Rupee3D />} tone="info" />
      </div>

      <Card className="card-3d">
        <CardHeader tone="brand" icon={<Rupee3D />} title={weekly ? "Paid sales per week" : "Paid sales per day"} description={`${period.label} · by the day the payment came in`} />
        <div className="p-4 sm:p-5">
          <ColumnChart
            format="inr"
            label={`Paid sales, ${period.phrase}`}
            minWidth={r.days.length > 31 ? r.days.length * 30 : 560}
            legend={[
              { label: "Paid by UPI on WhatsApp", color: UPI },
              { label: "Confirmed or paid another way", color: OTHER },
            ]}
            columns={r.days.map((d, i) => ({
              key: d.key,
              label: d.label,
              sub: r.days.length > 14 ? (i === 0 || d.label === "1" || weekly ? d.sub : undefined) : d.sub,
              highlight: i === r.days.length - 1,
              parts: [
                { key: "upi", label: "UPI", value: d.upi, color: UPI },
                { key: "other", label: "Other", value: d.other, color: OTHER },
              ],
            }))}
          />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-3">
        <CashList
          title="Pay link sent"
          hint="WhatsApp “Review and pay” sent, not paid yet"
          items={r.awaitingPayment}
          icon={<CreditCard className="size-5" />}
          tone="amber"
        />
        <CashList title="Cash on delivery" hint="Marked COD in the order note, not yet recorded as paid" items={r.codToCollect} icon={<Wallet className="size-5" />} tone="violet" />
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
