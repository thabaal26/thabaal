"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { fmtDate } from "@/lib/format";
import { inr } from "../portal-format";
import { T, useLang } from "../portal-ui";
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
  const lang = useLang();
  const isTa = lang === "ta";

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
  const [showItems, setShowItems] = useState(false);
  const [itemsCopied, setItemsCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);

  const handleCopyRef = () => {
    if (!o.paymentTxnId) return;
    navigator.clipboard?.writeText(o.paymentTxnId);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 1800);
  };
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
    payPill = { tone: "ok", label: isTa ? "செலுத்தப்பட்டது" : "Paid" };
    payText = isTa ? `${inr(pricing.total)} பெறப்பட்டது` : `${inr(pricing.total)} received`;
  } else if (isCod) {
    payPill = { tone: "info", label: isTa ? "டெலிவரியின் போது பணம்" : "Cash on delivery" };
    payText = isTa ? `டெலிவரியின் போது ${inr(pricing.total)} பெறவும்` : `Collect ${inr(pricing.total)} on delivery`;
  } else if (o.paymentRequestedAt) {
    payPill = { tone: "warn", label: isTa ? "கட்டண இணைப்பு அனுப்பப்பட்டது" : "Payment link sent" };
    payText = isTa ? `${inr(pricing.total)} இன்னும் பெறப்படவில்லை` : `${inr(pricing.total)} not received yet`;
  } else {
    payPill = { tone: "mute", label: isTa ? "கட்டணம் நிலுவை" : "Payment waiting" };
    payText = isTa ? `${inr(pricing.total)} இன்னும் பெறப்படவில்லை` : `${inr(pricing.total)} not received yet`;
  }

  // Late detection
  const [mountedNow] = useState(() => Date.now());
  const createdAtMs = new Date(o.createdAt).getTime();
  const hoursAgo = (mountedNow - createdAtMs) / (1000 * 60 * 60);
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

  const PRIMARY_ACTION_TA: Record<string, string> = {
    confirm: "ஆர்டரை உறுதி செய்",
    pack: "பேக் செய்",
    dispatch: flow === "courier" ? "கொரியரில் அனுப்பு" : "டெலிவரிக்கு அனுப்பு",
    deliver: "டெலிவரி ஆனதாகக் குறி",
    remind: "நினைவூட்டல் அனுப்பு",
    link: "கட்டண இணைப்பு அனுப்பு",
    codin: `டெலிவரி ஆனது, பணம் வரவு ${inr(pricing.total)}`,
    receipt: "ரசீது பார்க்க",
    restore: "ஆர்டரை மீட்டெடு",
  };
  const primaryActionLabel = isTa ? (PRIMARY_ACTION_TA[primaryAction.key] ?? primaryAction.label) : primaryAction.label;

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
            o.paidAt
              ? `${when(o.paidAt)}${o.paymentTxnId ? ` · Ref: ${o.paymentTxnId}` : ""}`
              : isCod
              ? "Collect on delivery"
              : null,
          ] as [string, string | null],
          ...(hasPack ? [["Packed", o.packedAt ? when(o.packedAt) : rank >= 3 ? "Done" : null] as [string, string | null]] : []),
          ...(hasDispatch
            ? [[stepLabel(flow, "DISPATCHED") ?? "Dispatched", rank >= 4 ? "Done" : null] as [string, string | null]]
            : []),
          [finishLabel, rank >= 5 ? "Done" : null] as [string, string | null],
        ]),
    ...(o.refundedAt ? [["Refunded", when(o.refundedAt)] as [string, string | null]] : []),
  ];

  const itemCount = items.length;
  const totalUnits = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const firstItem = items[0];
  const firstItemLabel = firstItem
    ? `${firstItem.quantity || 1} × ${firstItem.name ?? firstItem.id}`
    : "No items";
  const remainingCount = itemCount - 1;

  const handleCopyItems = () => {
    const lines = items.map(
      (i) => `• ${i.quantity || 1} × ${i.name ?? i.id}${i.price > 0 ? ` (${inr((i.quantity || 1) * i.price)})` : ""}`
    );
    const text = `Order #${refText} (${o.customer.name}):\n${lines.join("\n")}\nTotal: ${inr(pricing.total)}`;
    navigator.clipboard?.writeText(text);
    setItemsCopied(true);
    setTimeout(() => setItemsCopied(false), 1800);
  };

  return (
    <article className="card">
      {/* 1. Header: #1052 · Anbu M. [Catalogue] and Total ₹960 */}
      <div className="hd" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, margin: 0, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            #{refText} ·{" "}
            <Link href={`/dashboard/customers/${o.customer.id}`} style={{ textDecoration: "none" }}>
              {o.customer.name}
            </Link>{" "}
            <span
              className={`pill ${source.tone}`}
              style={{ verticalAlign: "middle" }}
            >
              {source.label}
            </span>
            {showClient && o.customer.client && (
              <span
                className="pill mute"
                style={{ verticalAlign: "middle" }}
              >
                {o.customer.client.name}
              </span>
            )}
          </h2>

          {/* Items shortlist & drop button */}
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.45 }}>
              {firstItemLabel}
              {remainingCount > 0 && (
                <span style={{ opacity: 0.85, fontWeight: 500, marginLeft: 4 }}>
                  + {remainingCount} more
                </span>
              )}
            </span>

            {itemCount > 1 && (
              <button
                type="button"
                onClick={() => setShowItems(!showItems)}
                className="btn sm ghost"
                style={{
                  minHeight: 26,
                  height: 26,
                  padding: "0 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: showItems ? "var(--ink)" : "var(--soft)",
                  color: showItems ? "var(--bg)" : "var(--fg)",
                  border: "1px solid var(--line)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                aria-expanded={showItems}
                title={showItems ? "Hide items breakdown" : `View all ${itemCount} items`}
              >
                <span>{itemCount} items</span>
                <svg
                  style={{
                    width: 12,
                    height: 12,
                    transform: showItems ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s ease",
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <b style={{ font: "600 21px var(--display)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.2px", marginTop: 1 }}>{inr(pricing.total)}</b>
      </div>

      {/* Expandable items breakdown card */}
      {showItems && (
        <div
          style={{
            marginTop: 4,
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1.5px solid var(--line)",
            background: "var(--soft)",
            boxShadow: "0 2px 6px -1px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--muted)",
              }}
            >
              Order items ({itemCount} {itemCount === 1 ? "item" : "items"} · {totalUnits} {totalUnits === 1 ? "unit" : "units"})
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={handleCopyItems}
                className="linkb"
                style={{ fontSize: 12, fontWeight: 600 }}
                title="Copy items list for WhatsApp or packing"
              >
                {itemsCopied ? "✓ Copied" : "Copy list"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="linkb"
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Edit items
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowItems(false)}
                className="linkb"
                style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}
              >
                Close ▴
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item, idx) => {
              const qty = item.quantity || 1;
              const price = item.price || 0;
              const lineTotal = qty * price;
              return (
                <div
                  key={item.id ? `${item.id}-${idx}` : idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 0",
                    fontSize: 13.5,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 26,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 6,
                        background: "var(--card)",
                        border: "1px solid var(--line)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "var(--fg)",
                      }}
                    >
                      {qty}×
                    </span>
                    <span
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name ?? item.id ?? "Item"}
                    </span>
                    {price > 0 && (
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        @ {inr(price)}
                      </span>
                    )}
                  </div>
                  <b
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      marginLeft: 12,
                      fontWeight: 600,
                    }}
                  >
                    {inr(lineTotal)}
                  </b>
                </div>
              );
            })}
          </div>

          {/* Pricing breakdown strip */}
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px dashed var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--muted)",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <span>
              Items: <b style={{ color: "var(--fg)" }}>{inr(pricing.subtotal)}</b>
              {pricing.shipping > 0 && (
                <> · Delivery: <b style={{ color: "var(--fg)" }}>+{inr(pricing.shipping)}</b></>
              )}
              {pricing.discount > 0 && (
                <> · Points: <b style={{ color: "var(--ok)" }}>-{inr(pricing.discount)}</b></>
              )}
            </span>
            <span style={{ fontWeight: 700, color: "var(--fg)", fontSize: 13.5 }}>
              Total: {inr(pricing.total)}
            </span>
          </div>
        </div>
      )}

      {/* 2. Steps Stepper */}
      {o.status === "CANCELLED" ? (
        <span className="pill bad">Cancelled</span>
      ) : (
        <div className="steps" style={{ marginTop: 6, marginBottom: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          {steps.map((f, i) => (
            <Fragment key={f.key}>
              {i > 0 && <span style={{ opacity: 0.45, margin: "0 3px", fontSize: 13, userSelect: "none" }}>›</span>}
              <b className={i <= reached ? "on" : undefined}>{f.label}</b>
            </Fragment>
          ))}
        </div>
      )}

      {/* 3. Payment bar */}
      <div
        style={{
          marginTop: 10,
          marginBottom: 4,
          display: "flex",
          gap: "8px 12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span className={`pill ${payPill.tone}`}>{payPill.label}</span>
        <span className="muted small" style={{ fontSize: 13.5, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}>
          {isPaid ? (
            <>
              <b style={{ color: "var(--fg)", fontWeight: 600 }}>{inr(pricing.total)}</b>{" "}
              <span>{isTa ? "பெறப்பட்டது" : "received"}</span>
            </>
          ) : (
            payText
          )}
        </span>

        {/* Dedicated UPI Reference Pill with 1-tap copy and clean visual breathing room */}
        {isPaid && o.paymentTxnId && (
          <button
            type="button"
            onClick={handleCopyRef}
            title={isTa ? "UPI குறிப்பு எண்ணை நகலெடு" : "Click to copy UPI reference"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2.5px 8px",
              borderRadius: 6,
              background: refCopied ? "var(--ok-soft, rgba(16,185,129,0.12))" : "var(--soft)",
              border: `1px solid ${refCopied ? "var(--ok, #10b981)" : "var(--line)"}`,
              color: refCopied ? "var(--ok)" : "var(--fg)",
              fontSize: 12,
              fontFamily: "var(--mono, ui-monospace, monospace)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              UPI
            </span>
            <span style={{ fontWeight: 500, letterSpacing: "0.02em" }}>{o.paymentTxnId}</span>
            <span style={{ fontSize: 11, color: refCopied ? "var(--ok)" : "var(--muted)", marginLeft: 1 }}>
              {refCopied ? "✓" : "📋"}
            </span>
          </button>
        )}

        {isLate && <span className="pill bad">Late {lateText}</span>}
      </div>

      {/* 4. Missing info notice */}
      {missingBadges.length > 0 && (
        <div
          className="note small"
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <b style={{ fontSize: 13.5 }}>{missingBadges.join(" · ")}</b>
          {missingBadges[0] === "Address needed" ? (
            <button
              type="button"
              className="btn sm"
              style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
              onClick={() => setEditingAddress(true)}
            >
              Add address
            </button>
          ) : (
            <Link
              className="btn sm"
              href={`/dashboard/customers/${o.customer.id}`}
              style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
            >
              Ask the customer
            </Link>
          )}
        </div>
      )}

      {/* 5. Primary and Secondary Action Buttons */}
      <div className="tools" style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={handlePrimaryClick}
          style={{
            minHeight: 38,
            height: 38,
            padding: "0 18px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          {primaryActionLabel}
        </button>
        <Link
          className="btn sm ghost"
          href={`/dashboard/replies?q=${encodeURIComponent(o.customer.phone || o.customer.name)}`}
          style={{
            minHeight: 38,
            height: 38,
            padding: "0 12px",
            fontSize: 13.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
          }}
        >
          <T ta="உரையாடல்">Open chat</T>
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
          style={{
            minHeight: 38,
            height: 38,
            padding: "0 12px",
            fontSize: 13.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
          }}
        >
          WhatsApp
        </a>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setShowTimeline(!showTimeline)}
          style={{
            minHeight: 38,
            height: 38,
            padding: "0 12px",
            fontSize: 13.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
          }}
        >
          {showTimeline ? (isTa ? "காலவரிசையை மறை" : "Hide timeline") : (isTa ? "காலவரிசை" : "Timeline")}
        </button>
      </div>

      {/* 6. Expandable Timeline */}
      {showTimeline && (
        <div
          className="list"
          style={{
            marginTop: 14,
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--soft)",
          }}
        >
          {timelineEvents.map(([label, at]) => (
            <div key={label} className="row" style={{ padding: "8px 0" }}>
              <div className={`grow${at ? "" : " muted"}`} style={{ fontSize: 13.5 }}>{label}</div>
              <span className="muted small" style={{ fontSize: 13 }}>{at ?? "Not yet"}</span>
            </div>
          ))}
        </div>
      )}

      {/* 7. Address Row */}
      {editingAddress ? (
        <div className="tools" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            id="ad"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Address from the customer"
            aria-label="Address"
            style={{ flex: 1, minWidth: 200, minHeight: 38 }}
          />
          <button
            type="button"
            className="btn sm primary"
            disabled={pending}
            onClick={handleSaveAddress}
            style={{ minHeight: 38, height: 38, padding: "0 14px", borderRadius: 8 }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => setEditingAddress(false)}
            style={{ minHeight: 38, height: 38, padding: "0 12px", borderRadius: 8 }}
          >
            Cancel
          </button>
        </div>
      ) : fullAddress ? (
        <p className="muted small" style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          Deliver to: <b style={{ color: "var(--fg)" }}>{fullAddress}</b> ·{" "}
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
      ) : o.status !== "CANCELLED" && !missingBadges.includes("Address needed") ? (
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
      <details className="more" style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
        <summary style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>
          <T ta="கூடுதல் செயல்கள்">More actions</T>
        </summary>
        <div className="tools" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setEditOpen(true)}
            >
              <T ta="பொருட்கள் மாற்றம்">Edit order</T>
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
              <T ta="COD என உறுதிப்படுத்து">Confirm as cash on delivery</T>
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
              <T ta="COD ஆக மாற்றுக">Change to cash on delivery</T>
            </button>
          )}

          {!isPaid && !isCod && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("link", () => requestPayment(o.id))}
            >
              <T ta={o.paymentRequestedAt ? "இணைப்பை மீண்டும் அனுப்பு" : "கட்டண இணைப்பு அனுப்பு"}>
                {o.paymentRequestedAt ? "Send link again" : "Send payment link"}
              </T>
            </button>
          )}

          {!isPaid && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setPayModalOpen(true)}
            >
              <T ta="பணம் பதிவு செய்">Mark paid</T>
            </button>
          )}

          {hasPack && o.packedAt && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("unpack", () => setOrderPacked(o.id, false))}
            >
              <T ta="இன்னும் பேக் ஆகவில்லை">Not packed yet</T>
            </button>
          )}

          {hasDispatch && (o.status === "CONFIRMED" || o.status === "PAID") && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setDispatchOpen(true)}
            >
              <T ta="டெலிவரிக்கு அனுப்பு">Dispatch order</T>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => window.print()}
            >
              <T ta="பேக்கிங் ரசீது அச்சிடுக">Print packing slip</T>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn sm"
              onClick={() => window.print()}
            >
              <T ta="விலைப்பட்டியல் அச்சிடுக">Print invoice</T>
            </button>
          )}

          {o.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn sm danger"
              disabled={pending}
              onClick={handleCancelOrder}
            >
              <T ta="ஆர்டரை ரத்து செய்">Cancel order</T>
            </button>
          )}

          {o.status === "CANCELLED" && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("restore", () => setOrderStatus(o.id, "NEW"))}
            >
              <T ta="ஆர்டரை மீட்டெடு">Restore order</T>
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
            <h2><T ta="ஆர்டர் அனுப்புக">Dispatch order</T> #{refText}</h2>
            <div className="field">
              <label htmlFor="dsw"><T ta="டெலிவரி செய்யும் முறை">Delivery method</T></label>
              <select
                id="dsw"
                value={dispatchMethod}
                onChange={(e) => setDispatchMethod(e.target.value)}
              >
                <option value="Murugan (bike)">Murugan (bike)</option>
                <option value="Selvam (bike)">Selvam (bike)</option>
                <option value="Courier">{isTa ? "கொரியர் (Courier)" : "Courier"}</option>
                <option value="Customer pickup">{isTa ? "நேரடி வருகை (Customer pickup)" : "Customer pickup"}</option>
              </select>
            </div>
            {dispatchMethod === "Courier" && (
              <div className="field">
                <label htmlFor="dst"><T ta="டிராக்கிங் எண்">Tracking number</T></label>
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
              <T ta="வாடிக்கையாளருக்கு WhatsApp டெலிவரி செய்தி அனுப்பவும்">Send the customer a WhatsApp delivery update</T>
            </label>
            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setDispatchOpen(false)}
              >
                <T ta="ரத்து">Cancel</T>
              </button>
              <button className="btn primary" type="submit" disabled={pending}>
                <T ta="அனுப்புக">Dispatch</T>
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
            <h2><T ta="பணம் பதிவு செய்">Mark paid</T> #{refText}</h2>
            <p className="muted small">
              <T ta="Thabaal-க்கு வெளியே வாடிக்கையாளர் பணம் செலுத்திய போது இதைப் பயன்படுத்தவும்.">Use this when the customer paid you outside thabaal.</T>
            </p>
            <div className="formgrid">
              <div className="field">
                <label htmlFor="mpw"><T ta="எப்படி செலுத்தப்பட்டது?">How did they pay?</T></label>
                <select
                  id="mpw"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="upi">UPI (GPay, PhonePe, Paytm)</option>
                  <option value="cash">{isTa ? "ரொக்கம் (Cash)" : "Cash"}</option>
                  <option value="bank">{isTa ? "வங்கி பரிவர்த்தனை" : "Bank transfer"}</option>
                  <option value="card">{isTa ? "அட்டை (Card)" : "Card"}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mpa"><T ta="தொகை (₹)">Amount (₹)</T></label>
                <input
                  id="mpa"
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mpr"><T ta="குறிப்பு எண் (விருப்பத்தேர்வு)">Reference (optional)</T></label>
              <input
                id="mpr"
                type="text"
                placeholder={isTa ? "UPI எண் அல்லது குறிப்பு" : "UPI reference or note"}
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
                <T ta="ரத்து">Cancel</T>
              </button>
              <button className="btn primary" type="submit" disabled={pending}>
                <T ta="பணத்தைச் சேமி">Save payment</T>
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
            <h2><T ta="ரசீது">Receipt</T> #{refText}</h2>
            <div className="list">
              <div className="row">
                <div className="grow muted"><T ta="ஆர்டர்">Order</T></div>
                <b>#{refText}</b>
              </div>
              <div className="row">
                <div className="grow muted"><T ta="வாடிக்கையாளர்">Customer</T></div>
                <b>{o.customer.name}</b>
              </div>
              <div className="row">
                <div className="grow muted"><T ta="செலுத்திய முறை">Paid by</T></div>
                <b>{o.paymentMethod ? o.paymentMethod.toUpperCase() : "Online"}</b>
              </div>
              {o.paymentTxnId && (
                <div className="row" style={{ alignItems: "center" }}>
                  <div className="grow muted"><T ta="UPI / குறிப்பு எண்">UPI / Ref number</T></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b style={{ fontFamily: "var(--mono, monospace)", fontSize: 13 }}>{o.paymentTxnId}</b>
                    <button
                      type="button"
                      className="linkb"
                      onClick={handleCopyRef}
                      style={{ fontSize: 12, fontWeight: 600 }}
                      title="Copy UPI reference"
                    >
                      {refCopied ? (isTa ? "✓ நகலெடுக்கப்பட்டது" : "✓ Copied") : (isTa ? "நகலெடு" : "Copy")}
                    </button>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="grow muted"><T ta="நேரம்">When</T></div>
                <b>
                  {o.paidAt
                    ? fmtDate(new Date(o.paidAt), "EEE d MMM, h:mm a")
                    : (isTa ? "இன்று" : "Today")}
                </b>
              </div>
              <div
                className="row"
                style={{ borderTop: "2px solid var(--line)", marginTop: 6 }}
              >
                <div className="grow t"><T ta="தொகை">Amount</T></div>
                <b style={{ font: "600 20px var(--display)" }}>{inr(pricing.total)}</b>
              </div>
            </div>
            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setReceiptOpen(false)}
              >
                <T ta="மூடுக">Close</T>
              </button>
              <a
                className="btn primary"
                href={
                  o.customer.phone
                    ? `https://wa.me/${o.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Receipt for Order #${refText}: ${inr(pricing.total)} paid${o.paymentTxnId ? ` (Ref: ${o.paymentTxnId})` : ""}. Thank you!`,
                      )}`
                    : undefined
                }
                target="_blank"
                rel="noopener"
              >
                <T ta="WhatsApp-ல் அனுப்புக">Send on WhatsApp</T>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Items Sheet */}
      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={isTa ? `பொருட்கள் மாற்றம் · #${refText}` : `Edit items · #${refText}`}
        description={isTa ? "இந்த ஆர்டரின் பொருட்கள், எண்ணிக்கை மற்றும் விலைகளை மாற்றுக." : "Update products, quantities and pricing for this order."}
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
              <T ta="ரத்து">Cancel</T>
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              <T ta="பொருட்களைச் சேமி">Save items</T>
            </button>
          </div>
        </form>
      </Sheet>
    </article>
  );
}
