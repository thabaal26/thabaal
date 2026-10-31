"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useModalKeys } from "@/components/use-modal";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";
import { callWidgetReady, placeCall } from "@/components/call-widget";
import { safeAction, toastResult } from "@/components/toast";
import { fmtDate } from "@/lib/format";
import { canUndoPayment, dueOf, paymentState, receivedOf, slipPay } from "@/lib/payment-state";
import { openPrintablePdfWindow } from "./packing/print-button";
import { inr } from "../portal-format";
import { Clock } from "@/components/icons";
import { T, useLang } from "../portal-ui";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { orderRef, type OrderItem } from "@/lib/order-ref";
import {
  DEFAULT_FLOW,
  flowHas,
  flowPacks,
  flowSteps,
  isConfirmedOrLater,
  orderStage,
  RANK,
  stageRank,
  stepLabel,
  type OrderFlowKey,
} from "@/lib/order-flow";
import {
  createOrder,
  notifyOrder,
  requestPayment,
  saveOrderAddress,
  setOrderPacked,
  setOrderStatus,
  updateOrderItems,
} from "../actions/orders";
import { deliverCod, paymentHistory, setPaymentMethod, undoPayment, verifyPaymentClaim } from "../actions/payments";
import { RecordPaymentSheet, RefundSheet } from "./payment-ui";
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
  confirmedAt?: Date | string | null;
  dispatchedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  waMessageId?: string | null;
  paidAt: Date | string | null;
  paymentTxnId: string | null;
  paymentUtr?: string | null;
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
  /** WhatsApp address step: asked, and given or confirmed by the customer; a shared location's map link. */
  addressAskedAt?: Date | string | null;
  addressConfirmedAt?: Date | string | null;
  mapUrl?: string | null;
  items?: OrderItem[];
  customer: {
    id: string;
    name: string;
    phone: string;
    location: string | null;
    locationRaw?: string | null;
    client?: { name: string };
  };
  client?: { paymentConfig?: string | null; orderFlow?: string | null; codOn?: boolean };
};

/** Payment history rows in plain words (lib/payment-events.ts). */
const HISTORY_SOURCE: Record<string, string> = {
  meta_status: "WhatsApp payment",
  meta_bubble: "WhatsApp UPI message",
  customer_text: "Customer's message",
  screenshot: "Customer's screenshot",
  staff: "Staff",
  system: "Reminder rules",
};
const HISTORY_STATUS: Record<string, string> = {
  paid: "paid",
  failed: "failed",
  pending: "pending",
  claimed: "says paid",
  duplicate: "reference already used",
  recorded: "recorded",
  expired: "request expired",
  reference_added: "reference added",
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
  // How it goes out: the shop's own delivery person (name optional), a courier (tracking number) or pickup.
  const [dispatchMethod, setDispatchMethod] = useState<"own" | "Courier" | "Customer pickup">("own");
  const [deliveryBy, setDeliveryBy] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sendUpdate, setSendUpdate] = useState(true);
  const openDispatch = (method: "own" | "Courier" | "Customer pickup" = "own") => {
    setDispatchMethod(method);
    setDeliveryBy("");
    setTrackingNumber("");
    setSendUpdate(true);
    setDispatchOpen(true);
  };

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const [receiptOpen, setReceiptOpen] = useState(false);
  // The receipt's payment history (what WhatsApp, the customer and staff reported), loaded when it opens.
  const [history, setHistory] = useState<Awaited<ReturnType<typeof paymentHistory>> | null>(null);
  useEffect(() => {
    if (!receiptOpen) return;
    let live = true;
    paymentHistory(o.id)
      .then((h) => live && setHistory(h))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [receiptOpen, o.id]);
  // Both overlays behave as dialogs from the keyboard: focus in, Escape out, focus back to the button.
  useModalKeys(dispatchOpen, () => setDispatchOpen(false), `dsp-${o.id}`);
  useModalKeys(receiptOpen, () => setReceiptOpen(false), `rec-${o.id}`);
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
  // The order's current items as editable lines; rebuilt each time the edit sheet opens so it never shows stale items.
  const linesFromOrder = (): EditableOrderLine[] =>
    items.length > 0
      ? items.map((i) => ({
          id: i.id ?? "custom",
          name: i.name ?? i.id ?? "Item",
          quantity: i.quantity || 1,
          price: i.price || 0,
          custom: !catalogProducts.some((p) => p.retailerId === i.id || p.name === i.name),
        }))
      : [blankOrderLine()];
  const [editLines, setEditLines] = useState<EditableOrderLine[]>(linesFromOrder);

  const refText = orderRef(o);
  const pricing = getOrderPricing(items, o.total, {
    applyDefaultWhenEqual: true,
    discount: pointsDiscount(o),
  });

  // Edit sheet: the shipping charge the order has now (kept on save, editable), and the total the edit would give.
  const [editShipping, setEditShipping] = useState<number>(pricing.shipping);
  const [editSaving, setEditSaving] = useState(false);
  const openEdit = () => {
    setEditLines(linesFromOrder());
    setEditShipping(pricing.shipping);
    setEditOpen(true);
  };
  const editGross = getOrderPricing(editLines, null, { customShippingFee: editShipping });
  // Points already used stay on the order, cut back to ₹25 steps if the items now cost less (as the server does).
  const editPricing = getOrderPricing(editLines, null, {
    customShippingFee: editShipping,
    discount: Math.min(pricing.discount, Math.floor(editGross.subtotal / 25) * 25),
  });
  const editValid = editLines.some((l) => l.name.trim()) && editLines.every((l) => !l.name.trim() || (l.quantity > 0 && l.price >= 0));
  const saveEdit = () => {
    if (!editValid || editSaving) return;
    setEditSaving(true);
    startTransition(async () => {
      try {
        const res = await updateOrderItems(o.id, {
          items: editLines
            .filter((l) => l.name.trim())
            .map((l) => ({ id: l.custom ? undefined : l.id, name: l.name, quantity: l.quantity, price: l.price })),
          shippingFee: editShipping,
        });
        toastResult(res);
        if (res.ok) {
          setEditOpen(false);
          router.refresh();
        }
      } catch {
        // No connection or the server didn't answer: keep the sheet open with the changes, so nothing typed is lost.
        toastResult({ ok: false, message: isTa ? "சேமிக்க முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்." : "Couldn't save. Check the connection and try again." });
      } finally {
        setEditSaving(false);
      }
    });
  };

  // Money on this order, from the same helpers the server uses (part payments, claims, failures, refunds).
  const payFields = {
    status: o.status,
    total: o.total,
    paidAt: o.paidAt ? new Date(o.paidAt) : null,
    paymentMethod: o.paymentMethod ?? null,
    paidAmount: o.paidAmount ?? null,
    paymentRequestedAt: o.paymentRequestedAt ? new Date(o.paymentRequestedAt) : null,
    paymentClaimedAt: o.paymentClaimedAt ? new Date(o.paymentClaimedAt) : null,
    paymentFailedAt: o.paymentFailedAt ? new Date(o.paymentFailedAt) : null,
    refundedAt: o.refundedAt ? new Date(o.refundedAt) : null,
    refundAmount: o.refundAmount ?? null,
    internalNote: o.internalNote,
  };
  const payState = paymentState(payFields);
  const received = receivedOf(payFields);
  const due = dueOf(payFields);
  const refunded = o.refundAmount ?? 0;
  const refundable = Math.max(0, Math.round((received - refunded) * 100) / 100);
  // Paid more than the order now costs (items edited down after paying): that much is owed back.
  const overpaid = o.status === "CANCELLED" ? refundable : Math.max(0, Math.round((received - refunded - o.total) * 100) / 100);
  const canUndo = canUndoPayment({ ...payFields, paymentSource: o.paymentSource ?? null, paymentTxnId: o.paymentTxnId }) && refunded <= 0 && o.status !== "DISPATCHED" && o.status !== "DELIVERED";

  const isPaid = o.status === "PAID" || o.paidAt !== null;
  const isCod =
    o.paymentMethod === "cod" ||
    (o.internalNote && /cod|cash on delivery/i.test(o.internalNote));

  // Where the order is (lib/order-flow.ts): received › payment processing › payment verification › confirmed ›
  // dispatched › delivered. Confirmed only once payment is verified; cash on delivery skips the payment steps.
  const stage = orderStage(o);
  const rank = stageRank(o);
  const confirmed = isConfirmedOrLater(o);
  const preDispatch = o.status === "NEW" || o.status === "CONFIRMED" || o.status === "PAID";
  const steps = flowSteps(flow).filter((s) => !(isCod && !isPaid && (s.key === "PAYMENT" || s.key === "VERIFY")));
  const reached = steps.reduce((at, s, i) => (RANK[s.key] <= rank ? i : at), -1);

  const hasPack = flowPacks(flow);
  const hasDispatch = flowHas(flow, "DISPATCHED");
  const finishLabel = stepLabel(flow, "DELIVERED") ?? "Delivered";
  const confirmLabel = stepLabel(flow, "CONFIRMED") ?? "Order confirmed";

  // Source pill
  const source = o.waMessageId
    ? o.internalNote && /campaign/i.test(o.internalNote)
      ? { tone: "warn", label: "Campaign" }
      : { tone: "info", label: "Catalogue" }
    : { tone: "mute", label: "Manual entry" };

  // Payment pill & text
  let payPill: { tone: "ok" | "warn" | "info" | "mute" | "bad"; label: string };
  let payText: string;
  const notYet = isTa ? `${inr(due)} இன்னும் பெறப்படவில்லை` : `${inr(due)} not received yet`;
  switch (payState) {
    case "paid":
      payPill = { tone: "ok", label: isTa ? "செலுத்தப்பட்டது" : "Paid" };
      payText = isTa ? `${inr(received)} பெறப்பட்டது` : `${inr(received)} received`;
      break;
    case "part_paid":
      payPill = { tone: "warn", label: isTa ? "பகுதி செலுத்தப்பட்டது" : "Part paid" };
      payText = isTa ? `${inr(received)} பெறப்பட்டது · ${inr(due)} நிலுவை` : `${inr(received)} received · ${inr(due)} due`;
      break;
    case "cod_due":
      payPill = { tone: "info", label: isTa ? "டெலிவரியின் போது பணம்" : "Cash on delivery" };
      payText = isTa ? `டெலிவரியின் போது ${inr(due)} பெறவும்` : `Collect ${inr(due)} on delivery`;
      break;
    case "claimed":
      payPill = { tone: "warn", label: isTa ? "செலுத்தியதாகக் கூறுகிறார் · சரிபார்க்கவும்" : "Customer says paid · check" };
      payText = o.paymentClaimNote?.trim() || notYet;
      break;
    case "failed":
      payPill = { tone: "bad", label: isTa ? "கட்டணம் தோல்வி" : "Payment failed" };
      payText = o.paymentFailReason?.trim() ? `${notYet} · ${o.paymentFailReason.trim()}` : notYet;
      break;
    case "requested":
      payPill = { tone: "warn", label: isTa ? "கட்டண இணைப்பு அனுப்பப்பட்டது" : "Payment link sent" };
      payText = notYet;
      break;
    case "refund_due":
      payPill = { tone: "bad", label: isTa ? "திருப்பித் தர வேண்டும்" : "Refund due" };
      payText = isTa ? `${inr(refundable)} திருப்பித் தர வேண்டும்` : `${inr(refundable)} to give back`;
      break;
    case "refunded":
      payPill = { tone: "mute", label: isTa ? "திருப்பி அளிக்கப்பட்டது" : "Refunded" };
      payText = isTa ? `${inr(refunded)} திருப்பி அளிக்கப்பட்டது` : `${inr(refunded)} refunded`;
      break;
    case "none":
      payPill = { tone: "mute", label: isTa ? "கட்டணம் இல்லை" : "No payment" };
      payText = isTa ? "பணம் எதுவும் பெறப்படவில்லை" : "No money was received";
      break;
    default:
      payPill = { tone: "mute", label: isTa ? "கட்டணம் நிலுவை" : "Payment waiting" };
      payText = notYet;
  }
  if (o.status !== "CANCELLED" && overpaid > 0.5) payText += isTa ? ` · ${inr(overpaid)} திருப்பித் தர வேண்டும்` : ` · ${inr(overpaid)} to give back`;
  else if (o.status !== "CANCELLED" && refunded > 0) payText += isTa ? ` · ${inr(refunded)} திருப்பி அளிக்கப்பட்டது` : ` · ${inr(refunded)} refunded`;

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
  // Asked on WhatsApp and not answered yet: the payment message goes once they reply.
  const waitingAddress = o.status === "NEW" && !o.paidAt && Boolean(o.addressAskedAt) && !o.addressConfirmedAt;

  const missingBadges: string[] = [];
  if (missingAddress) missingBadges.push("Address needed");
  if (missingPhone) missingBadges.push("Phone number missing");

  // The main button is always the next step of the flow.
  let primaryAction: { key: string; label: string };
  if (o.status === "CANCELLED") primaryAction = { key: "restore", label: "Restore order" };
  else if (o.status === "DELIVERED") primaryAction = { key: "receipt", label: "View receipt" };
  else if (o.status === "DISPATCHED")
    primaryAction = isCod && !isPaid ? { key: "codin", label: `Delivered, cash received ${inr(due)}` } : { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` };
  else if (confirmed)
    primaryAction =
      hasPack && !o.packedAt
        ? { key: "pack", label: "Pack order" }
        : hasDispatch
          ? { key: "dispatch", label: flow === "courier" ? "Ship order" : "Dispatch order" }
          : { key: "deliver", label: `Mark ${finishLabel.toLowerCase()}` };
  else if (stage === "VERIFY") primaryAction = { key: "verify", label: "Payment received" };
  else if (isCod) primaryAction = { key: "confirm", label: "Confirm COD order" };
  else if (stage === "PAYMENT") primaryAction = { key: "remind", label: "Send reminder" };
  else primaryAction = { key: "link", label: "Send payment link" };

  const PRIMARY_ACTION_TA: Record<string, string> = {
    verify: "பணம் வந்தது",
    confirm: "COD ஆர்டரை உறுதி செய்",
    pack: "பேக் செய்",
    dispatch: flow === "courier" ? "கொரியரில் அனுப்பு" : "டெலிவரிக்கு அனுப்பு",
    deliver: "டெலிவரி ஆனதாகக் குறி",
    remind: "நினைவூட்டல் அனுப்பு",
    link: "கட்டண இணைப்பு அனுப்பு",
    codin: `டெலிவரி ஆனது, பணம் வரவு ${inr(due)}`,
    receipt: "ரசீது பார்க்க",
    restore: "ஆர்டரை மீட்டெடு",
  };
  const primaryActionLabel = isTa ? (PRIMARY_ACTION_TA[primaryAction.key] ?? primaryAction.label) : primaryAction.label;

  // Action runners
  // A dropped connection shows a message instead of breaking the page; onOk runs only when the server saved it.
  const runAction = (name: string, fn: () => Promise<{ ok: boolean; message?: string }>, onOk?: () => void) => {
    startTransition(async () => {
      const res = await safeAction(fn);
      toastResult(res);
      if (res.ok) onOk?.();
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
        openDispatch();
        break;
      case "verify":
        runAction("verify", () => verifyPaymentClaim(o.id, true));
        break;
      case "deliver":
        runAction("deliver", () => setOrderStatus(o.id, "DELIVERED"));
        break;
      case "codin":
        runAction("codin", () => deliverCod(o.id, { collected: true, amount: due }));
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

  // The dialog closes only once the server saved it, so a failed attempt can be retried without retyping.
  const submitDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const by = dispatchMethod === "own" ? deliveryBy.trim() : dispatchMethod;
    runAction(
      "dispatch",
      () =>
        sendUpdate
          ? notifyOrder(o.id, "dispatch", {
              by: by || undefined,
              link: dispatchMethod === "Courier" ? trackingNumber.trim() || undefined : undefined,
            })
          : setOrderStatus(o.id, "DISPATCHED"),
      () => setDispatchOpen(false),
    );
  };

  const handleUndoPayment = async () => {
    const ok = await confirmAction({
      title: isTa ? "கட்டணத்தை நீக்கவா?" : `Undo the payment on #${refText}?`,
      message: isTa
        ? `${inr(received)} பதிவு நீக்கப்படும், ஆர்டர் செலுத்தப்படாததாகக் காட்டப்படும்.`
        : `The ${inr(received)} recorded will be removed and the order shows as not paid again. Use this only for a payment recorded by mistake.`,
      confirmLabel: isTa ? "நீக்கு" : "Undo payment",
      danger: true,
    });
    if (ok) runAction("undo", () => undoPayment(o.id));
  };

  const handleNotReceived = async () => {
    const ok = await confirmAction({
      title: isTa ? "பணம் வரவில்லையா?" : "Payment not found?",
      message: isTa
        ? `${o.customer.name} அவர்களிடம் UPI குறிப்பு எண் (UTR) அல்லது ஸ்கிரீன்ஷாட் கேட்கப்படும்.`
        : `Mark ${o.customer.name}'s payment as not received? They'll be asked for the UPI reference (UTR) or a screenshot.`,
      confirmLabel: isTa ? "பணம் வரவில்லை" : "Not received",
    });
    if (ok) runAction("notpaid", () => verifyPaymentClaim(o.id, false));
  };

  const when = (d: Date | string | null | undefined) => (d ? fmtDate(new Date(d), "EEE d MMM, h:mm a") : null);

  // This order's packing slip, in the same printable layout as the Packing list.
  const printSlip = () => {
    const slip = slipPay(payFields, pricing.total);
    openPrintablePdfWindow(
      [
        {
          id: o.id,
          orderRef: refText,
          createdAt: new Date(o.createdAt).toISOString(),
          status: o.status,
          isPaid,
          payLabel: slip.label,
          collect: slip.collect,
          customerName: o.customer.name,
          customerPhone: o.customer.phone,
          area: o.customer.location ?? "",
          address: fullAddress,
          items: items.map((i) => ({ name: i.name ?? i.id, quantity: i.quantity || 1, price: i.price || 0 })),
          total: o.total,
          discount: pricing.discount,
          currency: o.currency,
          note: "",
        },
      ],
      items.map((i) => ({ name: i.name ?? i.id, quantity: i.quantity || 1 })),
      `Packing slip #${refText}`,
    );
  };

  // Rings the customer through WhatsApp calling when the shop has it set up; otherwise the phone's own dialler.
  const callCustomer = () => {
    if (callWidgetReady()) placeCall({ customerId: o.customer.id, name: o.customer.name });
    else if (!missingPhone) window.location.href = `tel:+${phoneClean}`;
    else toastResult({ ok: false, message: isTa ? "இந்த வாடிக்கையாளருக்குத் தொலைபேசி எண் இல்லை." : "This customer has no phone number." });
  };

  // A new order with the same items for the same customer. Nothing is sent to them; it starts as a new order.
  const copyOrder = async (kind: "repeat" | "duplicate") => {
    const ok = await confirmAction({
      title: isTa ? "புதிய ஆர்டர் சேர்க்கவா?" : kind === "repeat" ? `Repeat order #${refText}?` : `Duplicate order #${refText}?`,
      message: isTa
        ? `${o.customer.name} அவர்களுக்கு அதே பொருட்களுடன் (${inr(pricing.total)}) புதிய ஆர்டர் சேர்க்கப்படும். வாடிக்கையாளருக்கு எதுவும் அனுப்பப்படாது.`
        : `A new order with the same items (${inr(pricing.total)}) is added for ${o.customer.name}. Nothing is sent to the customer.`,
      confirmLabel: isTa ? "ஆர்டர் சேர்" : "Add order",
    });
    if (!ok) return;
    runAction(kind, () =>
      createOrder({
        phone: o.customer.phone,
        name: o.customer.name,
        items: items.map((i) => ({ id: i.id, name: i.name ?? i.id ?? "Item", quantity: i.quantity || 1, price: i.price || 0 })),
        shippingFee: pricing.shipping,
        address: fullAddress || undefined,
        syncCustomerAddress: false,
        paymentMode: isCod ? "cod" : "later",
      }),
    );
  };

  // Out for delivery but it didn't arrive: back to ready to dispatch, so it can go out again.
  const handleNotDelivered = async () => {
    const ok = await confirmAction({
      title: isTa ? "டெலிவரி ஆகவில்லையா?" : `#${refText} not delivered?`,
      message: isTa
        ? "ஆர்டர் மீண்டும் அனுப்பத் தயார் நிலைக்குத் திரும்பும்; மறுபடி அனுப்பலாம்."
        : "The order goes back to ready to dispatch, so you can send it out again.",
      confirmLabel: isTa ? "டெலிவரி ஆகவில்லை" : "Not delivered",
    });
    if (!ok) return;
    runAction("fail", async () => {
      const r = await setOrderStatus(o.id, isPaid ? "PAID" : "CONFIRMED");
      return r.ok ? { ok: true, message: isTa ? "டெலிவரி ஆகவில்லை எனக் குறிக்கப்பட்டது." : "Marked not delivered. It's back in ready to dispatch." } : r;
    });
  };

  // What was noted on the order when it was cancelled.
  const showWhyCancelled = () => {
    const why = o.internalNote?.trim();
    toastResult({
      ok: true,
      message: why
        ? (isTa ? `குறிப்பு: ${why}` : `Note on this order: ${why}`)
        : isTa
          ? "ரத்து செய்யும் போது காரணம் எதுவும் குறிக்கப்படவில்லை."
          : "No reason was noted when it was cancelled.",
    });
  };
  // The "packed" stage: ready to go out, so the dispatch details come next.
  const packedStage = hasDispatch && confirmed && preDispatch && primaryAction.key === "dispatch";
  const readyStage = confirmed && preDispatch && !packedStage;

  // Timeline: one line per step, with when it happened.
  const payRef = o.paymentUtr ? `UTR ${o.paymentUtr}` : o.paymentTxnId ? `Ref: ${o.paymentTxnId}` : "";
  const timelineEvents: [string, string | null][] = [
    ["Order received", fmtDate(new Date(o.createdAt), "EEE, d MMM yyyy, h:mm a")],
    ...(o.status === "CANCELLED"
      ? [["Cancelled", o.internalNote ? `Cancelled · ${o.internalNote}` : "Cancelled"] as [string, string | null]]
      : [
          ...(isCod && !isPaid
            ? [["Cash on delivery", "No online payment; collect the cash on delivery"] as [string, string | null]]
            : [
                [
                  "Payment processing",
                  o.paymentRequestedAt ? `Payment link sent ${when(o.paymentRequestedAt)}` : isPaid || (o.paidAmount ?? 0) > 0 ? "Paid directly" : null,
                ] as [string, string | null],
                [
                  "Payment verification",
                  isPaid
                    ? [when(o.paidAt), payRef].filter(Boolean).join(" · ") || "Done"
                    : o.paymentClaimedAt
                      ? `Customer says paid ${when(o.paymentClaimedAt) ?? ""} · check your account`.replace("  ", " ")
                      : null,
                ] as [string, string | null],
              ]),
          [confirmLabel, confirmed ? (when(isPaid ? (o.paidAt ?? o.confirmedAt) : o.confirmedAt) ?? "Done") : null] as [string, string | null],
          ...(hasPack ? [["Packed", o.packedAt ? when(o.packedAt) : rank >= RANK.DISPATCHED ? "Done" : null] as [string, string | null]] : []),
          ...(hasDispatch
            ? [[stepLabel(flow, "DISPATCHED") ?? "Dispatched", rank >= RANK.DISPATCHED ? when(o.dispatchedAt) ?? "Done" : null] as [string, string | null]]
            : []),
          [finishLabel, rank >= RANK.DELIVERED ? when(o.deliveredAt) ?? "Done" : null] as [string, string | null],
          ...(isCod && isPaid ? [["Cash received", [when(o.paidAt), o.collectedBy].filter(Boolean).join(" · ")] as [string, string | null]] : []),
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
          <h2 data-data style={{ fontSize: 17, margin: 0, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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

          {/* Received date & time timestamp */}
          <div
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--muted)",
            }}
          >
            <Clock className="size-3.5 shrink-0 opacity-70" />
            <span>{isTa ? "ஆர்டர் வந்தது:" : "Received:"}</span>
            <time
              dateTime={new Date(o.createdAt).toISOString()}
              style={{ fontWeight: 600, color: "var(--fg)" }}
            >
              {fmtDate(new Date(o.createdAt), "EEE, d MMM yyyy, h:mm a")}
            </time>
          </div>

          {/* Items shortlist & drop button */}
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.45 }}>
              {firstItemLabel}
              {remainingCount > 0 && (
                <span style={{ fontWeight: 500, marginLeft: 4 }}>
                  + {remainingCount} more
                </span>
              )}
            </span>

            {itemCount > 1 && (
              <button
                type="button"
                onClick={() => setShowItems(!showItems)}
                className="btn sm ghost itemsbtn"
                style={{
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
                <span>
                  <T ta={`${itemCount} பொருட்கள்`}>{`${itemCount} items`}</T>
                </span>
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
                  onClick={openEdit}
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
              <b className={i <= reached ? "on" : undefined}>
                {isTa ? f.ta : f.label}
                {f.key === "RECEIVED" && (
                  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4, fontSize: 11.5 }}>
                    ({fmtDate(new Date(o.createdAt), "d MMM, h:mm a")})
                  </span>
                )}
              </b>
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
          {payText}
        </span>

        {/* Dedicated UPI Reference Pill with 1-tap copy and clean visual breathing room */}
        {isPaid && o.paymentTxnId && (
          <button
            type="button"
            onClick={handleCopyRef}
            title={isTa ? "UPI குறிப்பு எண்ணை நகலெடு" : "Click to copy UPI reference"}
            className="max-sm:min-h-10"
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
            minHeight: 40,
            height: 40,
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
            minHeight: 40,
            height: 40,
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
        <button
          type="button"
          className="btn sm ghost"
          onClick={callCustomer}
          style={{
            minHeight: 40,
            height: 40,
            padding: "0 12px",
            fontSize: 13.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
          }}
        >
          <T ta="அழை">Call</T>
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setShowTimeline(!showTimeline)}
          style={{
            minHeight: 40,
            height: 40,
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
            style={{ minHeight: 40, height: 40, padding: "0 14px", borderRadius: 8 }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => setEditingAddress(false)}
            style={{ minHeight: 40, height: 40, padding: "0 12px", borderRadius: 8 }}
          >
            Cancel
          </button>
        </div>
      ) : waitingAddress ? (
        <p className="muted small" role="status" style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span aria-hidden style={{ width: 8, height: 8, marginTop: 7, borderRadius: 99, background: "var(--warn, #b45309)", flex: "none" }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <T ta="வாட்ஸ்அப்பில் முகவரிக்காகக் காத்திருக்கிறது. அவர்கள் பதிலளித்ததும் பணம் செலுத்தும் செய்தி தானாகச் செல்லும்.">
              Waiting for the customer&apos;s address on WhatsApp. The payment message goes by itself once they reply.
            </T>
            {fullAddress ? (
              <>
                {" "}
                <T ta="கோப்பில் உள்ளது:">On file:</T> <b style={{ color: "var(--fg)" }}>{fullAddress}</b>
              </>
            ) : null}{" "}
            ·{" "}
            <button
              type="button"
              className="linkb"
              onClick={() => {
                setAddressInput(fullAddress);
                setEditingAddress(true);
              }}
            >
              <T ta="நானே சேர்க்கிறேன்">Add it myself</T>
            </button>
          </span>
        </p>
      ) : fullAddress ? (
        <p className="muted small" style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <T ta="அனுப்பும் முகவரி:">Deliver to:</T> <b style={{ color: "var(--fg)" }}>{fullAddress}</b> ·{" "}
          {o.mapUrl && (
            <>
              <a className="linkb" href={o.mapUrl} target="_blank" rel="noopener noreferrer">
                <T ta="வரைபடம்">Map</T>
              </a>{" "}
              ·{" "}
            </>
          )}
          <button
            type="button"
            className="linkb"
            onClick={() => {
              setAddressInput(fullAddress);
              setEditingAddress(true);
            }}
          >
            <T>Change</T>
          </button>
        </p>
      ) : o.status !== "CANCELLED" && !missingBadges.includes("Address needed") ? (
        <p style={{ marginTop: 12 }}>
          <button
            type="button"
            className="linkb"
            onClick={() => setEditingAddress(true)}
          >
            <T>+ Add address</T>
          </button>
        </p>
      ) : null}

      {/* 8. More actions Accordion */}
      <details className="more" style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
        <summary style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>
          <T ta="கூடுதல் செயல்கள்">More actions</T>
        </summary>
        <div className="tools" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && o.status !== "CANCELLED" && o.status !== "DELIVERED" && (
            <button
              type="button"
              className="btn sm"
              onClick={openEdit}
            >
              <T ta="பொருட்கள் மாற்றம்">Edit order</T>
            </button>
          )}

          {preDispatch && !confirmed && !isCod && o.status === "NEW" && o.client?.codOn !== false && (
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

          {o.status === "CONFIRMED" && !isPaid && !isCod && o.client?.codOn !== false && (
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

          {!isPaid && !isCod && o.status !== "CANCELLED" && (
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

          {due > 0 && o.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setPayModalOpen(true)}
            >
              <T ta="பணம் பதிவு செய்">Mark paid</T>
            </button>
          )}

          {payState === "claimed" && (
            <button type="button" className="btn sm" disabled={pending} onClick={handleNotReceived}>
              <T ta="பணம் வரவில்லை">Payment not received</T>
            </button>
          )}

          {refundable > 0 && (o.status === "CANCELLED" || overpaid > 0.5 || payState === "paid" || payState === "part_paid") && (
            <button type="button" className="btn sm" onClick={() => setRefundOpen(true)}>
              <T ta="திருப்பி அளித்ததைப் பதிவு செய்">Record refund</T>
            </button>
          )}

          {canUndo && (
            <button type="button" className="btn sm" disabled={pending} onClick={handleUndoPayment}>
              <T ta="கட்டணப் பதிவை நீக்கு">Undo payment</T>
            </button>
          )}

          {hasPack && o.packedAt && (o.status === "NEW" || o.status === "CONFIRMED" || o.status === "PAID") && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() => runAction("unpack", () => setOrderPacked(o.id, false))}
            >
              <T ta="இன்னும் பேக் ஆகவில்லை">Not packed yet</T>
            </button>
          )}

          {hasDispatch && confirmed && preDispatch && !packedStage && (
            <button
              type="button"
              className="btn sm"
              onClick={() => openDispatch()}
            >
              <T ta="டெலிவரிக்கு அனுப்பு">Dispatch order</T>
            </button>
          )}

          {packedStage && (
            <button type="button" className="btn sm" onClick={() => openDispatch("Courier")}>
              <T ta="டிராக்கிங் எண் சேர்">Add tracking number</T>
            </button>
          )}

          {packedStage && (
            <button type="button" className="btn sm" onClick={() => openDispatch()}>
              <T ta="டெலிவரி முறையைத் தேர்வு செய்">Choose delivery method</T>
            </button>
          )}

          {(readyStage || packedStage) && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setAddressInput(fullAddress);
                setEditingAddress(true);
              }}
            >
              <T ta="முகவரி சேர் அல்லது மாற்று">Add or change address</T>
            </button>
          )}

          {readyStage && canEdit && (
            <button type="button" className="btn sm" onClick={openEdit}>
              <T ta="டெலிவரி கட்டணம் மாற்று">Edit delivery charge</T>
            </button>
          )}

          {o.status === "DISPATCHED" && (
            <button type="button" className="btn sm" onClick={() => openDispatch("Courier")}>
              <T ta="டிராக்கிங் புதுப்பி">Update tracking</T>
            </button>
          )}

          {o.status === "DISPATCHED" && (
            <button type="button" className="btn sm" disabled={pending} onClick={() => runAction("update", () => notifyOrder(o.id, "dispatch"))}>
              <T ta="டெலிவரி தகவல் அனுப்பு">Send delivery update</T>
            </button>
          )}

          {o.status === "DISPATCHED" && (
            <button type="button" className="btn sm" onClick={callCustomer}>
              <T ta="வாடிக்கையாளரைத் தொடர்பு கொள்">Contact customer</T>
            </button>
          )}

          {o.status === "DISPATCHED" && (
            <button type="button" className="btn sm" disabled={pending} onClick={handleNotDelivered}>
              <T ta="டெலிவரி ஆகவில்லை">Not delivered</T>
            </button>
          )}

          {o.status === "DELIVERED" && (
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() =>
                runAction("thanks", async () => {
                  const r = await notifyOrder(o.id, "deliver");
                  // Already delivered: when nothing could be sent, say so plainly.
                  return r.ok && /^Marked delivered\. No message sent/.test(r.message)
                    ? {
                        ok: false,
                        message: isTa
                          ? "நன்றி செய்தி அனுப்பப்படவில்லை: 24 மணி நேர சாளரம் மூடப்பட்டது, order_delivered டெம்ப்ளேட் இன்னும் அனுமதிக்கப்படவில்லை."
                          : "Thank-you not sent: the customer's 24-hour window has closed and the order_delivered template isn't approved yet.",
                      }
                    : r;
                })
              }
            >
              <T ta="நன்றி செய்தி அனுப்பு">Send thank-you message</T>
            </button>
          )}

          {o.status === "DELIVERED" && canEdit && items.length > 0 && (
            <button type="button" className="btn sm" disabled={pending} onClick={() => copyOrder("repeat")}>
              <T ta="மீண்டும் அதே ஆர்டர்">Create repeat order</T>
            </button>
          )}

          {canEdit && o.status !== "DISPATCHED" && o.status !== "DELIVERED" && o.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn sm"
              onClick={printSlip}
            >
              {packedStage ? <T ta="லேபிள் அச்சிடுக">Print label</T> : <T ta="பேக்கிங் ரசீது அச்சிடுக">Print packing slip</T>}
            </button>
          )}

          {canEdit && o.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn sm"
              onClick={() => setReceiptOpen(true)}
            >
              <T ta="விலைப்பட்டியல் அச்சிடுக">Print invoice</T>
            </button>
          )}

          {o.status !== "CANCELLED" && o.status !== "DISPATCHED" && o.status !== "DELIVERED" && (
            <button
              type="button"
              className="btn sm danger"
              disabled={pending}
              onClick={handleCancelOrder}
            >
              <T ta="ஆர்டரை ரத்து செய்">Cancel order</T>
            </button>
          )}

          {o.status === "CANCELLED" && canEdit && items.length > 0 && (
            <button type="button" className="btn sm" disabled={pending} onClick={() => copyOrder("duplicate")}>
              <T ta="ஆர்டர் நகல்">Duplicate order</T>
            </button>
          )}

          {o.status === "CANCELLED" && (
            <button type="button" className="btn sm" onClick={showWhyCancelled}>
              <T ta="ஏன் ரத்து செய்யப்பட்டது?">Why was it cancelled?</T>
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
            id={`dsp-${o.id}`}
            className="dlg card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`dsp-${o.id}-title`}
            style={{ width: "min(520px, calc(100vw - 32px))" }}
            onSubmit={submitDispatch}
          >
            <h2 id={`dsp-${o.id}-title`}>{o.status === "DISPATCHED" ? <T ta="டிராக்கிங் புதுப்பி">Update tracking</T> : <T ta="ஆர்டர் அனுப்புக">Dispatch order</T>} #{refText}</h2>
            <div className="field">
              <label htmlFor="dsw"><T ta="டெலிவரி செய்யும் முறை">Delivery method</T></label>
              <select
                id="dsw"
                value={dispatchMethod}
                onChange={(e) => setDispatchMethod(e.target.value as typeof dispatchMethod)}
              >
                <option value="own">{isTa ? "எங்கள் டெலிவரி நபர்" : "Our delivery person"}</option>
                <option value="Courier">{isTa ? "கொரியர் (Courier)" : "Courier"}</option>
                <option value="Customer pickup">{isTa ? "நேரடி வருகை (Customer pickup)" : "Customer pickup"}</option>
              </select>
            </div>
            {dispatchMethod === "own" && (
              <div className="field">
                <label htmlFor="dsb"><T ta="டெலிவரி செய்பவர் பெயர் (விருப்பத்தேர்வு)">Delivery person&apos;s name (optional)</T></label>
                <input
                  id="dsb"
                  type="text"
                  maxLength={60}
                  autoComplete="off"
                  value={deliveryBy}
                  onChange={(e) => setDeliveryBy(e.target.value)}
                />
              </div>
            )}
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

      {/* Record payment / refund: the shared sheets (part payments, who collected cash, double-tap safe). */}
      <RecordPaymentSheet
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        id={o.id}
        who={o.customer.name}
        due={due}
        received={received}
        cod={Boolean(isCod)}
      />
      <RefundSheet
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        id={o.id}
        who={o.customer.name}
        refundable={refundable}
        suggested={overpaid > 0.5 ? Math.min(overpaid, refundable) : refundable}
      />

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
          <div id={`rec-${o.id}`} className="dlg card" role="dialog" aria-modal="true" aria-labelledby={`rec-${o.id}-title`} tabIndex={-1} style={{ width: "min(520px, calc(100vw - 32px))" }}>
            <h2 id={`rec-${o.id}-title`}><T ta="ரசீது">Receipt</T> #{refText}</h2>
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
              {o.paymentUtr && (
                <div className="row" style={{ alignItems: "center" }}>
                  <div className="grow muted"><T ta="UPI குறிப்பு எண் (UTR)">UPI reference (UTR)</T></div>
                  <b style={{ fontFamily: "var(--mono, monospace)", fontSize: 13 }}>{o.paymentUtr}</b>
                </div>
              )}
              {o.paymentTxnId && o.paymentTxnId.replace(/^UTR-/i, "") !== o.paymentUtr && (
                <div className="row" style={{ alignItems: "center" }}>
                  <div className="grow muted"><T ta="பரிவர்த்தனை எண்">Transaction ID</T></div>
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
                    : (isTa ? "இன்னும் முழுமையாகச் செலுத்தப்படவில்லை" : "Not fully paid yet")}
                </b>
              </div>
              <div
                className="row"
                style={{ borderTop: "2px solid var(--line)", marginTop: 6 }}
              >
                <div className="grow t"><T ta="பெறப்பட்ட தொகை">Amount received</T></div>
                <b style={{ font: "600 20px var(--display)" }}>{inr(received)}</b>
              </div>
              {due > 0 && o.status !== "CANCELLED" && (
                <div className="row">
                  <div className="grow muted"><T ta="நிலுவை">Still due</T></div>
                  <b>{inr(due)}</b>
                </div>
              )}
              {refunded > 0 && (
                <div className="row">
                  <div className="grow muted"><T ta="திருப்பி அளிக்கப்பட்டது">Refunded</T></div>
                  <b>{inr(refunded)}</b>
                </div>
              )}
            </div>
            {history && history.length > 0 && (
              <details>
                <summary className="muted small" style={{ cursor: "pointer" }}>
                  <T ta="பணம் வரலாறு">Payment history</T> ({history.length})
                </summary>
                <div className="list" style={{ marginTop: 6 }}>
                  {history.map((h) => (
                    <div key={h.id} className="row" style={{ alignItems: "flex-start" }}>
                      <div className="grow">
                        <div className="t" style={{ fontSize: 13.5 }}>
                          {HISTORY_SOURCE[h.source] ?? h.source} · {HISTORY_STATUS[h.status] ?? h.status}
                          {h.amount != null ? ` · ${inr(h.amount)}` : ""}
                        </div>
                        <div className="muted small">
                          {[fmtDate(new Date(h.createdAt), "d MMM, h:mm a"), h.utr && `UTR ${h.utr}`, h.transactionId && `Txn ${h.transactionId}`, h.note].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
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
                        `Receipt for Order #${refText}: ${inr(received)} received${due > 0 && o.status !== "CANCELLED" ? `, ${inr(due)} still due` : ""}${o.paymentUtr ? ` (UPI ref: ${o.paymentUtr})` : o.paymentTxnId ? ` (Ref: ${o.paymentTxnId.replace(/^UTR-/i, "")})` : ""}. Thank you!`,
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
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditOpen(false)} disabled={editSaving}>
              <T ta="ரத்து">Cancel</T>
            </Button>
            <Button type="submit" form={`edit-items-${o.id}`} className="w-full sm:w-auto" loading={editSaving} disabled={!editValid || editSaving}>
              <T ta="பொருட்களைச் சேமி">Save items</T>
            </Button>
          </div>
        }
      >
        <form
          id={`edit-items-${o.id}`}
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
          className="space-y-4"
        >
          <OrderItemsEditor lines={editLines} catalogProducts={catalogProducts} onChange={setEditLines} />

          <div className="space-y-2 rounded-control border border-line bg-sunken px-4 py-3 text-sm">
            <div className="flex items-center justify-between text-xs text-ink-2">
              <span><T ta="பொருட்களின் கூட்டுத்தொகை">Items subtotal</T></span>
              <span className="tabular font-medium text-ink">{inr(editPricing.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
              <label htmlFor={`edit-ship-${o.id}`}><T ta="டெலிவரி கட்டணம்">Shipping charge</T></label>
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">₹</span>
                <input
                  id={`edit-ship-${o.id}`}
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  value={editShipping}
                  onChange={(e) => setEditShipping(Math.max(0, Number(e.target.value) || 0))}
                  className="field tabular h-9 min-h-9 pl-6 pr-2 text-right text-sm font-semibold"
                />
              </div>
            </div>
            {editPricing.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-ink-2">
                <span><T ta="லாயல்டி புள்ளிகள்">Loyalty points used</T> ({editPricing.discount * 2})</span>
                <span className="tabular font-medium text-success">−{inr(editPricing.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
              <span><T ta="புதிய மொத்தம்">New total</T></span>
              <span className="tabular text-base">{inr(editPricing.total)}</span>
            </div>
            {isPaid && editPricing.total !== pricing.total && (
              <p className="text-xs text-warning">
                <T ta="இந்த ஆர்டருக்கு ஏற்கனவே பணம் வந்துள்ளது. சேமித்த பின் மீதி அல்லது திருப்பித் தர வேண்டிய தொகை காட்டப்படும்.">
                  This order is already paid. After saving, the balance due or the refund owed will be shown.
                </T>
              </p>
            )}
          </div>
        </form>
      </Sheet>
    </article>
  );
}
