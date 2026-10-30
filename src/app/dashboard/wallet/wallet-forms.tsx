"use client";

import { useRouter } from "next/navigation";
import QR from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import { Button, CheckRow, Field } from "@/components/ui";
import { CATEGORY_NAMES, chargeFor, META_RATES, WALLET_CATEGORIES } from "@/lib/wallet-rates";
import { adjustWallet, decideRecharge, requestRecharge, saveWalletPayment, saveWalletSettings } from "../actions/wallet";
import { rzpConfirm, rzpStartRecharge } from "../actions/razorpay";
import { openRazorpay } from "@/components/razorpay-checkout";

type Result = { ok: boolean; message?: string; errors?: string[] };

function useSubmit() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, submit };
}

const QUICK = [500, 1000, 2000, 5000];

/** Pay by UPI (QR or ID), then send the transaction ID so Thabaal can confirm it. */
export function RechargeForm({ upiId, payee, clientName, online = false }: { upiId: string | null; payee: string | null; clientName: string; online?: boolean }) {
  const [amount, setAmount] = useState("1000");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const { pending, submit } = useSubmit();
  // Online (Razorpay) first when it is set up; paying by UPI and sending the reference stays as the backup.
  const [manual, setManual] = useState(!online);
  const payOnline = () =>
    submit(async () => {
      const start = await rzpStartRecharge(value);
      if (!start.ok) return start;
      const out = await openRazorpay(start);
      if (out.status === "closed") return { ok: false, message: "Payment not completed. Nothing was added." };
      if (out.status === "failed") return { ok: false, message: out.message };
      return rzpConfirm({ kind: start.kind, id: start.id, paymentId: out.paymentId, signature: out.signature });
    });
  const value = Number(amount);
  const link =
    upiId && value >= 1
      ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee || "Thabaal")}&am=${value.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Thabaal wallet ${clientName}`.slice(0, 50))}`
      : null;

  useEffect(() => {
    let alive = true;
    if (!link) return;
    QR.toDataURL(link, { margin: 1, width: 220 }).then((u) => alive && setQr(u));
    return () => {
      alive = false;
    };
  }, [link]);

  if (online && !manual) {
    return (
      <div className="space-y-4">
        <Field id="w-amount" label="Amount (₹)" required>
          <input id="w-amount" className="field tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setAmount(String(q))} className="rounded-full border border-line px-3 py-1 text-sm text-ink-2 hover:border-brand hover:text-ink">
              ₹{q.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">UPI, card or net banking through Razorpay. The money is added to your wallet as soon as the payment goes through.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={pending} onClick={payOnline} className="max-sm:w-full">
            Pay ₹{(value || 0).toLocaleString("en-IN")} now
          </Button>
          {upiId && (
            <button type="button" className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => setManual(true)}>
              Paid by UPI already? Send the reference
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!upiId) {
    return <p className="text-sm text-muted">Recharges open once Thabaal adds its UPI ID. Contact Thabaal to add money in the meantime.</p>;
  }
  return (
    <form
      className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => requestRecharge(value, utr, note), () => {
          setUtr("");
          setNote("");
        });
      }}
    >
      <div className="space-y-4">
        <Field id="w-amount" label="Amount (₹)" required>
          <input id="w-amount" className="field tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setAmount(String(q))} className="rounded-full border border-line px-3 py-1 text-sm text-ink-2 hover:border-brand hover:text-ink">
              ₹{q.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>
            Pay <b className="text-ink">₹{(value || 0).toLocaleString("en-IN")}</b> by scanning the QR, or to UPI ID <b className="select-all text-ink">{upiId}</b>
            {payee ? ` (${payee})` : ""}.
          </li>
          <li>Copy the UPI transaction ID (UTR / reference no.) from your payment app and enter it below.</li>
          <li>Thabaal checks the payment and the money is added to your wallet.</li>
        </ol>
        <Field id="w-utr" label="UPI transaction ID" hint="12 digits in most apps" required>
          <input id="w-utr" className="field font-mono" autoComplete="off" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. 428712345678" />
        </Field>
        <Field id="w-note" label="Note" hint="optional">
          <input id="w-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid from GPay" />
        </Field>
        <Button type="submit" loading={pending} className="max-sm:w-full">
          I have paid
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-panel-2 p-3 text-center">
        {qr && link ? (
          <a href={link} aria-label="Pay with a UPI app">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code */}
            <img src={qr} alt={`UPI QR code to pay ₹${value} to ${upiId}`} width={200} height={200} className="size-[200px] rounded-control bg-white" />
          </a>
        ) : (
          <div className="grid size-[200px] place-items-center text-xs text-muted">Enter an amount</div>
        )}
        <p className="text-xs text-muted">Scan with any UPI app. On a phone, tap the code to open your UPI app.</p>
      </div>
    </form>
  );
}

/** Approve or turn down a pending recharge. */
export function DecideRecharge({ id, label }: { id: string; label: string }) {
  const { pending, submit } = useSubmit();
  return (
    <div className="flex gap-1.5">
      <Button size="sm" loading={pending} onClick={() => submit(() => decideRecharge(id, true))}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          if (await confirmAction({ message: `Turn down ${label}? Do this only if the money didn't arrive.`, confirmLabel: "Turn down", danger: true })) submit(() => decideRecharge(id, false));
        }}
      >
        Reject
      </Button>
    </div>
  );
}

/** Add money received another way, refund, or correct the balance. */
export function AdjustForm({ clientId }: { clientId: string }) {
  const [kind, setKind] = useState<"RECHARGE" | "ADJUSTMENT" | "REFUND">("RECHARGE");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[10rem_8rem_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => adjustWallet(clientId, kind, Number(amount), note), () => {
          setAmount("");
          setNote("");
        });
      }}
    >
      <Field id="adj-kind" label="What">
        <select id="adj-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="RECHARGE">Money received</option>
          <option value="REFUND">Refund to client</option>
          <option value="ADJUSTMENT">Correction (+ / −)</option>
        </select>
      </Field>
      <Field id="adj-amt" label="Amount (₹)">
        <input id="adj-amt" className="field tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ""))} placeholder={kind === "ADJUSTMENT" ? "-50" : "1000"} />
      </Field>
      <Field id="adj-note" label="Note">
        <input id="adj-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash received at office" />
      </Field>
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </form>
  );
}

/** Billing mode, rates and low-balance warning for one client. */
export function WalletSettingsForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: { billingMode: "direct" | "wallet"; rates: Record<string, number>; lowAlert: number };
}) {
  const [mode, setMode] = useState(initial.billingMode);
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(WALLET_CATEGORIES.map((c) => [c, String(initial.rates[c] ?? META_RATES[c])])));
  const [low, setLow] = useState(String(initial.lowAlert));
  const { pending, submit } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveWalletSettings(clientId, { billingMode: mode, rates, lowAlert: low }));
      }}
    >
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1.5 text-sm font-medium text-ink">Who pays Meta for this client&apos;s messages</legend>
        {(
          [
            ["direct", "Client pays Meta directly", "Their own Meta billing. No wallet; nothing is charged here."],
            ["wallet", "Thabaal wallet", "Thabaal pays Meta; each delivered message is taken from the client's wallet."],
          ] as const
        ).map(([id, title, desc]) => (
          <label key={id} className={`flex cursor-pointer gap-3 rounded-card border p-3 text-sm ${mode === id ? "border-brand bg-brand-soft/60" : "border-line"}`}>
            <input type="radio" name={`mode-${clientId}`} className="check mt-0.5 rounded-full" checked={mode === id} onChange={() => setMode(id)} />
            <span>
              <span className="font-medium text-ink">{title}</span>
              <span className="mt-0.5 block text-xs text-muted">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "wallet" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {WALLET_CATEGORIES.map((c) => (
              <Field key={c} id={`rate-${c}`} label={CATEGORY_NAMES[c]} hint={`Meta ₹${META_RATES[c]} · with GST ₹${chargeFor(Number(rates[c]) || 0).toFixed(4)}`}>
                <input id={`rate-${c}`} className="field tabular" inputMode="decimal" value={rates[c]} onChange={(e) => setRates({ ...rates, [c]: e.target.value.replace(/[^\d.]/g, "") })} />
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted">Rates are per delivered message before GST; 18% GST is added to every charge. Keep Meta&apos;s rate for no markup.</p>
          <Field id="low-alert" label="Warn the client below (₹)">
            <input id="low-alert" className="field tabular sm:max-w-40" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
        </>
      )}
      <Button type="submit" loading={pending} size="sm">
        Save billing
      </Button>
    </form>
  );
}

/** Thabaal's UPI ID for recharges and GST details. */
export function PaymentSettingsForm({ initial }: { initial: { upiId: string; payee: string; gstEnabled: boolean; gstin: string } }) {
  const [v, setV] = useState(initial);
  const { pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveWalletPayment(v));
      }}
    >
      <Field id="pay-upi" label="UPI ID for recharges" hint="shown to clients with a QR">
        <input id="pay-upi" className="field font-mono" value={v.upiId} onChange={(e) => setV({ ...v, upiId: e.target.value })} placeholder="thabaal@okhdfcbank" />
      </Field>
      <Field id="pay-name" label="Name on the UPI account">
        <input id="pay-name" className="field" value={v.payee} onChange={(e) => setV({ ...v, payee: e.target.value })} placeholder="Thabaal" />
      </Field>
      <Field id="pay-gstin" label="GSTIN" hint="when Thabaal is registered">
        <input id="pay-gstin" className="field font-mono uppercase" value={v.gstin} onChange={(e) => setV({ ...v, gstin: e.target.value })} placeholder="33ABCDE1234F1Z5" />
      </Field>
      <div className="flex items-end">
        <CheckRow label="Show GST on receipts" description="Turn on once the GSTIN is active." checked={v.gstEnabled} onChange={(e) => setV({ ...v, gstEnabled: e.target.checked })} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending} size="sm">
          Save payment details
        </Button>
      </div>
    </form>
  );
}
