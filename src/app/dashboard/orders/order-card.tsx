import { CheckCircle2, Clock, MapPin, Truck } from "lucide-react";
import Link from "next/link";
import { Avatar, Badge, Card, OrderStatusBadge, OrderStepper } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getOrderPricing } from "@/lib/order-pricing";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { OrderActions } from "./order-actions";
import { OrderAddressControl } from "./order-address-sheet";
import type { CatalogProductOption } from "./order-items-editor";

export type OrderCardData = {
  id: string;
  number: number;
  status: "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  total: number;
  currency: string;
  note: string | null;
  internalNote: string | null;
  createdAt: Date;
  paidAt: Date | null;
  paymentTxnId: string | null;
  paymentRequestedAt: Date | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
    locationRaw?: string | null;
    client: { name: string };
  };
  client: { paymentConfig: string | null };
};

const STATUS_ACCENT: Record<OrderCardData["status"], string> = {
  NEW: "#b7791f",
  CONFIRMED: "#1d64a8",
  PAID: "#167d63",
  DISPATCHED: "#6941c6",
  DELIVERED: "#11704c",
  CANCELLED: "#8b95a5",
};

/** One order: who, what, the total, where it stands, delivery address, and the buttons that move it along. */
export function OrderCard({
  order: o,
  items,
  showClient,
  canEdit,
  catalogProducts = [],
  isLiveCatalog = false,
}: {
  order: OrderCardData;
  items: OrderItem[];
  showClient: boolean;
  canEdit: boolean;
  catalogProducts?: CatalogProductOption[];
  isLiveCatalog?: boolean;
}) {
  const isPaid = o.status === "PAID" || o.paidAt !== null;
  const accent = STATUS_ACCENT[o.status] ?? "#167d63";
  const refText = orderRef(o);
  const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true });

  return (
    <Card className="card-3d relative flex h-full flex-col gap-3.5 overflow-hidden p-4 sm:p-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={o.customer.name} className="size-10 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/dashboard/customers/${o.customer.id}`} className="truncate font-semibold text-ink hover:underline">
                {o.customer.name}
              </Link>
              <span className="rounded-control bg-sunken px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink-2 ring-1 ring-inset ring-line">
                {refText}
              </span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span className="tabular">{formatPhone(o.customer.phone)}</span>
              {o.customer.location && (
                <span className="inline-flex items-center gap-0.5 text-ink-2">
                  · <MapPin aria-hidden className="size-3 text-muted" /> {o.customer.location}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OrderStatusBadge status={o.status} />
          {showClient && <Badge>{o.customer.client.name}</Badge>}
        </div>
      </div>

      <OrderStepper status={o.status} isPaid={isPaid} />

      <div className="rounded-control border border-line/80 bg-sunken/70 px-3.5 py-1 text-sm shadow-[inset_0_1px_2px_rgb(16_24_40/0.04)]">
        <ul className="divide-y divide-line/80">
          {items.map((i, k) => (
            <li key={k} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 text-ink">
                <span className="tabular mr-1.5 inline-block rounded bg-panel px-1.5 py-0.5 text-xs font-semibold text-ink-2 ring-1 ring-line">
                  {i.quantity}×
                </span>
                {i.name ?? i.id}
              </span>
              <span className="tabular shrink-0 font-medium text-ink-2">
                {i.price > 0 ? money(i.price * i.quantity, i.currency) : <span className="text-xs text-warning">Set price</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line py-2.5">
          {pricing.subtotal > 0 && (
            <>
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>Items subtotal</span>
                <span className="tabular font-medium text-ink-2">{money(pricing.subtotal, o.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Truck aria-hidden className="size-3 text-brand-deep" /> Shipping charge
                </span>
                <span className="tabular font-medium text-ink-2">+ {money(pricing.shipping, o.currency)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-3 pt-1 font-semibold text-ink">
            <span className="text-xs uppercase tracking-wider text-muted">Final Total</span>
            <span className="tabular text-base">{money(pricing.total, o.currency)}</span>
          </div>
        </div>
      </div>

      {/* Delivery Address & Area with Add / Update + WhatsApp Chat Auto-Detect */}
      <OrderAddressControl
        orderId={o.id}
        orderRefText={refText}
        customerId={o.customer.id}
        customerName={o.customer.name}
        currentOrderNote={o.note}
        customerLocation={o.customer.location}
        customerLocationRaw={o.customer.locationRaw}
        canEdit={canEdit}
      />

      <div className="space-y-1.5 text-xs text-muted">
        <p className="tabular flex items-center justify-between gap-2">
          <span>Placed {fmtDate(o.createdAt, "EEE d MMM, h:mm a")}</span>
          {isPaid ? (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <CheckCircle2 aria-hidden className="size-3.5" /> Paid{o.paymentTxnId ? ` · UPI ${o.paymentTxnId}` : ""}
            </span>
          ) : o.paymentRequestedAt ? (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <Clock aria-hidden className="size-3.5" /> UPI requested {fmtDate(o.paymentRequestedAt, "d MMM, h:mm a")}
            </span>
          ) : null}
        </p>
      </div>

      <OrderActions
        id={o.id}
        who={o.customer.name}
        status={o.status}
        isPaid={isPaid}
        note={o.internalNote}
        customerNote={o.note}
        items={items}
        total={o.total}
        canEdit={canEdit}
        payment={o.client.paymentConfig && o.total > 0 && !o.paidAt ? (o.paymentRequestedAt ? "again" : "first") : null}
        catalogProducts={catalogProducts}
        isLiveCatalog={isLiveCatalog}
      />
    </Card>
  );
}
