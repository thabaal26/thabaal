import { PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardHeader, EmptyState, PageHeader, PickClientNotice } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { getScope } from "@/lib/session";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Packing list" };
export const dynamic = "force-dynamic";

/**
 * What to pack and where it goes: confirmed and paid orders not yet dispatched, a total pick
 * list across them, then one slip per order grouped by area. Prints cleanly on A4.
 */
export default async function PackingPage() {
  const scope = await getScope();
  const back = { href: "/dashboard/orders", label: "Orders" };
  if (!scope.clientId) return <><PageHeader title="Packing list" back={back} /><PickClientNotice what="packing list" /></>;

  const orders = await db.order.findMany({
    where: { clientId: scope.clientId, status: { in: ["CONFIRMED", "PAID"] } },
    include: { customer: { select: { name: true, phone: true, location: true } } },
    orderBy: { createdAt: "asc" },
  });

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
        meta={`${fmtNumber(orders.length)} confirmed or paid order${orders.length === 1 ? "" : "s"} waiting to be dispatched, grouped by area · ${fmtDate(new Date(), "EEE d MMM, h:mm a")}`}
        actions={orders.length ? <PrintButton /> : undefined}
      />
      {orders.length ? (
        <div className="space-y-6 print:space-y-3">
          <Card className="print:break-inside-avoid">
            <CardHeader title="Pick list" description="Everything to take from stock for these orders." />
            <ul className="grid gap-x-8 px-4 py-2 text-sm sm:grid-cols-2 sm:px-5 lg:grid-cols-3 print:grid-cols-3">
              {picks.map(([name, qty]) => (
                <li key={name} className="flex justify-between gap-3 border-b border-line py-2">
                  <span className="min-w-0">{name}</span>
                  <b className="tabular">× {fmtNumber(qty)}</b>
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
                      <div className="text-right text-xs text-muted">
                        <p className="font-mono font-medium text-ink">{orderRef(o)}</p>
                        <p>{o.status === "PAID" ? "Paid" : "To collect"}</p>
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
          <EmptyState icon={<PackageOpen className="size-5" />} title="Nothing to pack">Confirmed and paid orders appear here until they&apos;re dispatched.</EmptyState>
        </Card>
      )}
    </>
  );
}
