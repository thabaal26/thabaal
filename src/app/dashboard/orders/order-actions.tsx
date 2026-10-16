"use client";

import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Field, type ButtonVariant } from "@/components/ui";
import { DEFAULT_SHIPPING_FEE, getOrderPricing } from "@/lib/order-pricing";
import type { OrderItem } from "@/lib/orders";
import type { PayState } from "@/lib/payment-state";
import {
  notifyOrder,
  requestPayment,
  saveOrderNote,
  setOrderPacked,
  setOrderStatus,
  updateOrderItems,
  type DispatchDetails,
} from "../actions/orders";
import { deliverCod, setPaymentMethod, undoPayment, verifyPaymentClaim } from "../actions/payments";
import { RecordPaymentSheet, RefundSheet } from "./payment-ui";
import { DEFAULT_FLOW, flowHas, stepLabel, type OrderFlowKey } from "@/lib/order-flow";
import {
  blankOrderLine,
  OrderItemsEditor,
  type CatalogProductOption,
  type EditableOrderLine,
} from "./order-items-editor";

type Status = "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
type Result = { ok: boolean; message?: string };
type Step = { key: string; label: string; variant: ButtonVariant; run: () => void };
/** Where the money stands (see lib/payment-state), for the payment buttons. */
export type PayInfo = {
  state: PayState;
  cod: boolean;
  due: number;
  /** Paid and not yet given back. */
  refundable: number;
  /** Paid more than the (edited) total: the difference to give back. */
  overpaid: number;
  canUndo: boolean;
  hold: boolean;
};
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;

function toEditableLines(
  items: OrderItem[],
  catalogProducts: CatalogProductOption[],
): EditableOrderLine[] {
  if (!items.length) return [blankOrderLine()];
  return items.map((i) => {
    const byId = i.id ? catalogProducts.find((p) => p.retailerId === i.id) : undefined;
    const byName =
      !byId && i.name
        ? catalogProducts.find((p) => p.name.toLowerCase() === i.name!.toLowerCase())
        : undefined;
    const match = byId ?? byName;
    return {
      id: match?.retailerId ?? i.id,
      name: i.name ?? match?.name ?? i.id,
      quantity: i.quantity || 1,
      price: i.price || match?.priceAmount || 0,
      custom: !match,
    };
  });
}

/**
 * The next steps for an order: tell the customer, move it along, edit/customize items, and keep a private note.
 * Phones show the main next step plus an "order actions" sheet; larger screens show them all.
 * payment: whether a "Review and pay" request can go out, and if one already did.
 */
export function OrderActions({
  id,
  who,
  status,
  isPaid = false,
  note,
  customerNote = null,
  items = [],
  total = 0,
  discount = 0,
  canEdit,
  payment = null,
  pay = null,
  catalogProducts = [],
  isLiveCatalog = false,
  customerId,
  timeline,
  flow = DEFAULT_FLOW,
  packed = false,
}: {
  /** The client's order steps (Settings → Order steps): which buttons move the order along. */
  flow?: OrderFlowKey;
  /** Marked packed already (the "Packed" step). */
  packed?: boolean;
  /** For the Open chat and Call buttons. */
  customerId?: string;
  /** The order's timeline, shown when "Timeline" is tapped. */
  timeline?: React.ReactNode;
  id: string;
  who: string;
  status: Status;
  isPaid?: boolean;
  note: string | null;
  customerNote?: string | null;
  items?: OrderItem[];
  total?: number;
  /** Loyalty points discount already taken off `total`. */
  discount?: number;
  canEdit: boolean;
  payment?: "first" | "again" | null;
  pay?: PayInfo | null;
  catalogProducts?: CatalogProductOption[];
  isLiveCatalog?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState(note ?? "");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [d, setD] = useState<DispatchDetails>({ eta: "today evening", by: "", phone: "", link: "" });
  const [editLines, setEditLines] = useState<EditableOrderLine[]>(() =>
    toEditableLines(items, catalogProducts),
  );
  const [editShipping, setEditShipping] = useState<number>(() => {
    const initial = getOrderPricing(items, total, { applyDefaultWhenEqual: true, discount });
    return initial.shipping > 0 ? initial.shipping : DEFAULT_SHIPPING_FEE;
  });
  const [editCustNote, setEditCustNote] = useState(customerNote ?? "");

  if (!canEdit) return null;

  const openEditSheet = () => {
    setEditLines(toEditableLines(items, catalogProducts));
    const initial = getOrderPricing(items, total, { applyDefaultWhenEqual: true, discount });
    setEditShipping(initial.shipping > 0 ? initial.shipping : DEFAULT_SHIPPING_FEE);
    setEditCustNote(customerNote ?? "");
    setMoreOpen(false);
    setEditOpen(true);
  };

  // The points discount stays on the order when items change (cut back if the items now cost less).
  const editGross = getOrderPricing(editLines, null, { customShippingFee: editShipping });
  const editPricing = getOrderPricing(editLines, null, { customShippingFee: editShipping, discount: Math.min(discount, Math.floor(editGross.subtotal / 25) * 25) });
  const editTotal = editPricing.total;

  const run = (key: string, fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      setBusy(key);
      const r = await fn();
      toastResult(r);
      after?.(r);
      setBusy(null);
      router.refresh();
    });
  const done = status === "DELIVERED" || status === "CANCELLED";

  const cod = Boolean(pay?.cod);
  const due = pay?.due ?? 0;
  const open = (pay ? due > 0 : !isPaid) && status !== "CANCELLED";
  const sheet = (fn: (v: boolean) => void) => () => {
    setMoreOpen(false);
    fn(true);
  };

  // Every action that applies now, most useful first (the first one is the big button on phones).
  const steps: Step[] = [];
  if (pay?.state === "claimed" && open) {
    steps.push({
      key: "verify",
      label: "Payment received",
      variant: "primary",
      run: () => run("verify", () => verifyPaymentClaim(id, true)),
    });
    steps.push({
      key: "notpaid",
      label: "Not received",
      variant: "secondary",
      run: async () => {
        if (
          await confirmAction({
            title: "Payment not found?",
            message: `Mark ${who}'s payment as not received? They'll be asked for the UPI reference (UTR) or a screenshot.`,
            confirmLabel: "Not received",
          })
        )
          run("notpaid", () => verifyPaymentClaim(id, false));
      },
    });
  }
  const hasConfirm = flowHas(flow, "CONFIRMED");
  const hasPack = flowHas(flow, "PACKED");
  const hasDispatch = flowHas(flow, "DISPATCHED");
  const finishLabel = stepLabel(flow, "DELIVERED") ?? "Delivered";
  if (status === "NEW" && hasConfirm)
    steps.push({
      key: "confirm",
      label: "Confirm & message customer",
      variant: "primary",
      run: () => run("confirm", () => notifyOrder(id, "confirm")),
    });
  if (status === "NEW" && hasConfirm && hasDispatch && open && !cod)
    steps.push({
      key: "codconfirm",
      label: "Cash on delivery & confirm",
      variant: "secondary",
      run: () => run("codconfirm", () => setPaymentMethod(id, "cod", { confirm: true })),
    });
  if (hasPack && !packed && (status === "CONFIRMED" || status === "PAID"))
    steps.push({
      key: "pack",
      label: "Mark packed",
      variant: pay?.hold ? "secondary" : "primary",
      run: () => run("pack", () => setOrderPacked(id, true)),
    });
  if (hasPack && packed && (status === "NEW" || status === "CONFIRMED" || status === "PAID"))
    steps.push({
      key: "unpack",
      label: "Not packed yet",
      variant: "ghost",
      run: () => run("unpack", () => setOrderPacked(id, false)),
    });
  // Pickup and service orders finish at the counter: no dispatch, one tap to close.
  if (!hasDispatch && (status === "NEW" || status === "CONFIRMED" || status === "PAID"))
    steps.push({
      key: "finish",
      label: flow === "pickup" ? "Collected by customer" : `Mark ${finishLabel.toLowerCase()}`,
      variant: !open || flow === "service" ? "primary" : "secondary",
      run: async () => {
        if (
          open &&
          !(await confirmAction({
            title: "Not paid yet",
            message: `${who} hasn't paid ${inr(due)} yet. Close the order anyway? You can still record the payment later.`,
            confirmLabel: flow === "pickup" ? "Mark collected" : "Mark done",
          }))
        )
          return;
        run("finish", () => setOrderStatus(id, "DELIVERED"));
      },
    });
  if (hasDispatch && (status === "CONFIRMED" || status === "PAID"))
    steps.push({
      key: "dispatch",
      label: flow === "courier" ? "Ship & message customer" : "Dispatch & message customer",
      variant: pay?.hold || (hasPack && !packed) ? "secondary" : "primary",
      run: async () => {
        if (
          pay?.hold &&
          !(await confirmAction({
            title: "Not paid yet",
            message: `${who} hasn't paid ${inr(due)} yet${pay.state === "claimed" ? " (they say they did: check first)" : ""}. Dispatch anyway? Or set it as cash on delivery.`,
            confirmLabel: "Dispatch anyway",
          }))
        )
          return;
        setMoreOpen(false);
        setDispatchOpen(true);
      },
    });
  if (status === "CONFIRMED" && hasDispatch && open && !cod)
    steps.push({
      key: "cod",
      label: "Cash on delivery",
      variant: "secondary",
      run: () => run("cod", () => setPaymentMethod(id, "cod")),
    });
  if (payment && (status === "NEW" || status === "CONFIRMED"))
    steps.push({
      key: "pay",
      label: payment === "again" ? "Send payment request again" : "Request payment (UPI)",
      // Confirmed but not paid: asking for the money is the next step.
      variant: status === "CONFIRMED" && (payment === "first" || pay?.hold) ? "primary" : "secondary",
      run: () => run("pay", () => requestPayment(id)),
    });
  if (status === "DISPATCHED" && cod && open) {
    steps.push({
      key: "codpaid",
      label: `Delivered & ${inr(due)} cash collected`,
      variant: "primary",
      run: () => run("codpaid", () => deliverCod(id, { collected: true })),
    });
    steps.push({
      key: "codlater",
      label: "Delivered, cash not collected",
      variant: "secondary",
      run: () => run("codlater", () => deliverCod(id, { collected: false })),
    });
  } else if (status === "DISPATCHED") {
    steps.push({
      key: "deliver",
      label: "Delivered & thank customer",
      variant: "primary",
      run: () => run("deliver", () => notifyOrder(id, "deliver")),
    });
    steps.push({
      key: "delivered",
      label: "Mark delivered only",
      variant: "secondary",
      run: () => run("delivered", () => setOrderStatus(id, "DELIVERED")),
    });
  }
  if (open)
    steps.push({
      key: "record",
      label: status === "DELIVERED" ? `Record ${inr(due)} received` : "Record payment",
      // At a counter, taking the money is the next step.
      variant: status === "DELIVERED" || pay?.state === "part_paid" || flow === "pickup" ? "primary" : "secondary",
      run: sheet(setPayOpen),
    });
  if (pay && pay.refundable > 0 && (pay.state === "refund_due" || pay.overpaid >= 1 || status === "DELIVERED" || status === "CANCELLED"))
    steps.push({
      key: "refund",
      label: pay.overpaid >= 1 ? `Refund extra ${inr(pay.overpaid)}` : "Record refund",
      variant: pay.state === "refund_due" || pay.overpaid >= 1 ? "primary" : "secondary",
      run: sheet(setRefundOpen),
    });
  if (!done)
    steps.push({
      key: "edit",
      label: total <= 0 ? "Set price / Customize" : "Customize / Edit items",
      variant: "secondary",
      run: openEditSheet,
    });
  if (cod && open && (status === "NEW" || status === "CONFIRMED"))
    steps.push({
      key: "online",
      label: "Pay online instead",
      variant: "ghost",
      run: () => run("online", () => setPaymentMethod(id, "upi")),
    });
  if (pay?.canUndo && status !== "CANCELLED")
    steps.push({
      key: "undo",
      label: "Undo payment",
      variant: "ghost",
      run: async () => {
        if (
          await confirmAction({
            title: "Undo payment?",
            message: `Remove the payment recorded on ${who}'s order? Use this only if it was recorded by mistake; for money given back, record a refund.`,
            confirmLabel: "Undo payment",
            danger: true,
          })
        )
          run("undo", () => undoPayment(id));
      },
    });
  if (!done)
    steps.push({
      key: "cancel",
      label: "Cancel",
      variant: "danger",
      run: async () => {
        if (
          await confirmAction({
            message: pay && pay.refundable > 0 ? `Cancel this order? ${inr(pay.refundable)} was paid, so it will show as refund due.` : "Cancel this order?",
            confirmLabel: "Cancel order",
            danger: true,
          })
        )
          run("cancel", () => setOrderStatus(id, "CANCELLED"));
      },
    });
  if (status === "CANCELLED")
    steps.push({
      key: "reopen",
      label: "Reopen",
      variant: "secondary",
      run: () => run("reopen", () => setOrderStatus(id, "NEW")),
    });

  // The main next step (a primary one) leads, followed by at most one secondary action on desktop.
  steps.sort((a, b) => Number(b.variant === "primary") - Number(a.variant === "primary"));
  const [main, ...rest] = steps;
  const primaryStep = main && main.key !== "cancel" ? main : undefined;
  const restSteps = primaryStep ? rest : steps;
  const secondaryStep = restSteps.find((s) => s.key !== "cancel" && s.key !== "edit");
  const noteChanged = text.trim() !== (note ?? "");
  const saveNote = () => run("note", () => saveOrderNote(id, text));

  return (
    <div>
      <div className="tools" style={{ marginTop: 14 }}>
        {primaryStep && (
          <button type="button" className="btn primary" disabled={pending} aria-busy={busy === primaryStep.key} onClick={primaryStep.run}>
            {busy === primaryStep.key ? "Working…" : primaryStep.label}
          </button>
        )}
        {secondaryStep && (
          <button type="button" className={`btn sm${secondaryStep.variant === "danger" ? " danger" : ""}`} disabled={pending} aria-busy={busy === secondaryStep.key} onClick={secondaryStep.run}>
            {busy === secondaryStep.key ? "Working…" : secondaryStep.label}
          </button>
        )}
        {customerId && (
          <>
            <Link className="btn sm ghost" href={`/dashboard/replies?r=${customerId}`}>
              Open chat
            </Link>
            <Link className="btn sm ghost" href={`/dashboard/customers/${customerId}#call`}>
              Call
            </Link>
          </>
        )}
        {timeline && (
          <button type="button" className="btn sm ghost" aria-expanded={showTimeline} onClick={() => setShowTimeline((v) => !v)}>
            {showTimeline ? "Hide timeline" : "Timeline"}
          </button>
        )}
      </div>

      {showTimeline && timeline}

      {note && (
        <p className="muted small" style={{ marginTop: 12 }}>
          Team note: {note}{" "}
          <button type="button" className="linkb" onClick={() => setMoreOpen(true)}>
            Edit
          </button>
        </p>
      )}

      <details className="more">
        <summary>More actions</summary>
        <div className="tools" style={{ marginTop: 10 }}>
          {restSteps
            .filter((s) => s.key !== secondaryStep?.key)
            .map((s) => (
              <button key={s.key} type="button" className={`btn sm${s.variant === "danger" ? " danger" : ""}`} disabled={pending} aria-busy={busy === s.key} onClick={s.run}>
                {busy === s.key ? "Working…" : s.label}
              </button>
            ))}
          {!done && !restSteps.some((s) => s.key === "edit") && primaryStep?.key !== "edit" && (
            <button type="button" className="btn sm" onClick={openEditSheet}>
              Edit items
            </button>
          )}
          <button type="button" className="btn sm" onClick={() => setMoreOpen(true)}>
            {note ? "Edit team note" : "Add team note"}
          </button>
        </div>
      </details>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={`Order for ${who}`}>
        <div className="space-y-5">
          {restSteps.length > 0 && (
            <div className="grid gap-2">
              {restSteps.map((s) => (
                <Button
                  key={s.key}
                  variant={s.variant}
                  className="w-full"
                  disabled={pending}
                  loading={busy === s.key}
                  onClick={s.run}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveNote();
            }}
          >
            <Field id={`note-${id}`} label="Team note" hint="only your team sees it">
              <textarea
                className="field"
                placeholder="Payment mode, address, delivery slot…"
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={pending || !noteChanged}
              loading={busy === "note"}
            >
              Save note
            </Button>
          </form>
        </div>
      </Sheet>

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Customize order for ${who}`}
        description="Pick items from your live WhatsApp Catalogue or enter custom options, quantities and prices."
        className="sm:max-w-xl"
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              "edit",
              () =>
                updateOrderItems(id, {
                  items: editLines.map((l) => ({
                    id: l.custom ? undefined : l.id,
                    name: l.name,
                    quantity: l.quantity,
                    price: l.price,
                  })),
                  shippingFee: editShipping,
                  note: editCustNote,
                }),
              (r) => r.ok && setEditOpen(false),
            );
          }}
        >
          <OrderItemsEditor
            lines={editLines}
            onChange={setEditLines}
            catalogProducts={catalogProducts}
            isLiveCatalog={isLiveCatalog}
          />

          <Field id={`cust-note-${id}`} label="Customer note or delivery address" hint="optional">
            <input
              className="field"
              value={editCustNote}
              placeholder="Delivery address, custom pack instructions…"
              onChange={(e) => setEditCustNote(e.target.value)}
            />
          </Field>

          <div className="space-y-2 rounded-control border border-line bg-sunken px-4 py-3 text-sm">
            <div className="flex items-center justify-between text-xs text-ink-2">
              <span>Items subtotal</span>
              <span className="tabular font-medium">₹{editPricing.subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
              <label htmlFor={`edit-ship-${id}`} className="flex items-center gap-1.5">
                <span>Shipping charge</span>
                <span className="rounded bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold text-brand-deep">
                  ₹{DEFAULT_SHIPPING_FEE} standard
                </span>
              </label>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                  ₹
                </span>
                <input
                  id={`edit-ship-${id}`}
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  value={editShipping}
                  onChange={(e) => setEditShipping(Math.max(0, Number(e.target.value) || 0))}
                  className="field tabular h-8 min-h-8 pl-6 pr-2 text-right text-xs font-semibold"
                />
              </div>
            </div>
            {editPricing.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-ink-2">
                <span>Loyalty points used ({editPricing.discount * 2} pts)</span>
                <span className="tabular font-medium text-success">−₹{editPricing.discount.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Updated Final Total</span>
              <span className="tabular text-base">₹{editTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending} loading={busy === "edit"}>
            Save order items &amp; total
          </Button>
        </form>
      </Sheet>

      <RecordPaymentSheet open={payOpen} onClose={() => setPayOpen(false)} id={id} who={who} due={due} cod={cod} />
      {pay && pay.refundable > 0 && <RefundSheet open={refundOpen} onClose={() => setRefundOpen(false)} id={id} who={who} refundable={pay.refundable} suggested={pay.overpaid >= 1 ? pay.overpaid : pay.refundable} />}

      <Sheet
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="Dispatch order"
        description="The customer gets these details on WhatsApp, and they're saved in this order's note."
        className="sm:max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // The sheet stays open until the message has gone, so a problem can be fixed and retried.
            run("dispatch", () => notifyOrder(id, "dispatch", d), (r) => r.ok && setDispatchOpen(false));
          }}
        >
          <Field id={`eta-${id}`} label="Reaches them by" required>
            <input
              className="field"
              value={d.eta}
              placeholder="today evening, tomorrow 11 AM…"
              onChange={(e) => setD({ ...d, eta: e.target.value })}
            />
          </Field>
          <Field id={`by-${id}`} label="Delivery person or courier" hint="optional">
            <input
              className="field"
              value={d.by}
              placeholder="Ravi, DTDC, Porter, etc."
              onChange={(e) => setD({ ...d, by: e.target.value })}
            />
          </Field>
          <Field id={`tr-${id}`} label="Tracking link or number" hint="optional">
            <input
              className="field"
              value={d.link}
              placeholder="Courier tracking link or AWB number"
              onChange={(e) => setD({ ...d, link: e.target.value })}
            />
          </Field>
          {open && due > 0 && (
            <p className="rounded-control border border-line bg-sunken px-3 py-2 text-xs text-ink-2">
              {cod
                ? `Cash on delivery: the message asks ${who} to keep ${inr(due)} ready.`
                : `Not paid yet: the message tells ${who} the amount to pay (${inr(due)}).`}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending} loading={busy === "dispatch"}>
            Dispatch & send message
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
