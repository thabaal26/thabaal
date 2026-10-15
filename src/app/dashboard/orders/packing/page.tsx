import { PackageOpen } from "@/components/icons";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, FilterChips, PageHeader, PickClientNotice } from "@/components/ui";
import { parseAddressText } from "@/lib/address";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getOrderPricing } from "@/lib/order-pricing";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { methodOf, slipPay } from "@/lib/payment-state";
import { formatPhone } from "@/lib/phone";
import { getScope } from "@/lib/session";
import { OrderAddressControl } from "../order-address-sheet";
import {
  PrintButton,
  SingleSlipExportButtons,
  type ExportableOrderRow,
  type ExportablePickItem,
} from "./print-button";
import { SortSwitch } from "./sort-switch";

export const metadata: Metadata = { title: "Packing list" };
export const dynamic = "force-dynamic";

const PAY = [
  { key: "", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "cod", label: "Cash on delivery" },
] as const;

/**
 * What to pack and where it goes: confirmed and paid orders not yet dispatched, a total pick
 * list across them, then one slip per order grouped by area. Prints cleanly on A4, or exports
 * as PDF, Image (PNG) for WhatsApp, or Excel (.xls / .csv).
 * ?pay=paid|unpaid narrows it (e.g. pack paid orders first), ?sort=old lists oldest first.
 */
export default async function PackingPage({ searchParams }: PageProps<"/dashboard/orders/packing">) {
  const sp = await searchParams;
  const pay = sp.pay === "paid" || sp.pay === "unpaid" || sp.pay === "cod" ? sp.pay : "";
  const sort = sp.sort === "old" ? "old" : "new";
  const scope = await getScope();
  const back = { href: "/dashboard/orders", label: "Orders" };
  if (!scope.clientId) return <><PageHeader title="Packing list" back={back} /><PickClientNotice what="packing list" /></>;

  const all = await db.order.findMany({
    where: { clientId: scope.clientId, status: { in: ["CONFIRMED", "PAID"] } },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, location: true, locationRaw: true },
      },
    },
    orderBy: { createdAt: sort === "old" ? "asc" : "desc" },
  });
  const canEdit = scope.canOperate && (scope.canManage || !!scope.clientId);

  // Paid by status, or a payment recorded on the order (UPI on WhatsApp, Mark paid).
  const isPaid = (o: (typeof all)[number]) => o.status === "PAID" || o.paidAt != null;
  const paidCount = all.filter(isPaid).length;
  const isCod = (o: (typeof all)[number]) => !isPaid(o) && methodOf(o) === "cod";
  const count = { "": all.length, paid: paidCount, unpaid: all.length - paidCount, cod: all.filter(isCod).length };
  const orders = pay === "paid" ? all.filter(isPaid) : pay === "unpaid" ? all.filter((o) => !isPaid(o)) : pay === "cod" ? all.filter(isCod) : all;
  const shownTotal = (o: (typeof all)[number]) => getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true }).total;
  const toCollect = orders.reduce((sum, o) => sum + slipPay(o, shownTotal(o)).collect, 0);
  const qs = (patch: { pay?: string; sort?: string }) => {
    const q = new URLSearchParams(Object.entries({ pay, sort: sort === "old" ? "old" : "", ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/orders/packing${q.size ? `?${q}` : ""}`;
  };
  const which = pay === "paid" ? "paid" : pay === "unpaid" ? "unpaid" : pay === "cod" ? "cash on delivery" : "confirmed or paid";

  // Total of each item across all orders, for picking from stock in one go.
  const pick = new Map<string, number>();
  for (const o of orders) for (const i of o.items as OrderItem[]) pick.set(i.name ?? i.id, (pick.get(i.name ?? i.id) ?? 0) + i.quantity);
  const picks = [...pick].sort((a, b) => a[0].localeCompare(b[0]));

  const resolveArea = (o: (typeof orders)[number]) => {
    const explicit = o.customer.location?.trim();
    if (explicit) return explicit;
    const rawAddr = o.note?.trim() || o.customer.locationRaw?.trim() || "";
    if (rawAddr) {
      const parsed = parseAddressText(rawAddr);
      if (parsed.area) return parsed.area;
    }
    return "Area not noted";
  };

  const byArea = new Map<string, typeof orders>();
  for (const o of orders) {
    const area = resolveArea(o);
    byArea.set(area, [...(byArea.get(area) ?? []), o]);
  }
  const areas = [...byArea].sort((a, b) => (a[0] === "Area not noted" ? 1 : b[0] === "Area not noted" ? -1 : a[0].localeCompare(b[0])));

  const exportPicks: ExportablePickItem[] = picks.map(([name, quantity]) => ({
    name,
    quantity,
  }));

  const toExportRow = (o: (typeof orders)[number]): ExportableOrderRow => {
    const items = (o.items as OrderItem[]).map((i) => ({
      name: i.name ?? i.id,
      quantity: i.quantity,
      price: i.price,
    }));
    const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true });
    const fullAddress =
      o.note?.trim() || o.customer.locationRaw?.trim() || o.customer.location?.trim() || "";
    return {
      id: o.id,
      orderRef: orderRef(o),
      createdAt: fmtDate(o.createdAt, "EEE d MMM, h:mm a"),
      status: o.status,
      isPaid: isPaid(o),
      payLabel: slipPay(o, pricing.total).label,
      collect: slipPay(o, pricing.total).collect,
      customerName: o.customer.name,
      customerPhone: formatPhone(o.customer.phone),
      area: resolveArea(o),
      address: fullAddress,
      items,
      total: pricing.total,
      currency: o.currency,
      note: [o.note, o.internalNote].filter(Boolean).join(" · "),
    };
  };

  const exportOrders: ExportableOrderRow[] = orders.map(toExportRow);

  return (
    <>
      <PageHeader
        title="Packing list"
        back={back}
        meta={
          <>
            {fmtNumber(orders.length)} {which} order{orders.length === 1 ? "" : "s"} waiting to be dispatched, grouped by area
            {toCollect > 0 && <> · <b className="tabular font-semibold text-ink">{money(toCollect)}</b> to collect</>} · {fmtDate(new Date(), "EEE d MMM, h:mm a")}
          </>
        }
        actions={
          orders.length ? (
            <PrintButton
              orders={exportOrders}
              picks={exportPicks}
              title="Packing & Delivery List"
              filenamePrefix="packing-list"
            />
          ) : undefined
        }
        tabs={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <FilterChips label="Payment" items={PAY.map((t) => ({ href: qs({ pay: t.key }), label: t.label, count: fmtNumber(count[t.key]), active: pay === t.key }))} />
            <SortSwitch newHref={qs({ sort: "" })} oldHref={qs({ sort: "old" })} value={sort} />
          </div>
        }
      />
      {orders.length ? (
        <div className="space-y-6 print:space-y-3">
          <Card className="card-3d print:break-inside-avoid">
            <CardHeader tone="brand" icon={<PackageOpen />} title="Pick list" description="Everything to take from stock for these orders." />
            <ul className="grid gap-x-8 px-4 py-2 text-sm sm:grid-cols-2 sm:px-5 lg:grid-cols-3 print:grid-cols-3">
              {picks.map(([name, qty]) => (
                <li key={name} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                  <span className="min-w-0 font-medium text-ink">{name}</span>
                  <span className="tabular shrink-0 whitespace-nowrap rounded-control bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-deep ring-1 ring-inset ring-brand/20">
                    × {fmtNumber(qty)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {areas.map(([area, list]) => (
            <section key={area} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink">{area}</h2>
                <Badge tone="brand">{list.length} order{list.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
                {list.map((o) => {
                  const exportRow = toExportRow(o);
                  const pricing = getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true });
                  return (
                    <Card key={o.id} className="card-3d relative flex flex-col gap-2.5 overflow-hidden p-4 text-sm print:break-inside-avoid">
                      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand print:hidden" />
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{o.customer.name}</p>
                          <p className="tabular text-xs text-muted">{formatPhone(o.customer.phone)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                          <div className="flex items-center gap-1.5">
                            <SingleSlipExportButtons order={exportRow} />
                            <p className="rounded bg-sunken px-1.5 py-0.5 font-mono font-semibold text-ink ring-1 ring-line">{orderRef(o)}</p>
                          </div>
                          {isPaid(o) ? (
                            <Badge tone="green" dot>Paid</Badge>
                          ) : isCod(o) ? (
                            <Badge tone="violet" dot>COD · collect {money(slipPay(o, shownTotal(o)).collect, o.currency)}</Badge>
                          ) : (
                            <Badge tone="amber" dot>Not paid · {money(slipPay(o, shownTotal(o)).collect, o.currency)}</Badge>
                          )}
                        </div>
                      </div>

                      <OrderAddressControl
                        orderId={o.id}
                        orderRefText={orderRef(o)}
                        customerId={o.customer.id}
                        customerName={o.customer.name}
                        currentOrderNote={o.note}
                        customerLocation={o.customer.location}
                        customerLocationRaw={o.customer.locationRaw}
                        canEdit={canEdit}
                        compact
                      />

                      <ul className="space-y-1 rounded-control bg-sunken/70 p-2.5">
                        {(o.items as OrderItem[]).map((i, k) => (
                          <li key={k} className="flex gap-2">
                            <span className="inline-block size-3.5 shrink-0 translate-y-0.5 rounded-sm border border-line-strong bg-white" aria-hidden />
                            <span className="flex-1 text-ink">
                              <b className="tabular font-semibold">{i.quantity} ×</b> {i.name ?? i.id}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="tabular mt-auto text-xs text-muted">{fmtDate(o.createdAt, "EEE d MMM, h:mm a")}</p>
                      <div className="space-y-0.5 border-t border-line pt-2 text-xs">
                        {pricing.subtotal > 0 && (
                          <p className="flex justify-between text-muted">
                            <span>Items ({money(pricing.subtotal, o.currency)}) + Shipping</span>
                            <span className="tabular">+ {money(pricing.shipping, o.currency)}</span>
                          </p>
                        )}
                        <p className="flex justify-between text-sm font-semibold text-ink">
                          <span>Final Total</span>
                          <span className="tabular">{money(pricing.total, o.currency)}</span>
                        </p>
                      </div>
                      {o.internalNote && <p className="rounded bg-subtle px-2 py-1 text-xs text-muted">{o.internalNote}</p>}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="card-3d">
          <EmptyState icon={<PackageOpen className="size-5" />} title={pay ? `No ${pay} orders to pack` : "Nothing to pack"}>
            {pay ? "Try All to see every confirmed and paid order." : "Confirmed and paid orders appear here until they're dispatched."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
