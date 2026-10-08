"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { createOrder } from "../actions/orders";

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

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New order
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New order" className="sm:max-w-lg">
        <form
          className="space-y-4"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="no-phone">Customer phone</Label>
              <input id="no-phone" className="field" required inputMode="tel" value={phone} placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="no-name" hint="if new">Name</Label>
              <input id="no-name" className="field" value={name} placeholder="Priya Sharma" onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((l, k) => (
              <div key={k} className="grid grid-cols-[1fr_4rem_5.5rem_auto] gap-2">
                <input className="field" required value={l.name} placeholder="Groundnut oil 1 L" aria-label="Item" onChange={(e) => edit(k, { name: e.target.value })} />
                <input className="field tabular" type="number" min={1} inputMode="numeric" value={l.quantity || ""} aria-label="Quantity" onChange={(e) => edit(k, { quantity: Number(e.target.value) })} />
                <input className="field tabular" type="number" min={0} step="0.01" inputMode="decimal" value={l.price || ""} placeholder="₹ each" aria-label="Price each" onChange={(e) => edit(k, { price: Number(e.target.value) })} />
                <button type="button" aria-label="Remove item" disabled={lines.length === 1} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-canvas disabled:opacity-30" onClick={() => setLines((ls) => ls.filter((_, i) => i !== k))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" className="text-sm font-medium text-brand-deep" onClick={() => setLines((ls) => [...ls, blank()])}>
              + Add item
            </button>
          </div>

          <div>
            <Label htmlFor="no-note" hint="optional">Address or note</Label>
            <input id="no-note" className="field" value={note} placeholder="Delivery address, payment mode…" onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular">₹{total.toLocaleString("en-IN")}</span>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>Add order</Button>
        </form>
      </Sheet>
    </>
  );
}
