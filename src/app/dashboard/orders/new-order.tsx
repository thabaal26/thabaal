"use client";

import { Loader2, Plus, Trash2, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, Field } from "@/components/ui";
import { createOrder, lookupOrderCustomer } from "../actions/orders";

type Lookup = { phone: string; state: "checking" } | { phone: string; state: "existing"; id: string; name: string; optedOut: boolean } | { phone: string; state: "new" } | null;

type Line = { name: string; quantity: number; price: number };
const blank = (): Line => ({ name: "", quantity: 1, price: 0 });

/** For orders taken by phone, at the shop or on paper, so they can be confirmed and dispatched here too. */
export function NewOrder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const total = lines.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0);
  const edit = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === k ? { ...l, ...patch } : l)));

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
      else setLookup(r.existing ? { phone: digits, state: "existing", ...r.existing } : { phone: digits, state: "new" });
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
        <Plus aria-hidden className="size-4" /> <span>New<span className="max-sm:sr-only"> order</span></span>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New order" className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createOrder({ phone, name, items: lines, note });
              toastResult(r);
              if (r.ok) {
                setOpen(false);
                setPhone(""); setName(""); setNote(""); setLines([blank()]);
                router.refresh();
              }
            });
          }}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="no-phone" label="Customer phone" required>
                <input className="field" type="tel" inputMode="tel" autoComplete="off" value={phone} placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} />
              </Field>
              {found?.state === "existing" ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink">Name</p>
                  <p className="flex min-h-11 items-center truncate rounded-control border border-line bg-subtle px-3 text-sm text-ink-2 sm:min-h-10">{found.name}</p>
                </div>
              ) : (
                <Field id="no-name" label="Name" hint={isNew ? "new customer" : "if new"} required={isNew}>
                  <input className="field" autoCapitalize="words" value={name} placeholder="Priya Sharma" onChange={(e) => setName(e.target.value)} />
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
                  <Link href={`/dashboard/customers/${found.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
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

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-ink-2">Items</legend>
            {lines.map((l, k) => (
              <div key={k} className="grid grid-cols-[1fr_auto] gap-2 rounded-control bg-sunken p-2 sm:grid-cols-[1fr_4.5rem_6rem_auto] sm:bg-transparent sm:p-0">
                <input className="field col-span-1" required value={l.name} placeholder="Groundnut oil 1 L" aria-label={`Item ${k + 1}`} onChange={(e) => edit(k, { name: e.target.value })} />
                <button
                  type="button"
                  aria-label={`Remove item ${k + 1}`}
                  disabled={lines.length === 1}
                  className="row-span-2 grid size-11 place-items-center self-center rounded-control text-muted transition hover:bg-canvas hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:order-last sm:row-span-1 sm:size-10"
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== k))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <input className="field tabular" type="number" min={1} inputMode="numeric" value={l.quantity || ""} placeholder="Qty" aria-label={`Quantity of item ${k + 1}`} onChange={(e) => edit(k, { quantity: Number(e.target.value) })} />
                  <input className="field tabular" type="number" min={0} step="0.01" inputMode="decimal" value={l.price || ""} placeholder="₹ each" aria-label={`Price each of item ${k + 1}`} onChange={(e) => edit(k, { price: Number(e.target.value) })} />
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-brand-deep" onClick={() => setLines((ls) => [...ls, blank()])}>
              <Plus aria-hidden className="size-4" /> Add item
            </Button>
          </fieldset>

          <Field id="no-note" label="Address or note" hint="optional">
            <input className="field" autoComplete="street-address" value={note} placeholder="Delivery address, payment mode…" onChange={(e) => setNote(e.target.value)} />
          </Field>

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
