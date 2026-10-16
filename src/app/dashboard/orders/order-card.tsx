"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { fmtDate } from "@/lib/format";
import { inr } from "../portal-format";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { orderRef, type OrderItem } from "@/lib/order-ref";
import {
  DEFAULT_FLOW,
  flowHas,
  flowSteps,
  reachedIndex,
  stageRank,
  stepLabel,
  type OrderFlowKey,
} from "@/lib/order-flow";
import {
  notifyOrder,
  requestPayment,
  saveOrderAddress,
  setOrderPacked,
  setOrderStatus,
  updateOrderItems,
} from "../actions/orders";
import { deliverCod, recordPayment, setPaymentMethod } from "../actions/payments";
import {
  blankOrderLine,
  OrderItemsEditor,
  type CatalogProductOption,
  type EditableOrderLine,
} from "./order-items-editor";

export type OrderCardData = {
  id: string;
  number: number;
  ref: string | null;
  status: "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  total: number;
  currency: string;
  note: string | null;
  internalNote: string | null;
  createdAt: Date | string;
  packedAt?: Date | string | null;
  waMessageId?: string | null;
  paidAt: Date | string | null;
  paymentTxnId: string | null;
  paymentRequestedAt: Date | string | null;
  paymentReminderAt?: Date | string | null;
  paymentMethod?: string | null;
  paymentSource?: string | null;
  paidAmount?: number | null;
  paymentClaimedAt?: Date | string | null;
  paymentClaimNote?: string | null;
  paymentFailedAt?: Date | string | null;
  paymentFailReason?: string | null;
  collectedBy?: string | null;
  refundedAt?: Date | string | null;
  refundAmount?: number | null;
  refundNote?: string | null;
  pointsRedeemed?: number;
  items?: OrderItem[];
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
    locationRaw?: string | null;
    client?: { name: string };
  };
  client?: { paymentConfig?: string | null; orderFlow?: string | null };
};

export function OrderCard({
  order: o,
  items,
  showClient,
  canEdit,
  catalogProducts = [],
  flow = DEFAULT_FLOW,
}: {
  order: OrderCardData;
  items: OrderItem[];
  showClient?: boolean;
  canEdit: boolean;
  catalogProducts?: CatalogProductOption[];
  flow?: OrderFlowKey;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Local interactive UI state
  const [showTimeline, setShowTimeline] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState(
    o.note?.trim() || o.customer.locationRaw?.trim() || o.customer.location?.trim() || "",
  );

  // Modals state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchMethod, setDispatchMethod] = useState("Murugan (bike)");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sendUpdate, setSendUpdate] = useState(true);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("upi");
  const [payRef, setPayRef] = useState("");
  const [payAmount, setPayAmount] = useState<number>(o.total);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLines, setEditLines] = useState<EditableOrderLine[]>(() =>
    items.length > 0
      ? items.map((i) => ({
          id: i.id ?? "custom",
          name: i.name ?? i.id ?? "Item",
          quantity: i.quantity || 1,
          price: i.price || 0,
          custom: !catalogProducts.some((p) => p.retailerId === i.id || p.name === i.name),
        }))
      : [blankOrderLine()],
  );

  const refText = orderRef(o);
  const pricing = getOrderPricing(items, o.total, {
    applyDefaultWhenEqual: true,
    discount: pointsDiscount(o),
  });

  const isPaid = o.status === "PAID" || o.paidAt !== null;
  const isCod =
    o.paymentMethod === "cod" ||
    (o.internalNote && /cod|cash on delivery/i.test(o.internalNote));

  // Determine stage & steps
  const rank = stageRank({ status: o.status, packedAt: o.packedAt ? new Date(o.packedAt) : null, paid: isPaid, cod: Boolean(isCod) });
  const steps = flowSteps(flow);
  const reached = reachedIndex(flow, rank);

  const hasConfirm = flowHas(flow, "CONFIRMED");
  const hasPack = flowHas(flow, "PACKED");
  const hasDispatch = flowHas(flow, "DISPATCHED");
  const finishLabel = stepLabel(flow, "DELIVERED") ?? "Delivered";

  // Source pill
  const source = o.waMessageId
    ? o.internalNote && /campaign/i.test(o.internalNote)
      ? { tone: "warn", label: "Campaign" }
      : { tone: "info", label: "Catalogue" }
    : { tone: "mute", label: "Manual entry" };

  // Payment pill & text
  let payPill: { tone: "ok" | "warn" | "info" | "mute" | "bad"; label: string };
  let payText: string;
  if (isPaid) {
    payPill = { tone: "ok", label: "Paid" };
    payText = `${inr(pricing.total)} received`;
  } else if (isCod) {
    payPill = { tone: "info", label: "Cash on delivery" };
    payText = `Collect ${inr(pricing.total)} on delivery`;
  } else if (o.paymentRequestedAt) {
    payPill = { tone: "warn", label: "Payment link sent" };
    payText = `${inr(pricing.total)} not received yet`;
  } else {
    payPill = { tone: "mute", label: "Payment waiting" };
    payText = `${inr(pricing.total)} not received yet`;
  }

  // Late detection
  const createdAtMs = new Date(o.createdAt).getTime();
  const hoursAgo = (Date.now() - createdAtMs) / (1000 * 60 * 60);
  const isLate = !isPaid && !isCod && o.status !== "CANCELLED" && hoursAgo > 24;
  const lateDays = Math.floor(hoursAgo / 24);
  const lateText = lateDays > 1 ? `${lateDays} days` : "1 day";

  // Missing info check
  const fullAddress =
    o.note?.trim() || o.customer.locationRaw?.trim() || o.customer.location?.trim() || "";
  const phoneClean = o.customer.phone ? o.customer.phone.replace(/\D/g, "") : "";
  const missingPhone = !phoneClean || phoneClean.length < 10;
  const missingAddress = !fullAddress && o.status !== "CANCELLED" && o.status !== "NEW";

  const missingBadges: string[] = [];
  if (missingAddress) missingBadges.push("Address needed");
  if (missingPhone) missingBadges.push("Phone number missing");

  // Determine primary action
  let primaryAction: { key: string; label: string };
  if (o.status === "NEW") {
    primaryAction = hasConfirm
      ? { key: "confirm", label: "Confirm order" }
      : isPaid || isCod
        ? hasPack && !o.packedAt
          ? { key: "pack", label: "Pack order" }
          : hasDispatch
            ? { key: "dispatch", label: "Dispatch order" }
            : { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` }
        : o.paymentRequestedAt
          ? { key: "remind", label: "Send reminder" }
          : { key: "link", label: "Send payment link" };
  } else if (o.status === "CONFIRMED") {
    if (isPaid || isCod) {
      if (hasPack && !o.packedAt) {
        primaryAction = { key: "pack", label: "Pack order" };
      } else if (hasDispatch) {
        primaryAction = {
          key: "dispatch",
          label: flow === "courier" ? "Ship order" : "Dispatch order",
        };
      } else {
        primaryAction = { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` };
      }
    } else {
      primaryAction = o.paymentRequestedAt
        ? { key: "remind", label: "Send reminder" }
        : { key: "link", label: "Send payment link" };
    }
  } else if (o.status === "PAID") {
    if (hasPack && !o.packedAt) {
      primaryAction = { key: "pack", label: "Pack order" };
    } else if (hasDispatch) {
      primaryAction = {
        key: "dispatch",
        label: flow === "courier" ? "Ship order" : "Dispatch order",
      };
    } else {
      primaryAction = { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` };
    }
  } else if (o.status === "DISPATCHED") {
    if (isCod && !isPaid) {
      primaryAction = { key: "codin", label: `Delivered, cash received ${inr(pricing.total)}` };
    } else {
      primaryAction = { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` };
    }
  } else if (o.status === "DELIVERED") {
    primaryAction = { key: "receipt", label: "View receipt" };
  } else {
    primaryAction = { key: "restore", label: "Restore order" };
  }

  // Action runners
  const runAction = (name: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      toastResult(res);
      router.refresh();
    });
  };

  const handlePrimaryClick = async () => {
    switch (primaryAction.key) {
      case "confirm":
        runAction("confirm", () => notifyOrder(o.id, "confirm"));
        break;
      case "pack":
        runAction("pack", () => setOrderPacked(o.id, true));
        break;
      case "dispatch":
        setDispatchOpen(true);
        break;
      case "deliver":
        runAction("deliver", () => setOrderStatus(o.id, "DELIVERED"));
        break;
      case "codin":
        runAction("codin", () => deliverCod(o.id, { collected: true, amount: pricing.total }));
        break;
      case "link":
        runAction("link", () => requestPayment(o.id));
        break;
      case "remind":
        runAction("remind", () => requestPayment(o.id));
        break;
      case "receipt":
        setReceiptOpen(true);
        break;
      case "restore":
        runAction("restore", () => setOrderStatus(o.id, "NEW"));
        break;
      default:
        break;
    }
  };

  const handleSaveAddress = () => {
    if (!addressInput.trim()) return;
    runAction("saveaddr", async () => {
      const r = await saveOrderAddress(o.id, { address: addressInput.trim(), syncToCustomer: true });
      if (r.ok) setEditingAddress(false);
      return r;
    });
  };

  const handleCancelOrder = async () => {
    const ok = await confirmAction({
      title: `Cancel order #${refText}?`,
      message: `Are you sure you want to cancel ${o.customer.name}'s order for ${inr(pricing.total)}?`,
      confirmLabel: "Cancel order",
      danger: true,
    });
    if (!ok) return;
    runAction("cancel", () => setOrderStatus(o.id, "CANCELLED"));
  };

  const submitDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchOpen(false);
    runAction("dispatch", () =>
      notifyOrder(o.id, "dispatch", {
        by: dispatchMethod,
        link: dispatchMethod === "Courier" ? trackingNumber : undefined,
        eta: "today evening",
      }),
    );
  };

  const submitMarkPaid = (e: React.FormEvent) => {
    e.preventDefault();
    setPayModalOpen(false);
    runAction("paid", () =>
      recordPayment(o.id, {
        method: payMethod,
        amount: payAmount,
        reference: payRef || undefined,
      }),
    );
  };

  const when = (d: Date | string | null | undefined) => (d ? fmtDate(new Date(d), "EEE d MMM, h:mm a") : null);

  // Timeline events matching prototype
  const timelineEvents: [string, string | null][] = [
    ["Order placed", when(o.createdAt)],
    ...(o.status === "CANCELLED"
      ? [["Cancelled", o.internalNote ? `Cancelled · ${o.internalNote}` : "Cancelled"] as [string, string | null]]
      : [
          ...(hasConfirm ? [["Confirmed", rank >= 1 ? "Done" : null] as [string, string | null]] : []),
          ...(o.paymentRequestedAt
            ? [["Payment link sent", when(o.paymentRequestedAt)] as [string, string | null]]
            : []),
          [
            isCod ? "Cash on delivery chosen" : "Payment received",
            o.paidAt ? when(o.paidAt) : isCod ? "Collect on delivery" : null,
          ] as [string, string | null],
          ...(hasPack ? [["Packed", o.packedAt ? when(o.packedAt) : rank >= 3 ? "Done" : null] as [string, string | null]] : []),
          ...(hasDispatch
            ? [[stepLabel(flow, "DISPATCHED") ?? "Dispatched", rank >= 4 ? "Done" : null] as [string, string | null]]
            : []),
          [finishLabel, rank >= 5 ? "Done" : null] as [string, string | null],
        ]),
    ...(o.refundedAt ? [["Refunded", when(o.refundedAt)] as [string, string | null]] : []),
  ];

  const itemsDescription =
    items.map((i) => `${i.quantity} × ${i.name ?? i.id}`).join(", ") || "No items";

  return (
    <article className="card">
      {/* 1. Header: #1052 · Anbu M. [Catalogue] and Total ₹960 */}
      <div className="hd" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 17 }}>
            #{refText} ·{" "}
            <Link href={`/dashboard/customers/${o.customer.id}`} style={{ textDecoration: "none" }}>
              {o.customer.name}
            </Link>{" "}
            <span
              className={`pill ${source.tone}`}
              style={{ verticalAlign: "middle", marginLeft: 4 }}
            >
              {source.label}
            </span>
            {showClient && o.customer.client && (
              <span
                className="pill mute"
                style={{ verticalAlign: "middle", marginLeft: 4 }}
              >
                {o.customer.client.name}
              </span>
            )}
          </h2>
          <p>{itemsDescription}</p>
        </div>
        <b style={{ font: "600 20px var(--display)" }}>{inr(pricing.total)}</b>
      </div>

      {/* 2. Steps Stepper */}
      {o.status === "CANCELLED" ? (
        <span className="pill bad">Cancelled</span>
      ) : (
        <div className="steps">
          {steps.map((f, i) => (
            <Fragment key={f.key}>
              {i > 0 && "›"}
              <b className={i <= reached ? "on" : undefined}>{f.label}</b>
            </Fragment>
          ))}
        </div>
      )}

      {/* 3. Payment bar */}
      <div className="tools" style={{ marginTop: 12 }}>
        <span className={`pill ${payPill.tone}`}>{payPill.label}</span>
        <span className="muted small">{payText}</span>
        {isLate && <span className="pill bad">Late {lateText}</span>}
      </div>

      {/* 4. Missing info notice */}
      {missingBadges.length > 0 && (
        <div
          className="note small"
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <b>{missingBadges.join(" · ")}</b>
          {missingBadges[0] === "Address needed" ? (
            <button
              type="button"
              className="btn sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setEditingAddress(true)}
            >
              Add address
            </button>
          ) : (
            <Link
              className="btn sm"
              href={`/dashboard/customers/${o.customer.id}`}
              style={{ marginLeft: "auto" }}
            >
              Ask the customer
            </Link>
          )}
        </div>
      )}

      {/* 5. Primary and Secondary Action Buttons */}
      <div className="tools" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={handlePrimaryClick}
        >
          {primaryAction.label}
        </button>
        <Link
          className="btn sm ghost"
          href={`/dashboard/replies?q=${encodeURIComponent(o.customer.phone || o.customer.name)}`}
        >
          Open chat
        </Link>
        <a
          className="btn sm ghost"
          href={
            o.customer.phone
              ? `https://wa.me/${o.customer.phone.replace(/\D/g, "")}`
              : undefined
          }
          target="_blank"
          rel="noopener"
        >
          Call
        </a>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setShowTimeline(!showTimeline)}
        >
          {showTimeline ? "Hide timeline" : "Timeline"}
        </button>
      </div>

      {/* 6. Expandable Timeline */}
      {showTimeline && (
        <div className="list" style={{ marginTop: 12 }}>
          {timelineEvents.map(([label, at]) => (
            <div key={label} className="row">
              <div className={`grow${at ? "" : " muted"}`}>{label}</div>
              <span className="muted small">{at ?? "Not yet"}</span>
            </div>
          ))}
        </div>
      )}

      {/* 7. Address Row */}
      {editingAddress ? (
        <div className="tools" style={{ marginTop: 12 }}>
          <input
            type="text"
            id="ad"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Address from the customer"
            aria-label="Address"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn sm primary"
            disabled={pending}
            onClick={handleSaveAddress}
          >
            Save
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => setEditingAddress(false)}
          >
            Cancel
          </button>
        </div>
      ) : fullAddress ? (
        <p className="muted small" style={{ marginTop: 12 }}>
          Deliver to: {fullAddress} ·{" "}
          <button
            type="button"
            className="linkb"
            onClick={() => {
              setAddressInput(fullAddress);
              setEditingAddress(true);
            }}
          >
            Change
          </button>
        </p>
      ) : o.status !== "CANCELLED" ? (
        <p style={{ marginTop: 12 }}>
          <button
            type="button"
            className="linkb"
            onClick={() => setEditingAddress(true)}
          >
            + Add address
          </button>
        </p>
      ) : null}

      {/* 8. More actions Accordion */}
      <details className="more">
        <summary>More actions</summary>
        <div className="tools" style={{ marginTop: 10 }}>
          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setEditOpen(true)}
            >
              Edit order
            </button>
          )}

          {o.status === "NEW" && !isCod && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() =>
                runAction("tocod", () =>
                  setPaymentMethod(o.id, "cod", { confirm: true }),
                )
              }
            >
              Confirm as cash on delivery
            </button>
          )}

          {o.status === "CONFIRMED" && !isPaid && !isCod && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() =>
                runAction("tocod", () =>
                  setPaymentMethod(o.id, "cod", { confirm: false }),
                )
              }
            >
              Change to cash on delivery
            </button>
          )}

          {!isPaid && !isCod && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("link", () => requestPayment(o.id))}
            >
              {o.paymentRequestedAt ? "Send link again" : "Send payment link"}
            </button>
          )}

          {!isPaid && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setPayModalOpen(true)}
            >
              Mark paid
            </button>
          )}

          {hasPack && o.packedAt && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("unpack", () => setOrderPacked(o.id, false))}
            >
              Not packed yet
            </button>
          )}

          {hasDispatch && (o.status === "CONFIRMED" || o.status === "PAID") && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setDispatchOpen(true)}
            >
              Dispatch order
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => window.print()}
            >
              Print packing slip
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => window.print()}
            >
              Print invoice
            </button>
          )}

          {o.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn sm danger"
              disabled={pending}
              onClick={handleCancelOrder}
            >
              Cancel order
            </button>
          )}

          {o.status === "CANCELLED" && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("restore", () => setOrderStatus(o.id, "NEW"))}
            >
              Restore order
            </button>
          )}
        </div>
      </details>

      {/* Dispatch Modal (#dsp) */}
      {dispatchOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            background: "rgba(16,40,59,.55)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDispatchOpen(false);
          }}
        >
          <form
            className="dlg card"
            style={{ width: "min(520px, calc(100vw - 32px))" }}
            onSubmit={submitDispatch}
          >
            <h2>Dispatch order #{refText}</h2>
            <div className="field">
              <label htmlFor="dsw">Delivery method</label>
              <select
                id="dsw"
                value={dispatchMethod}
                onChange={(e) => setDispatchMethod(e.target.value)}
              >
                <option value="Murugan (bike)">Murugan (bike)</option>
                <option value="Selvam (bike)">Selvam (bike)</option>
                <option value="Courier">Courier</option>
                <option value="Customer pickup">Customer pickup</option>
              </select>
            </div>
            {dispatchMethod === "Courier" && (
              <div className="field">
                <label htmlFor="dst">Tracking number</label>
                <input
                  id="dst"
                  type="text"
                  placeholder="e.g. DTDC 1234567"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </div>
            )}
            <label
              className="small"
              style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}
            >
              <input
                type="checkbox"
                checked={sendUpdate}
                onChange={(e) => setSendUpdate(e.target.checked)}
              />
              Send the customer a WhatsApp delivery update
            </label>
            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setDispatchOpen(false)}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={pending}>
                Dispatch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mark Paid Modal (#mp) */}
      {payModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            background: "rgba(16,40,59,.55)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayModalOpen(false);
          }}
        >
          <form
            className="dlg card"
            style={{ width: "min(520px, calc(100vw - 32px))" }}
            onSubmit={submitMarkPaid}
          >
            <h2>Mark paid #{refText}</h2>
            <p className="muted small">
              Use this when the customer paid you outside thabaal.
            </p>
            <div className="formgrid">
              <div className="field">
                <label htmlFor="mpw">How did they pay?</label>
                <select
                  id="mpw"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="upi">UPI (GPay, PhonePe, Paytm)</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mpa">Amount (₹)</label>
                <input
                  id="mpa"
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mpr">Reference (optional)</label>
              <input
                id="mpr"
                type="text"
                placeholder="UPI reference or note"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
            </div>
            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setPayModalOpen(false)}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={pending}>
                Save payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Receipt Modal (#rec) */}
      {receiptOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            background: "rgba(16,40,59,.55)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setReceiptOpen(false);
          }}
        >
          <div className="dlg card" style={{ width: "min(520px, calc(100vw - 32px))" }}>
            <h2>Receipt #{refText}</h2>
            <div className="list">
              <div className="row">
                <div className="grow muted">Order</div>
                <b>#{refText}</b>
              </div>
              <div className="row">
                <div className="grow muted">Customer</div>
                <b>{o.customer.name}</b>
              </div>
              <div className="row">
                <div className="grow muted">Paid by</div>
                <b>{o.paymentMethod ? o.paymentMethod.toUpperCase() : "Online"}</b>
              </div>
              <div className="row">
                <div className="grow muted">When</div>
                <b>
                  {o.paidAt
                    ? fmtDate(new Date(o.paidAt), "EEE d MMM, h:mm a")
                    : "Today"}
                </b>
              </div>
              <div
                className="row"
                style={{ borderTop: "2px solid var(--line)", marginTop: 6 }}
              >
                <div className="grow t">Amount</div>
                <b style={{ font: "600 20px var(--display)" }}>{inr(pricing.total)}</b>
              </div>
            </div>
            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setReceiptOpen(false)}
              >
                Close
              </button>
              <a
                className="btn primary"
                href={
                  o.customer.phone
                    ? `https://wa.me/${o.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Receipt for Order #${refText}: ${inr(pricing.total)} paid. Thank you!`,
                      )}`
                    : undefined
                }
                target="_blank"
                rel="noopener"
              >
                Send on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Items Sheet */}
      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit items · #${refText}`}
        description="Update products, quantities and pricing for this order."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEditOpen(false);
            runAction("edititems", () =>
              updateOrderItems(o.id, {
                items: editLines.map((l) => ({
                  id: l.custom ? undefined : l.id,
                  name: l.name,
                  quantity: l.quantity,
                  price: l.price,
                })),
                shippingFee: 0,
              }),
            );
          }}
          className="space-y-4"
        >
          <OrderItemsEditor
            lines={editLines}
            catalogProducts={catalogProducts}
            onChange={setEditLines}
          />
          <div className="acts">
            <button type="button" className="btn" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              Save items
            </button>
          </div>
        </form>
      </Sheet>
    </article>
  );
}
