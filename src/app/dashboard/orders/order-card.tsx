import { History, MapPin, Sparkles, Truck } from "@/components/icons";
import Link from "@/components/intent-link";
import { Avatar, Badge, Card, OrderStatusBadge, OrderStepper } from "@/components/ui";
import { analyzeCartMentality } from "@/lib/cart-mentality";
import { fmtDate } from "@/lib/format";
import { getOrderPricing } from "@/lib/order-pricing";
import { itemsText, money, orderRef, type OrderItem } from "@/lib/orders";
import { canUndoPayment, dueOf, holdBeforeDispatch, methodOf, paymentState, receivedOf } from "@/lib/payment-state";
import { formatPhone } from "@/lib/phone";
import { OrderActions } from "./order-actions";
import { OrderAddressControl } from "./order-address-sheet";
import { PaymentSummary } from "./payment-status";
import { OrderExtra } from "./order-extra";
import { readValues, type CustomField } from "@/lib/custom-fields";
import type { CatalogProductOption } from "./order-items-editor";

export type OrderCardData = {
  id: string;
  number: number;
  ref: string | null;
  status: "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  total: number;
  currency: string;
  note: string | null;
  internalNote: string | null;
  createdAt: Date;
  paidAt: Date | null;
  paymentTxnId: string | null;
  paymentRequestedAt: Date | null;
  paymentReminderAt?: Date | null;
  paymentMethod?: string | null;
  paymentSource?: string | null;
  paidAmount?: number | null;
  paymentClaimedAt?: Date | null;
  paymentClaimNote?: string | null;
  paymentFailedAt?: Date | null;
  paymentFailReason?: string | null;
  collectedBy?: string | null;
  refundedAt?: Date | null;
  refundAmount?: number | null;
  refundNote?: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
    locationRaw?: string | null;
    client: { name: string };
    orders?: {
      id: string;
      number: number;
      ref: string | null;
      total: number;
      currency: string;
      status: string;
      items: unknown;
      internalNote: string | null;
      createdAt: Date;
      paidAt: Date | null;
    }[];
  };
  client: { paymentConfig: string | null };
  /** Values of the client's custom order fields. */
  extra?: unknown;
};

const STATUS_ACCENT: Record<OrderCardData["status"], string> = {
  NEW: "#b7791f",
  CONFIRMED: "#1d64a8",
  PAID: "#167d63",
  DISPATCHED: "#6941c6",
  DELIVERED: "#11704c",
  CANCELLED: "#8b95a5",
};

/** One order: who, what, the total, where it stands, delivery address, customer cart mentality, and the buttons that move it along. */
export function OrderCard({
  order: o,
  items,
  showClient,
  canEdit,
  catalogProducts = [],
  isLiveCatalog = false,
  orderFields = [],
}: {
  /** The client's custom order fields (lib/custom-fields.ts). */
  orderFields?: CustomField[];
  order: OrderCardData;
  items: OrderItem[];
  showClient: boolean;
  canEdit: boolean;
  catalogProducts?: CatalogProductOption[];
  isLiveCatalog?: boolean;
}) {
  const isPaid = o.status === "PAID" || o.paidAt !== null;
  const payState = paymentState(o);
  const received = receivedOf(o);
  const accent = STATUS_ACCENT[o.status] ?? "#167d63";
  const refText = orderRef(o);
  const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true });
  const isSuperseded = o.status === "CANCELLED" && Boolean(o.internalNote && /superseded by/i.test(o.internalNote));

  const mentality =
    o.status !== "CANCELLED"
      ? analyzeCartMentality(
          { id: o.id, number: o.number, ref: o.ref, total: pricing.total, currency: o.currency, items, createdAt: o.createdAt },
          (o.customer.orders ?? []).map((po) => ({
            ...po,
            items: ((po.items as OrderItem[] | null) ?? []),
          })),
        )
      : null;

  return (
    <div className="relative flex h-full flex-col gap-3 rounded-[18px] border-[1.5px] border-line bg-panel p-4 sm:p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:shadow-[0_14px_30px_-22px_rgba(0,0,0,.7)] transition">

      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={o.customer.name} className="size-9 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/dashboard/customers/${o.customer.id}`} className="truncate text-sm font-semibold text-ink hover:underline sm:text-[15px]">
                {o.customer.name}
              </Link>
              <span className="rounded-control bg-sunken px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink-2 ring-1 ring-inset ring-line">
                {refText}
              </span>
              {mentality && mentality.attemptCount > 1 && (
                <Badge tone={mentality.behavior === "downsized" ? "amber" : mentality.behavior === "upsized" ? "green" : "blue"}>
                  Cart #{mentality.attemptCount}
                </Badge>
              )}
              {isSuperseded && <Badge tone="gray">Replaced</Badge>}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span className="tabular">{formatPhone(o.customer.phone)}</span>
              {o.customer.location && (
                <span className="inline-flex items-center gap-0.5 text-ink-2">
                  · <MapPin aria-hidden className="size-3 text-muted" /> {o.customer.location}
                </span>
              )}
              <span className="tabular text-muted">· {fmtDate(o.createdAt, "d MMM, h:mm a")}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OrderStatusBadge status={o.status} />
          {showClient && <Badge>{o.customer.client.name}</Badge>}
        </div>
      </div>

      <OrderStepper status={o.status} isPaid={isPaid && payState !== "part_paid"} unpaidLabel={payState === "cod_due" ? "COD" : payState === "part_paid" ? "Part paid" : "Not paid"} />

      <div className="rounded-control border border-line/80 bg-sunken/60 px-3 py-1 text-xs sm:text-sm">
        <ul className="divide-y divide-line/70">
          {items.map((i, k) => (
            <li key={k} className="flex items-baseline justify-between gap-2.5 py-1.5">
              <span className="min-w-0 truncate text-ink">
                <span className="tabular mr-1.5 inline-block rounded bg-panel px-1.5 py-0.5 text-2xs font-semibold text-ink-2 ring-1 ring-line">
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wider text-ink-2">Total</span>
            {pricing.subtotal > 0 && pricing.shipping > 0 && (
              <span className="tabular text-2xs text-muted">
                ({money(pricing.subtotal, o.currency)} + <Truck aria-hidden className="inline size-3 text-brand-deep" /> {money(pricing.shipping, o.currency)})
              </span>
            )}
          </div>
          <span className="tabular text-sm font-bold text-ink sm:text-base">{money(pricing.total, o.currency)}</span>
        </div>
      </div>

      {/* Collapsible Customer Cart Mentality */}
      {mentality && mentality.attemptCount > 1 && (
        <details className="group rounded-control border border-warning-border/70 bg-warning-bg/35 px-2.5 py-1.5 text-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-ink">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <Sparkles aria-hidden className="size-3.5 shrink-0 text-warning" />
              <span className="truncate">{mentality.headline}</span>
            </span>
            <span className="shrink-0 text-2xs font-semibold text-brand-deep group-open:hidden">
              View changes
            </span>
            <span className="hidden shrink-0 text-2xs font-semibold text-muted group-open:inline">
              Hide
            </span>
          </summary>
          <div className="mt-2 space-y-1 border-t border-warning-border/50 pt-2 text-ink-2">
            {mentality.droppedItems.length > 0 && (
              <p>
                <span className="font-semibold text-danger">Dropped: </span>
                {mentality.droppedItems.map((d) => `${d.name}${d.price > 0 ? ` (${money(d.price * d.quantity, o.currency)})` : ""}`).join(", ")}
              </p>
            )}
            {mentality.addedItems.length > 0 && (
              <p>
                <span className="font-semibold text-success">Added now: </span>
                {mentality.addedItems.map((a) => `${a.name}${a.price > 0 ? ` (${money(a.price * a.quantity, o.currency)})` : ""}`).join(", ")}
              </p>
            )}
            {mentality.keptItems.length > 0 && (
              <p>
                <span className="font-semibold text-brand-deep">Kept: </span>
                {mentality.keptItems.map((k) => k.name).join(", ")}
              </p>
            )}
            <div className="mt-1.5 border-t border-warning-border/40 pt-1.5 text-2xs text-muted">
              {mentality.previousCarts.slice(0, 2).map((pc) => (
                <p key={pc.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <History aria-hidden className="mr-1 inline size-3 align-[-1px]" />
                    Earlier {orderRef(pc)}: {itemsText(pc.items)}
                  </span>
                  <span className="tabular shrink-0">
                    {money(pc.total, pc.currency)} · {fmtDate(pc.createdAt, "d MMM, h:mm a")}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Compact Delivery Address & Payment Status */}
      <div className="space-y-1.5">
        <OrderAddressControl
          orderId={o.id}
          orderRefText={refText}
          customerId={o.customer.id}
          customerName={o.customer.name}
          currentOrderNote={o.note}
          customerLocation={o.customer.location}
          customerLocationRaw={o.customer.locationRaw}
          canEdit={canEdit}
          compact
        />
        <PaymentSummary o={o} />
        <OrderExtra orderId={o.id} fields={orderFields} values={readValues(o.extra)} canEdit={canEdit} />
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
        payment={o.client.paymentConfig && o.total > 0 && !o.paidAt && received <= 0 && methodOf(o) !== "cod" ? (o.paymentRequestedAt ? "again" : "first") : null}
        pay={{
          state: payState,
          cod: methodOf(o) === "cod",
          due: dueOf(o),
          refundable: Math.max(0, received - (o.refundAmount ?? 0)),
          overpaid: o.status === "CANCELLED" ? 0 : Math.max(0, Math.round((received - (o.refundAmount ?? 0) - o.total) * 100) / 100),
          canUndo: canUndoPayment(o),
          hold: holdBeforeDispatch(o),
        }}
        catalogProducts={catalogProducts}
        isLiveCatalog={isLiveCatalog}
      />
    </div>
  );
}
