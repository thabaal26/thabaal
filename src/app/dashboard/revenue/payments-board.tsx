"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons";
import Link from "@/components/intent-link";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import type { CollectRow, ReceivedRow, TxnRow } from "@/lib/payments-data";
import { requestPayment } from "../actions/orders";
import { setPaymentMethod, verifyPaymentClaim } from "../actions/payments";
import { RecordPaymentSheet } from "../orders/payment-ui";
import { inr } from "../portal-format";
import { Chips, PAction, Pill, type PillTone } from "../portal-ui";

const STATE: Record<string, { tone: PillTone; label: string; group: string }> = {
  requested: { tone: "warn", label: "Payment waiting", group: "unpaid" },
  unpaid: { tone: "mute", label: "No payment request sent", group: "nolink" },
  failed: { tone: "bad", label: "Payment failed", group: "failed" },
  claimed: { tone: "warn", label: "Customer says paid · check", group: "claimed" },
  cod_due: { tone: "info", label: "Cash on delivery", group: "cod" },
  part_paid: { tone: "warn", label: "Part paid", group: "unpaid" },
};

function waited(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} hours`;
  return `${Math.round(m / 1440)} days`;
}

/** Payments › To collect: every order still owed money, with the next step for each. */
export function CollectList({ rows, nowMs, canOperate, intro = true }: { rows: CollectRow[]; nowMs: number; canOperate: boolean; intro?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<CollectRow | null>(null);

  const groupOf = (r: CollectRow) => STATE[r.state]?.group ?? "unpaid";
  const count = (f: string) => (f === "all" ? rows.length : f === "late" ? rows.filter((r) => r.late).length : rows.filter((r) => groupOf(r) === f).length);
  const opts = [
    { id: "all", label: "All" },
    { id: "unpaid", label: "Payment waiting" },
    { id: "nolink", label: "No request sent" },
    { id: "claimed", label: "Customer says paid" },
    { id: "cod", label: "Cash on delivery" },
    { id: "failed", label: "Failed" },
    { id: "late", label: "Late" },
  ].filter((o) => o.id === "all" || count(o.id) > 0 || filter === o.id);
  const ql = q.trim().toLowerCase();
  const list = rows
    .filter((r) => (filter === "all" ? true : filter === "late" ? r.late : groupOf(r) === filter))
    .filter((r) => !ql || `${r.name} ${r.ref}`.toLowerCase().includes(ql))
    .sort((a, b) => a.waitingSinceMs - b.waitingSinceMs);
  const remindable = rows.filter((r) => r.state === "requested" && r.canRequest);

  return (
    <>
      {intro && (
        <p className="muted" style={{ marginBottom: 12 }}>
          Orders where the money has not come in yet. Chase the oldest first.
        </p>
      )}
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search customer or order" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chips label="Payment state" value={filter} onChange={setFilter} options={opts.map((o) => ({ ...o, n: count(o.id) }))} />
        {canOperate && remindable.length > 0 && <RemindAll ids={remindable.map((r) => r.id)} />}
      </div>

      <div className="stack">
        {list.map((r) => {
          const st = STATE[r.state] ?? STATE.unpaid;
          return (
            <article key={r.id} className="card">
              <div className="hd" style={{ marginBottom: 6 }}>
                <div>
                  <h2 style={{ fontSize: 17 }}>
                    <Link href={`/dashboard/customers/${r.customerId}`} style={{ textDecoration: "none" }}>
                      {r.name}
                    </Link>{" "}
                    · {r.ref}
                  </h2>
                  <p>
                    {r.cod ? "Cash on delivery · " : r.requested ? "Payment link · " : ""}waiting {waited(r.waitingSinceMs, nowMs)} · order {r.status.toLowerCase()}
                  </p>
                </div>
                <b style={{ font: "600 20px var(--display)" }}>{inr(r.due)}</b>
              </div>
              <div className="tools" style={{ margin: "10px 0" }}>
                <Pill tone={st.tone}>{st.label}</Pill>
                {r.late && <Pill tone="bad">Late</Pill>}
                {r.state === "requested" && <span className="muted small">Turns green by itself when they pay on WhatsApp</span>}
                {r.due < r.total && <span className="muted small">{inr(r.total - r.due)} already received</span>}
              </div>
              {canOperate && (
                <div className="tools">
                  {r.state === "claimed" ? (
                    <>
                      <PAction action={verifyPaymentClaim.bind(null, r.id, true)} className="primary">
                        Payment received
                      </PAction>
                      <PAction action={verifyPaymentClaim.bind(null, r.id, false)} confirm={`Mark ${r.name}'s payment as not received? They'll be asked for the UPI reference or a screenshot.`}>
                        Not received
                      </PAction>
                    </>
                  ) : r.cod ? (
                    <button type="button" className="btn primary" onClick={() => setPaying(r)}>
                      Record cash received
                    </button>
                  ) : r.state === "unpaid" ? (
                    <>
                      {r.canRequest && (
                        <PAction action={requestPayment.bind(null, r.id)} className="primary" confirm={`Send ${r.name} the WhatsApp “Review and pay” message for ${r.ref}?`}>
                          Send payment link
                        </PAction>
                      )}
                      <PAction action={setPaymentMethod.bind(null, r.id, "cod")}>Mark as cash on delivery</PAction>
                      <button type="button" className="btn sm" onClick={() => setPaying(r)}>
                        Mark paid
                      </button>
                    </>
                  ) : (
                    <>
                      {r.canRequest && (
                        <PAction action={requestPayment.bind(null, r.id)} className="primary">
                          {r.state === "failed" ? "Send a new link" : "Send reminder"}
                        </PAction>
                      )}
                      <button type="button" className="btn sm" onClick={() => setPaying(r)}>
                        Mark paid
                      </button>
                      <PAction action={setPaymentMethod.bind(null, r.id, "cod")}>Change to cash on delivery</PAction>
                    </>
                  )}
                  <Link className="btn sm ghost" href={`/dashboard/replies?r=${r.customerId}`}>
                    Open chat
                  </Link>
                </div>
              )}
            </article>
          );
        })}
        {list.length === 0 && <p className="muted">{rows.length ? "Nothing matches." : "Nothing to collect. Good work."}</p>}
      </div>

      {paying && <RecordPaymentSheet open onClose={() => setPaying(null)} id={paying.id} who={paying.name} due={paying.due} cod={paying.cod} />}
    </>
  );
}

/** Sends the payment request again to everyone whose link is waiting. */
function RemindAll({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn sm"
      style={{ marginLeft: "auto" }}
      disabled={pending}
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        try {
          if (!(await confirmAction(`Send the payment request again to ${ids.length} customer${ids.length === 1 ? "" : "s"} who haven't paid?`))) return;
          start(async () => {
            let ok = 0;
            const errors: string[] = [];
            for (const id of ids) {
              const r = await requestPayment(id);
              if (r.ok) ok += 1;
              else if (r.message) errors.push(r.message);
            }
            toastResult({ ok: ok > 0, message: `Reminder sent to ${ok} of ${ids.length}.`, errors: errors.slice(0, 3) });
            router.refresh();
          });
        } finally {
          busy.current = false;
        }
      }}
    >
      {pending ? "Sending…" : "Remind everyone"}
    </button>
  );
}

/** "Record a payment": find an order still owed money by its number, then record it. */
export function RecordByNumber({ rows }: { rows: CollectRow[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [num, setNum] = useState("");
  const [paying, setPaying] = useState<CollectRow | null>(null);
  const digits = num.replace(/\D/g, "");
  const match = digits ? rows.find((r) => r.ref.replace(/\D/g, "") === digits) : undefined;
  return (
    <>
      <button type="button" className="btn primary" onClick={() => dlg.current?.showModal()}>
        + Record a payment
      </button>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <form
          className="dlg"
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!match) return;
            dlg.current?.close();
            setPaying(match);
          }}
        >
          <h2>Mark paid</h2>
          <p className="muted small">Use this when the customer paid you outside thabaal.</p>
          <div className="field">
            <label htmlFor="mpo">Order number</label>
            <input id="mpo" type="text" inputMode="numeric" placeholder="1047" value={num} onChange={(e) => setNum(e.target.value)} autoFocus />
            {match ? (
              <p className="note small">
                Order <b>{match.ref}</b> · {match.name} · {inr(match.due)} waiting
              </p>
            ) : (
              <p className="muted small">{digits ? `No order ${digits} is waiting for payment.` : "Type the number you see on the order in Orders."}</p>
            )}
          </div>
          <div className="acts">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!match}>
              Next
            </button>
          </div>
        </form>
      </dialog>
      {paying && <RecordPaymentSheet open onClose={() => setPaying(null)} id={paying.id} who={paying.name} due={paying.due} cod={paying.cod} />}
    </>
  );
}

/** One payment's receipt in the design's dialog. */
export function ReceiptButton({ row, way, when }: { row: ReceivedRow; way: string; when: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => dlg.current?.showModal()}>
        View receipt
      </button>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className="dlg">
          <h2>Receipt</h2>
          <div className="list">
            <div className="row">
              <div className="grow muted">Order</div>
              <b>{row.ref}</b>
            </div>
            <div className="row">
              <div className="grow muted">Customer</div>
              <b>{row.name}</b>
            </div>
            <div className="row">
              <div className="grow muted">Paid by</div>
              <b>{way}</b>
            </div>
            {row.reference && (
              <div className="row">
                <div className="grow muted">Reference</div>
                <b>{row.reference}</b>
              </div>
            )}
            {row.collectedBy && (
              <div className="row">
                <div className="grow muted">Collected by</div>
                <b>{row.collectedBy}</b>
              </div>
            )}
            <div className="row">
              <div className="grow muted">When</div>
              <b>{when}</b>
            </div>
            <div className="row" style={{ borderTop: "2px solid var(--line)" }}>
              <div className="grow t">Amount</div>
              <b style={{ font: "600 20px var(--display)" }}>{inr(row.amount)}</b>
            </div>
          </div>
          <div className="acts">
            <Link className="btn" href={`/dashboard/replies?r=${row.customerId}`}>
              Open chat
            </Link>
            <button type="button" className="btn primary" onClick={() => dlg.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Downloads rows as a CSV file (opens in Excel). */
export function CsvButton({ name, rows, label = "Export CSV" }: { name: string; rows: (string | number)[][]; label?: string }) {
  return (
    <button
      type="button"
      className="btn sm"
      style={{ marginLeft: "auto" }}
      disabled={rows.length <= 1}
      onClick={() => {
        const esc = (v: string | number) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }}
    >
      {label}
    </button>
  );
}

/** Payments › All transactions: money in, refunds and failed payments, searchable. */
export function TxnTable({ rows }: { rows: (TxnRow & { when: string })[] }) {
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const list = rows.filter((r) => (f === "all" || r.kind === f) && (!ql || `${r.name} ${r.ref} ${r.amount}`.toLowerCase().includes(ql)));
  const tone = (k: TxnRow["kind"]): PillTone => (k === "in" ? "ok" : k === "refund" ? "info" : "bad");
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search customer, order or amount" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chips
          label="Kind"
          value={f}
          onChange={setF}
          options={[
            { id: "all", label: "All" },
            { id: "in", label: "Money in" },
            { id: "refund", label: "Refunds" },
            { id: "fail", label: "Failed or expired" },
          ]}
        />
        <CsvButton name="transactions" rows={[["Date", "Order", "Customer", "Kind", "Way", "Amount", "Status"], ...list.map((r) => [r.when, r.ref, r.name, r.kind === "in" ? "Money in" : r.kind === "refund" ? "Refund" : "Failed", r.way, r.amount, r.status])]} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Kind</th>
                <th>Way</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.key}>
                  <td className="muted">{r.when}</td>
                  <td>{r.ref}</td>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{r.kind === "in" ? "Money in" : r.kind === "refund" ? "Refund" : "Payment"}</td>
                  <td>{r.way}</td>
                  <td className="num">{r.kind === "refund" ? `−${inr(r.amount)}` : inr(r.amount)}</td>
                  <td>
                    <Pill tone={tone(r.kind)}>{r.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <p className="muted" style={{ padding: 16 }}>
            Nothing matches.
          </p>
        )}
      </div>
    </>
  );
}
