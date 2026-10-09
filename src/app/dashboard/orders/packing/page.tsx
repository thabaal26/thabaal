import { PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, FilterChips, PageHeader, PickClientNotice } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { getScope } from "@/lib/session";
import { PrintButton } from "./print-button";
import { SortSwitch } from "./sort-switch";

export const metadata: Metadata = { title: "Packing list" };
export const dynamic = "force-dynamic";

const PAY = [
  { key: "", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
] as const;

/**
 * What to pack and where it goes: confirmed and paid orders not yet dispatched, a total pick
 * list across them, then one slip per order grouped by area. Prints cleanly on A4.
 * ?pay=paid|unpaid narrows it (e.g. pack paid orders first), ?sort=old lists oldest first.
 */
export default async function PackingPage({ searchParams }: PageProps<"/dashboard/orders/packing">) {
  const sp = await searchParams;
  const pay = sp.pay === "paid" || sp.pay === "unpaid" ? sp.pay : "";
  const sort = sp.sort === "old" ? "old" : "new";
  const scope = await getScope();
  const back = { href: "/dashboard/orders", label: "Orders" };
  if (!scope.clientId) return <><PageHeader title="Packing list" back={back} /><PickClientNotice what="packing list" /></>;

  const all = await db.order.findMany({
    where: { clientId: scope.clientId, status: { in: ["CONFIRMED", "PAID"] } },
    include: { customer: { select: { name: true, phone: true, location: true } } },
    orderBy: { createdAt: sort === "old" ? "asc" : "desc" },
  });
  // Paid by status, or a payment recorded on the order (UPI on WhatsApp, Mark paid).
  const isPaid = (o: (typeof all)[number]) => o.status === "PAID" || o.paidAt != null;
  const paidCount = all.filter(isPaid).length;
  const count = { "": all.length, paid: paidCount, unpaid: all.length - paidCount };
  const orders = pay === "paid" ? all.filter(isPaid) : pay === "unpaid" ? all.filter((o) => !isPaid(o)) : all;
  const toCollect = orders.filter((o) => !isPaid(o)).reduce((sum, o) => sum + o.total, 0);
  const qs = (patch: { pay?: string; sort?: string }) => {
    const q = new URLSearchParams(Object.entries({ pay, sort: sort === "old" ? "old" : "", ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/orders/packing${q.size ? `?${q}` : ""}`;
  };
  const which = pay === "paid" ? "paid" : pay === "unpaid" ? "unpaid" : "confirmed or paid";

  // Total of each item across all orders, for picking from stock in one go.
  const pick = new Map<string, number>();
  for (const o of orders) for (const i of o.items as OrderItem[]) pick.set(i.name ?? i.id, (pick.get(i.name ?? i.id) ?? 0) + i.quantity);
  const picks = [...pick].sort((a, b) => a[0].localeCompare(b[0]));

  const byArea = new Map<string, typeof orders>();
  for (const o of orders) {
    const area = o.customer.location?.trim() || "Area not noted";
    byArea.set(area, [...(byArea.get(area) ?? []), o]);
  }
  const areas = [...byArea].sort((a, b) => (a[0] === "Area not noted" ? 1 : b[0] === "Area not noted" ? -1 : a[0].localeCompare(b[0])));

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
        actions={orders.length ? <PrintButton /> : undefined}
        tabs={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <FilterChips label="Payment" items={PAY.map((t) => ({ href: qs({ pay: t.key }), label: t.label, count: fmtNumber(count[t.key]), active: pay === t.key }))} />
            <SortSwitch newHref={qs({ sort: "" })} oldHref={qs({ sort: "old" })} value={sort} />
          </div>
        }
      />
      {orders.length ? (
        <div className="space-y-6 print:space-y-3">
          <Card className="print:break-inside-avoid">
            <CardHeader title="Pick list" description="Everything to take from stock for these orders." />
            <ul className="grid gap-x-8 px-4 py-2 text-sm sm:grid-cols-2 sm:px-5 lg:grid-cols-3 print:grid-cols-3">
              {picks.map(([name, qty]) => (
                <li key={name} className="flex justify-between gap-3 border-b border-line py-2">
                  <span className="min-w-0">{name}</span>
                  <b className="tabular shrink-0 whitespace-nowrap">× {fmtNumber(qty)}</b>
                </li>
              ))}
            </ul>
          </Card>

          {areas.map(([area, list]) => (
            <section key={area} className="space-y-2">
              <h2 className="text-base font-semibold text-ink">{area} <span className="text-sm font-normal text-muted">· {list.length} order{list.length === 1 ? "" : "s"}</span></h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
                {list.map((o) => (
                  <Card key={o.id} className="p-4 text-sm print:break-inside-avoid">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{o.customer.name}</p>
                        <p className="tabular text-xs text-muted">{formatPhone(o.customer.phone)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                        <p className="font-mono font-medium text-ink">{orderRef(o)}</p>
                        {isPaid(o) ? <Badge tone="green" dot>Paid</Badge> : <Badge tone="amber" dot>To collect</Badge>}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {(o.items as OrderItem[]).map((i, k) => (
                        <li key={k} className="flex gap-2">
                          <span className="inline-block size-3.5 shrink-0 translate-y-0.5 rounded-sm border border-line-strong" aria-hidden />
                          <span className="flex-1">{i.quantity} × {i.name ?? i.id}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="tabular mt-1.5 text-xs text-muted">{fmtDate(o.createdAt, "EEE d MMM, h:mm a")}</p>
                    <p className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
                      <span>Total</span>
                      <span className="tabular">{money(o.total, o.currency)}</span>
                    </p>
                    {(o.note || o.internalNote) && <p className="mt-1 text-xs text-muted">{[o.note, o.internalNote].filter(Boolean).join(" · ")}</p>}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<PackageOpen className="size-5" />} title={pay ? `No ${pay} orders to pack` : "Nothing to pack"}>
            {pay ? "Try All to see every confirmed and paid order." : "Confirmed and paid orders appear here until they're dispatched."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
