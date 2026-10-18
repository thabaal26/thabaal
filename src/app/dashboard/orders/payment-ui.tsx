"use client";

import { Banknote, CalendarClock, CreditCard, Landmark, QrCode, Smartphone, Truck, Undo2, type IconComponent } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { safeAction, toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { cn } from "@/lib/cn";
import { recordPayment, recordRefund } from "../actions/payments";

const rupees = (n: number) => `₹${(Math.round(Math.max(0, n) * 100) / 100).toLocaleString("en-IN")}`;

/** A row of choice cards: one tap picks, the picked one gets the brand ring. */
function Choices<T extends string>({
  label,
  value,
  onChange,
  options,
  cols = 2,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; icon: IconComponent; disabled?: boolean }[];
  cols?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-14 items-start gap-2.5 rounded-control border px-3 py-2.5 text-left transition disabled:opacity-40",
              on ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line bg-panel hover:border-line-2",
            )}
          >
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", on ? "text-brand-deep" : "text-muted")} />
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", on ? "text-brand-deep" : "text-ink")}>{o.label}</span>
              {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type PayMode = "request" | "cod" | "paid_cash" | "paid_upi" | "later";

/** New order: how the customer pays. */
export function PayModePicker({
  value,
  onChange,
  canRequest,
  total,
  reference,
  onReference,
}: {
  value: PayMode;
  onChange: (v: PayMode) => void;
  canRequest: boolean;
  total: number;
  reference: string;
  onReference: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2 text-sm font-semibold text-ink">How will they pay {rupees(total)}?</legend>
      <Choices
        label="Payment"
        value={value}
        onChange={onChange}
        cols={2}
        options={[
          ...(canRequest ? [{ value: "request" as const, label: "UPI on WhatsApp", hint: "Send “Review and pay” now", icon: Smartphone }] : []),
          { value: "cod", label: "Cash on delivery", hint: "Collect when delivered", icon: Truck },
          { value: "paid_upi", label: "Already paid · UPI", hint: "GPay, PhonePe, shop QR", icon: QrCode },
          { value: "paid_cash", label: "Already paid · cash", hint: "Paid at the shop", icon: Banknote },
          { value: "later", label: "Decide later", hint: canRequest ? "Ask for payment from the order" : "Record payment from the order", icon: CalendarClock },
        ]}
      />
      {value === "paid_upi" && (
        <Field id="no-utr" label="UPI reference (UTR)" hint="optional">
          <input className="field tabular" inputMode="numeric" maxLength={40} value={reference} placeholder="12-digit number from the payment" onChange={(e) => onReference(e.target.value)} />
        </Field>
      )}
    </fieldset>
  );
}

type Method = "upi" | "cash" | "cod" | "bank" | "card" | "other";

/**
 * Staff record money received: how, how much (full or a part), the UPI reference and who took the cash.
 * The customer is thanked on WhatsApp once the order is fully paid.
 */
export function RecordPaymentSheet({
  open,
  onClose,
  id,
  who,
  due,
  received,
  cod,
  reference: knownRef,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  who: string;
  due: number;
  /** Already received, as this screen shows it; the server refuses if it changed meanwhile (no double counting). */
  received?: number;
  cod: boolean;
  /** A reference already known (e.g. a UTR the customer sent in chat), filled in for checking. */
  reference?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<Method>(cod ? "cod" : "upi");
  const [amount, setAmount] = useState(String(due));
  const [reference, setReference] = useState(knownRef ?? "");
  const [by, setBy] = useState("");
  const [tell, setTell] = useState(true);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setMethod(cod ? "cod" : "upi");
      setAmount(String(due));
      setReference(knownRef ?? "");
      setBy("");
      setTell(true);
    }
  }
  const n = Number(amount);
  const part = n > 0 && n + 0.5 < due;
  const cashLike = method === "cash" || method === "cod";

  return (
    <Sheet open={open} onClose={onClose} title="Record payment" description={`${who} owes ${rupees(due)}. Record what you received; a smaller amount is kept as a part payment.`} className="sm:max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await safeAction(() => recordPayment(id, { method, amount: n, reference, collectedBy: by, tell, seenReceived: received ?? null }));
            toastResult(r);
            if (r.ok) {
              onClose();
              router.refresh();
            }
          });
        }}
      >
        <Choices
          label="Paid by"
          value={method}
          onChange={setMethod}
          cols={2}
          options={[
            { value: "upi", label: "UPI", hint: "GPay, PhonePe, QR", icon: QrCode },
            { value: cod ? "cod" : "cash", label: cod ? "Cash (COD)" : "Cash", hint: cod ? "Collected on delivery" : "Paid in hand", icon: Banknote },
            { value: "bank", label: "Bank", hint: "NEFT / IMPS", icon: Landmark },
            { value: "card", label: "Card", hint: "Swipe / link", icon: CreditCard },
            ...(cod ? [{ value: "cash" as const, label: "Cash", hint: "At the shop", icon: Banknote }] : []),
          ]}
        />
        <Field id={`amt-${id}`} label="Amount received" required help={part ? `Part payment: ${rupees(due - n)} will still be due.` : undefined}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>
            <input
              className="field tabular pl-7"
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>
        {!cashLike && (
          <Field id={`ref-${id}`} label={method === "upi" ? "UPI reference (UTR)" : "Reference"} hint="optional">
            <input className="field tabular" maxLength={60} value={reference} placeholder={method === "upi" ? "12-digit number" : "Transaction or receipt number"} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}
        {cashLike && (
          <Field id={`by-${id}`} label="Collected by" hint="optional">
            <input className="field" maxLength={80} value={by} placeholder="Ravi, shop counter…" onChange={(e) => setBy(e.target.value)} />
          </Field>
        )}
        {!part && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="size-4 rounded border-line text-brand" checked={tell} onChange={(e) => setTell(e.target.checked)} />
            Send a thank-you on WhatsApp
          </label>
        )}
        <Button type="submit" className="w-full" loading={pending} disabled={!(n > 0)}>
          {part ? `Record part payment ${rupees(n)}` : `Record ${n > 0 ? rupees(n) : ""} paid`}
        </Button>
      </form>
    </Sheet>
  );
}

/** Money given back for a cancelled order or a missing / damaged item. */
export function RefundSheet({
  open,
  onClose,
  id,
  who,
  refundable,
  suggested = refundable,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  who: string;
  refundable: number;
  /** Prefilled amount, e.g. just the extra when the order total went down after paying. */
  suggested?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState<"upi" | "cash" | "bank">("upi");
  const [note, setNote] = useState("");
  const [tell, setTell] = useState(true);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setAmount(String(suggested));
      setNote("");
      setTell(true);
    }
  }
  const n = Number(amount);
  return (
    <Sheet open={open} onClose={onClose} title="Record refund" description={`Up to ${rupees(refundable)} can be refunded to ${who}. Send the money first, then record it here.`} className="sm:max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await safeAction(() => recordRefund(id, { amount: n, method, note, tell }));
            toastResult(r);
            if (r.ok) {
              onClose();
              router.refresh();
            }
          });
        }}
      >
        <Choices
          label="Refunded by"
          value={method}
          onChange={setMethod}
          cols={3}
          options={[
            { value: "upi", label: "UPI", icon: QrCode },
            { value: "cash", label: "Cash", icon: Banknote },
            { value: "bank", label: "Bank", icon: Landmark },
          ]}
        />
        <Field id={`rf-${id}`} label="Amount refunded" required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>
            <input className="field tabular pl-7" type="number" min={1} max={refundable} step="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </Field>
        <Field id={`rn-${id}`} label="Reason" hint="optional">
          <input className="field" maxLength={120} value={note} placeholder="Order cancelled, item out of stock, damaged…" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4 rounded border-line text-brand" checked={tell} onChange={(e) => setTell(e.target.checked)} />
          Tell the customer on WhatsApp
        </label>
        <Button type="submit" className="w-full" loading={pending} disabled={!(n > 0)}>
          <Undo2 aria-hidden className="size-4 shrink-0" /> Record refund {n > 0 ? rupees(n) : ""}
        </Button>
      </form>
    </Sheet>
  );
}
