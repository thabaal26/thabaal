"use client";

import { MoreHorizontal, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Field, type ButtonVariant } from "@/components/ui";
import { DEFAULT_SHIPPING_FEE, getOrderPricing } from "@/lib/order-pricing";
import type { OrderItem } from "@/lib/orders";
import {
  notifyOrder,
  requestPayment,
  saveOrderNote,
  setOrderStatus,
  updateOrderItems,
  type DispatchDetails,
} from "../actions/orders";
import {
  blankOrderLine,
  OrderItemsEditor,
  type CatalogProductOption,
  type EditableOrderLine,
} from "./order-items-editor";

type Status = "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
type Result = { ok: boolean; message?: string };
type Step = { key: string; label: string; variant: ButtonVariant; run: () => void };

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
  note,
  customerNote = null,
  items = [],
  total = 0,
  canEdit,
  payment = null,
  catalogProducts = [],
  isLiveCatalog = false,
}: {
  id: string;
  who: string;
  status: Status;
  note: string | null;
  customerNote?: string | null;
  items?: OrderItem[];
  total?: number;
  canEdit: boolean;
  payment?: "first" | "again" | null;
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
  const [d, setD] = useState<DispatchDetails>({ eta: "today evening", by: "", phone: "", link: "" });
  const [editLines, setEditLines] = useState<EditableOrderLine[]>(() =>
    toEditableLines(items, catalogProducts),
  );
  const [editShipping, setEditShipping] = useState<number>(() => {
    const initial = getOrderPricing(items, total, { applyDefaultWhenEqual: true });
    return initial.shipping > 0 ? initial.shipping : DEFAULT_SHIPPING_FEE;
  });
  const [editCustNote, setEditCustNote] = useState(customerNote ?? "");

  if (!canEdit) return null;

  const openEditSheet = () => {
    setEditLines(toEditableLines(items, catalogProducts));
    const initial = getOrderPricing(items, total, { applyDefaultWhenEqual: true });
    setEditShipping(initial.shipping > 0 ? initial.shipping : DEFAULT_SHIPPING_FEE);
    setEditCustNote(customerNote ?? "");
    setMoreOpen(false);
    setEditOpen(true);
  };

  const editPricing = getOrderPricing(editLines, null, { customShippingFee: editShipping });
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

  // Every action that applies now, in the same order and with the same rules as always.
  const steps: Step[] = [];
  if (status === "NEW")
    steps.push({
      key: "confirm",
      label: "Confirm & message customer",
      variant: "primary",
      run: () => run("confirm", () => notifyOrder(id, "confirm")),
    });
  if (status === "CONFIRMED" || status === "PAID")
    steps.push({
      key: "dispatch",
      label: "Dispatch & message customer",
      variant: "primary",
      run: () => {
        setMoreOpen(false);
        setDispatchOpen(true);
      },
    });
  if (payment && (status === "NEW" || status === "CONFIRMED"))
    steps.push({
      key: "pay",
      label: payment === "again" ? "Send payment request again" : "Request payment (UPI)",
      variant: status === "CONFIRMED" && payment === "first" ? "primary" : "secondary",
      run: () => run("pay", () => requestPayment(id)),
    });
  if (!done)
    steps.push({
      key: "edit",
      label: total <= 0 ? "Set price / Customize" : "Customize / Edit items",
      variant: "secondary",
      run: openEditSheet,
    });
  if (status === "CONFIRMED")
    steps.push({
      key: "paid",
      label: "Mark paid",
      variant: "secondary",
      run: () => run("paid", () => setOrderStatus(id, "PAID")),
    });
  if (status === "DISPATCHED") {
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
  if (!done)
    steps.push({
      key: "cancel",
      label: "Cancel",
      variant: "danger",
      run: async () => {
        if (
          await confirmAction({
            message: "Cancel this order?",
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

  const [main, ...rest] = steps;
  const phoneMain = main && main.key !== "cancel" ? main : undefined;
  const phoneRest = phoneMain ? rest : steps;
  const noteChanged = text.trim() !== (note ?? "");
  const saveNote = () => run("note", () => saveOrderNote(id, text));

  return (
    <div className="mt-auto space-y-3 border-t border-line pt-3">
      {/* Phones: one big next step, quick customize button if needed, and the rest in a sheet. */}
      {note && (
        <p className="text-sm sm:hidden">
          <span className="text-muted">Team note: </span>
          {note}
        </p>
      )}
      <div className="flex gap-2 sm:hidden">
        {phoneMain && (
          <Button
            className="min-w-0 flex-1"
            variant={phoneMain.variant}
            disabled={pending}
            loading={busy === phoneMain.key}
            onClick={phoneMain.run}
          >
            <span className="truncate">{phoneMain.label}</span>
          </Button>
        )}
        {!done && phoneMain?.key !== "edit" && (
          <Button
            variant="secondary"
            icon
            className="shrink-0"
            aria-label={`Customize or edit items for ${who}'s order`}
            title="Customize or edit items"
            onClick={openEditSheet}
          >
            <PencilLine aria-hidden className="size-4" />
          </Button>
        )}
        <Button
          variant="secondary"
          icon={!!phoneMain}
          className={phoneMain ? "shrink-0" : "flex-1"}
          aria-label={phoneMain ? `More actions for ${who}'s order` : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal aria-hidden className="size-5" />
          {!phoneMain && "Order actions and note"}
        </Button>
      </div>

      {/* Larger screens: every action in a row, then the note. */}
      <div className="hidden flex-wrap gap-2 sm:flex">
        {steps.map((s) => (
          <Button
            key={s.key}
            size="sm"
            variant={s.variant}
            disabled={pending}
            loading={busy === s.key}
            onClick={s.run}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="hidden gap-2 sm:flex">
        <input
          className="field flex-1"
          aria-label={`Team note for ${who}'s order`}
          placeholder="Note: payment mode, address, delivery slot…"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          className="self-center"
          disabled={pending || !noteChanged}
          loading={busy === "note"}
          onClick={saveNote}
        >
          Save
        </Button>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={`Order for ${who}`}>
        <div className="space-y-5">
          {phoneRest.length > 0 && (
            <div className="grid gap-2">
              {phoneRest.map((s) => (
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
          <Button type="submit" className="w-full" disabled={pending} loading={busy === "dispatch"}>
            Dispatch & send message
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
