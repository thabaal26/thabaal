"use client";

import { Loader2, Plus, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, Field } from "@/components/ui";
import { createOrder, lookupOrderCustomer } from "../actions/orders";
import {
  blankOrderLine,
  OrderItemsEditor,
  type CatalogProductOption,
  type EditableOrderLine,
} from "./order-items-editor";

type Lookup =
  | { phone: string; state: "checking" }
  | { phone: string; state: "existing"; id: string; name: string; optedOut: boolean }
  | { phone: string; state: "new" }
  | null;

/** For orders taken by phone, at the shop or on paper, so they can be confirmed and dispatched here too. */
export function NewOrder({
  catalogProducts = [],
  catalogId = null,
  isLiveCatalog = false,
  hasPaymentConfig = false,
}: {
  catalogProducts?: CatalogProductOption[];
  catalogId?: string | null;
  isLiveCatalog?: boolean;
  hasPaymentConfig?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [requestPaymentNow, setRequestPaymentNow] = useState(false);
  const [lines, setLines] = useState<EditableOrderLine[]>(() => [
    blankOrderLine(),
  ]);
  const total = lines.reduce(
    (sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0,
  );

  // Look the phone up as it's typed (after a short pause), so the form can say whether the
  // order is for an existing customer or will add a new one.
  const [lookup, setLookup] = useState<Lookup>(null);
  const digits = phone.replace(/\D/g, "");
  useEffect(() => {
    if (digits.length < 10) return;
    let live = true;
    const t = setTimeout(async () => {
      setLookup({ phone: digits, state: "checking" });
      const r = await lookupOrderCustomer(digits);
      if (!live) return;
      if (!r.valid) setLookup(null);
      else
        setLookup(
          r.existing
            ? { phone: digits, state: "existing", ...r.existing }
            : { phone: digits, state: "new" },
        );
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [digits]);
  const found = lookup?.phone === digits && digits.length >= 10 ? lookup : null;
  const isNew = found?.state === "new";

  return (
    <>
      <Button onClick={() => setOpen(true)} className="max-sm:px-3.5">
        <Plus aria-hidden className="size-4" />{" "}
        <span>
          New<span className="max-sm:sr-only"> order</span>
        </span>
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New order"
        description="Select items from your WhatsApp Catalogue or enter custom items and prices."
        className="sm:max-w-xl"
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createOrder({
                phone,
                name,
                items: lines.map((l) => ({
                  id: l.custom ? undefined : l.id,
                  name: l.name,
                  quantity: l.quantity,
                  price: l.price,
                })),
                note,
                catalogId,
                requestPaymentNow: hasPaymentConfig && total > 0 && requestPaymentNow,
              });
              toastResult(r);
              if (r.ok) {
                setOpen(false);
                setPhone("");
                setName("");
                setNote("");
                setRequestPaymentNow(false);
                setLines([blankOrderLine()]);
                router.refresh();
              }
            });
          }}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="no-phone" label="Customer phone" required>
                <input
                  className="field"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  placeholder="98765 43210"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              {found?.state === "existing" ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink">Name</p>
                  <p className="flex min-h-11 items-center truncate rounded-control border border-line bg-subtle px-3 text-sm text-ink-2 sm:min-h-10">
                    {found.name}
                  </p>
                </div>
              ) : (
                <Field
                  id="no-name"
                  label="Name"
                  hint={isNew ? "new customer" : "if new"}
                  required={isNew}
                >
                  <input
                    className="field"
                    autoCapitalize="words"
                    value={name}
                    placeholder="Priya Sharma"
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <div aria-live="polite" className="min-h-6 text-sm">
              {found?.state === "checking" && (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" /> Checking customers…
                </span>
              )}
              {found?.state === "existing" && (
                <span className="inline-flex flex-wrap items-center gap-1.5 text-ink-2">
                  <UserCheck aria-hidden className="size-4 text-success" /> Existing customer:
                  <Link
                    href={`/dashboard/customers/${found.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {found.name}
                  </Link>
                  {found.optedOut && <Badge tone="red">Opted out of messages</Badge>}
                </span>
              )}
              {isNew && (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <UserPlus aria-hidden className="size-4 text-info" /> New customer: they&apos;ll be added to Customers with this order.
                </span>
              )}
            </div>
          </div>

          <OrderItemsEditor
            lines={lines}
            onChange={setLines}
            catalogProducts={catalogProducts}
            isLiveCatalog={isLiveCatalog}
          />

          <Field id="no-note" label="Address or note" hint="optional">
            <input
              className="field"
              autoComplete="street-address"
              value={note}
              placeholder="Delivery address, custom pack instructions, payment mode…"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {hasPaymentConfig && total > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-canvas/80 px-3.5 py-2.5 text-xs sm:text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-line text-brand focus:ring-brand"
                checked={requestPaymentNow}
                onChange={(e) => setRequestPaymentNow(e.target.checked)}
              />
              <span className="text-ink-2">
                <b className="font-medium text-ink">Send WhatsApp UPI payment request immediately</b>
                <span className="block text-xs text-muted">
                  Sends the itemized &ldquo;Review and pay&rdquo; card on WhatsApp right after saving.
                </span>
              </span>
            </label>
          )}

          <div className="flex items-center justify-between rounded-control bg-sunken px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular">₹{total.toLocaleString("en-IN")}</span>
          </div>
          <Button type="submit" className="w-full" loading={pending}>
            {isNew ? "Add order and save customer" : "Add order"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
