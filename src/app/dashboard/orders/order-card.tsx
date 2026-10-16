import Link from "@/components/intent-link";
import { analyzeCartMentality } from "@/lib/cart-mentality";
import { fmtDate } from "@/lib/format";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { OrderPointsControl } from "./loyalty-points-ui";
import { itemsText, money, orderRef, type OrderItem } from "@/lib/orders";
import { canUndoPayment, dueOf, holdBeforeDispatch, methodOf, paymentState, receivedOf } from "@/lib/payment-state";
import { formatPhone } from "@/lib/phone";
import { OrderActions } from "./order-actions";
import { OrderAddressControl } from "./order-address-sheet";
import { PaymentSummary } from "./payment-status";
import { OrderExtra } from "./order-extra";
import { readValues, type CustomField } from "@/lib/custom-fields";
import type { CatalogProductOption } from "./order-items-editor";
import { DEFAULT_FLOW, flowHas, flowSteps, reachedIndex, stageRank, stepLabel, type OrderFlowKey } from "@/lib/order-flow";

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
  /** When it was marked packed (the "Packed" step). */
  packedAt?: Date | null;
  /** Set for carts sent from WhatsApp; empty for orders typed in by the team. */
  waMessageId?: string | null;
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
  /** Loyalty points used on this order (100 points = ₹50, already off the total). */
  pointsRedeemed?: number;
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

const when = (d: Date) => fmtDate(d, "EEE d MMM, h:mm a");

/** One order: who, what, the total, where it stands, delivery address, customer cart mentality, and the buttons that move it along. */
export function OrderCard({
  order: o,
  items,
  showClient,
  canEdit,
  catalogProducts = [],
  isLiveCatalog = false,
  orderFields = [],
  points = null,
  flow = DEFAULT_FLOW,
}: {
  /** The client's order steps (Settings → Order steps). */
  flow?: OrderFlowKey;
  /** The client's custom order fields (lib/custom-fields.ts). */
  orderFields?: CustomField[];
  /** What the customer could take off this order in points (₹, ₹25 steps) and their unused points. */
  points?: { max: number; balance: number } | null;
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
  const refText = orderRef(o);
  const pricing = getOrderPricing(items, o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) });
  const pointsCanChange = canEdit && o.status !== "CANCELLED" && !o.paidAt && received <= 0;
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

  // How far along: the "Paid / COD" step counts once the money is in or cash on delivery is set.
  const cod = payState === "cod_due" || methodOf(o) === "cod";
  const rank = stageRank({ status: o.status, packedAt: o.packedAt, paid: isPaid, cod });
  const steps = flowSteps(flow);
  const reached = reachedIndex(flow, rank);
  // Timeline: whether a stage (by ladder rank) is done.
  const past = (r: number) => rank >= r;
  const source = o.waMessageId ? { tone: "info", label: "WhatsApp cart" } : { tone: "mute", label: "Manual entry" };
  // The address has its own row below (with "Add address"); flag only what has no other place.
  const missing = [!o.customer.phone ? "Phone number missing" : null].filter(Boolean);

  // What the app records, in order. Stages without a saved time show "Done" once reached.
  const events: [string, string | null][] = [
    ["Order placed", when(o.createdAt)],
    ...(o.status === "CANCELLED"
      ? ([["Cancelled", "Done"]] as [string, string][])
      : ([
          ...(flowHas(flow, "CONFIRMED") ? ([["Confirmed", past(1) ? "Done" : null]] as [string, string | null][]) : []),
          ...(o.paymentRequestedAt ? ([["Payment link sent", when(o.paymentRequestedAt)]] as [string, string][]) : []),
          [cod ? "Cash on delivery chosen" : "Payment received", o.paidAt ? when(o.paidAt) : cod ? "Collect on delivery" : null],
          ...(flowHas(flow, "PACKED") ? ([["Packed", o.packedAt ? when(o.packedAt) : past(3) ? "Done" : null]] as [string, string | null][]) : []),
          ...(flowHas(flow, "DISPATCHED") ? ([[stepLabel(flow, "DISPATCHED")!, past(4) ? "Done" : null]] as [string, string | null][]) : []),
          [stepLabel(flow, "DELIVERED") ?? "Delivered", past(5) ? "Done" : null],
        ] as [string, string | null][])),
    ...(o.refundedAt ? ([["Refunded", when(o.refundedAt)]] as [string, string][]) : []),
  ];
  const timeline = (
    <div className="list" style={{ marginTop: 12 }}>
      {events.map(([label, at]) => (
        <div key={label} className="row">
          <div className={`grow${at ? "" : " muted"}`}>{label}</div>
          <span className="muted small">{at ?? "Not yet"}</span>
        </div>
      ))}
    </div>
  );

  return (
    <article className="card">
      <div className="hd" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17 }}>
            {refText} ·{" "}
            <Link href={`/dashboard/customers/${o.customer.id}`} style={{ textDecoration: "none" }}>
              {o.customer.name}
            </Link>{" "}
            <span className={`pill ${source.tone}`} style={{ verticalAlign: "middle", marginLeft: 4 }}>
              {source.label}
            </span>
            {mentality && mentality.attemptCount > 1 && (
              <span className="pill warn" style={{ verticalAlign: "middle", marginLeft: 4 }}>
                Cart #{mentality.attemptCount}
              </span>
            )}
            {isSuperseded && (
              <span className="pill mute" style={{ verticalAlign: "middle", marginLeft: 4 }}>
                Replaced
              </span>
            )}
            {showClient && (
              <span className="pill mute" style={{ verticalAlign: "middle", marginLeft: 4 }}>
                {o.customer.client.name}
              </span>
            )}
          </h2>
          <p>
            {items.map((i) => `${i.quantity} × ${i.name ?? i.id}`).join(", ") || "No items"}
          </p>
          <p className="muted small" style={{ marginTop: 2 }}>
            {formatPhone(o.customer.phone)} · {fmtDate(o.createdAt, "d MMM, h:mm a")}
            {pricing.shipping > 0 && ` · includes ${money(pricing.shipping, o.currency)} delivery`}
            {pricing.discount > 0 && ` · ${money(pricing.discount, o.currency)} off with points`}
            {items.some((i) => !(i.price > 0)) && " · some items need a price"}
          </p>
        </div>
        <b style={{ font: "600 20px var(--display)" }}>{money(pricing.total, o.currency)}</b>
      </div>

      {o.status === "CANCELLED" ? (
        <span className="pill bad">Cancelled</span>
      ) : (
        <div className="steps">
          {steps.map((f, i) => (
            <span key={f.key} style={{ display: "contents" }}>
              {i > 0 && "›"}
              <b className={i <= reached ? "on" : undefined}>{f.key === "PAID" && cod && !isPaid ? "COD" : f.label}</b>
            </span>
          ))}
        </div>
      )}

      <PaymentSummary o={o} />

      {missing.length > 0 && (
        <div className="note small" style={{ marginTop: 12 }}>
          <b>{missing.join(" · ")}</b>
        </div>
      )}

      {mentality && mentality.attemptCount > 1 && (
        <details className="more">
          <summary>{mentality.headline}</summary>
          <div className="small" style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {mentality.droppedItems.length > 0 && (
              <p>
                <b className="down">Dropped: </b>
                {mentality.droppedItems.map((d) => `${d.name}${d.price > 0 ? ` (${money(d.price * d.quantity, o.currency)})` : ""}`).join(", ")}
              </p>
            )}
            {mentality.addedItems.length > 0 && (
              <p>
                <b className="up">Added now: </b>
                {mentality.addedItems.map((x) => `${x.name}${x.price > 0 ? ` (${money(x.price * x.quantity, o.currency)})` : ""}`).join(", ")}
              </p>
            )}
            {mentality.keptItems.length > 0 && (
              <p>
                <b>Kept: </b>
                {mentality.keptItems.map((k) => k.name).join(", ")}
              </p>
            )}
            {mentality.previousCarts.slice(0, 2).map((pc) => (
              <p key={pc.id} className="muted">
                Earlier {orderRef(pc)}: {itemsText(pc.items)} · {money(pc.total, pc.currency)} · {fmtDate(pc.createdAt, "d MMM, h:mm a")}
              </p>
            ))}
          </div>
        </details>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
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
        <OrderPointsControl
          orderId={o.id}
          applied={pricing.discount}
          max={points?.max ?? 0}
          balance={points?.balance ?? 0}
          canChange={pointsCanChange}
          paymentSent={Boolean(o.paymentRequestedAt)}
        />
        <OrderExtra orderId={o.id} fields={orderFields} values={readValues(o.extra)} canEdit={canEdit} />
      </div>

      <OrderActions
        id={o.id}
        who={o.customer.name}
        customerId={o.customer.id}
        timeline={timeline}
        status={o.status}
        flow={flow}
        packed={Boolean(o.packedAt)}
        isPaid={isPaid}
        note={o.internalNote}
        customerNote={o.note}
        items={items}
        total={o.total}
        discount={pricing.discount}
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
    </article>
  );
}
