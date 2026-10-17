import Link from "@/components/intent-link";
import type { Metadata } from "next";
import { PickClientNotice } from "@/components/ui";
import { parseAddressText } from "@/lib/address";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
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
import { PortalPage, Seg, T } from "../../portal-ui";
import { OrdersTabs } from "../orders-tabs";

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
  if (!scope.clientId)
    return (
      <PortalPage title="Orders" sub="Track, pack, dispatch and deliver every order.">
        <OrdersTabs active="pack" />
        <PickClientNotice what="packing list" />
      </PortalPage>
    );

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
  const shownTotal = (o: (typeof all)[number]) => getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) }).total;
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
    const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) });
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
      discount: pricing.discount,
      currency: o.currency,
      note: [o.note, o.internalNote].filter(Boolean).join(" · "),
    };
  };

  const exportOrders: ExportableOrderRow[] = orders.map(toExportRow);

  return (
    <PortalPage title="Orders" titleTa="ஆர்டர்கள்" sub="Track, pack, dispatch and deliver every order." subTa="ஒவ்வொரு ஆர்டரையும் கண்காணித்து, பேக் செய்து, அனுப்பி, டெலிவரி செய்யுங்கள்.">
      <OrdersTabs active="pack" />
      <div className="grid split">
        <div>
          <div className="chips" style={{ marginBottom: 14, alignItems: "center" }}>
            {PAY.map((t) => (
              <Link key={t.key} className="chip" href={qs({ pay: t.key })} aria-pressed={pay === t.key} scroll={false}>
                <T>{t.label}</T> <small>{fmtNumber(count[t.key])}</small>
              </Link>
            ))}
            <span style={{ marginLeft: "auto" }}>
              <Seg
                label="Order"
                value={sort}
                options={[
                  { id: "old", label: "Oldest first", href: qs({ sort: "old" }) },
                  { id: "new", label: "Newest first", href: qs({ sort: "" }) },
                ]}
              />
            </span>
          </div>
          <p className="muted small" style={{ margin: "-6px 0 14px" }}>
            <T ta={`அனுப்பக் காத்திருக்கும் ${fmtNumber(orders.length)} ஆர்டர்கள், பகுதி வாரியாக${toCollect > 0 ? ` · ${money(toCollect)} வசூலிக்க வேண்டும்` : ""}`}>
              {fmtNumber(orders.length)} {which} order{orders.length === 1 ? "" : "s"} waiting to be dispatched, grouped by area
              {toCollect > 0 && <> · <b>{money(toCollect)}</b> to collect</>}
            </T>
          </p>

          {orders.length ? (
            <div className="stack">
              {areas.map(([area, list]) => (
                <div key={area} className="card">
                  <div className="hd" style={{ marginBottom: 8 }}>
                    <h2 style={{ fontSize: 17 }} data-data>{area}</h2>
                    <span className="muted small">
                      <T ta={`${list.length} ஆர்டர்கள்`}>{`${list.length} order${list.length === 1 ? "" : "s"}`}</T>
                    </span>
                  </div>
                  <div className="list">
                    {list.map((o) => {
                      const due = slipPay(o, shownTotal(o)).collect;
                      return (
                        <div key={o.id} className="row" style={{ alignItems: "flex-start" }}>
                          <div className="grow">
                            <div className="t">
                              {orderRef(o)} · {o.customer.name}
                            </div>
                            <div className="muted small">{(o.items as OrderItem[]).map((i) => `${i.quantity} × ${i.name ?? i.id}`).join(", ")}</div>
                            <div className="muted small">
                              {formatPhone(o.customer.phone)} · {money(shownTotal(o), o.currency)} · {fmtDate(o.createdAt, "d MMM, h:mm a")}
                            </div>
                            {o.internalNote && <div className="muted small"><T ta="குறிப்பு:">Note:</T> {o.internalNote}</div>}
                            <div style={{ marginTop: 6 }}>
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
                            </div>
                          </div>
                          {isPaid(o) ? (
                            <span className="pill ok"><T>Paid</T></span>
                          ) : isCod(o) ? (
                            <span className="pill info"><T>Cash on delivery</T> · {money(due, o.currency)}</span>
                          ) : (
                            <span className="pill warn"><T>Not paid</T> · {money(due, o.currency)}</span>
                          )}
                          <SingleSlipExportButtons order={toExportRow(o)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <section className="card">
              <h2>{pay ? <T ta="இந்தப் பிரிவில் பேக் செய்ய ஆர்டர் இல்லை">{`No ${which} orders to pack`}</T> : <T>Nothing to pack</T>}</h2>
              <p className="muted" style={{ marginTop: 6 }}>
                <T>{pay ? "Try All to see every confirmed and paid order." : "Confirmed and paid orders appear here until they're dispatched."}</T>
              </p>
            </section>
          )}
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="hd">
            <div>
              <h2><T ta="இருப்பிலிருந்து எடுக்க">Pull from stock</T></h2>
              <p><T>One total for all waiting orders.</T></p>
            </div>
          </div>
          <div className="list">
            {picks.map(([name, qty]) => (
              <div key={name} className="row">
                <div className="grow t">{name}</div>
                <b>{fmtNumber(qty)}</b>
              </div>
            ))}
            {picks.length === 0 && <p className="muted small"><T>Nothing waiting.</T></p>}
          </div>
          {orders.length > 0 && (
            <div className="tools" style={{ marginTop: 14 }}>
              <PrintButton orders={exportOrders} picks={exportPicks} title="Packing & Delivery List" filenamePrefix="packing-list" />
            </div>
          )}
        </div>
      </div>
    </PortalPage>
  );
}
