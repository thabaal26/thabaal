"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons";
import Link from "@/components/intent-link";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import type { CollectRow, ReceivedRow, TxnRow } from "@/lib/payments-data";
import { useLanguage } from "@/lib/i18n/context";
import { requestPayment } from "../actions/orders";
import { setPaymentMethod, verifyPaymentClaim } from "../actions/payments";
import { RecordPaymentSheet } from "../orders/payment-ui";
import { inr } from "../portal-format";
import { Chips, PAction, Pill, type PillTone } from "../portal-ui";

const STATE: Record<string, { tone: PillTone; label: string; labelTa: string; group: string }> = {
  requested: { tone: "warn", label: "Payment waiting", labelTa: "பணம் நிலுவையில் உள்ளது", group: "unpaid" },
  unpaid: { tone: "mute", label: "No payment request sent", labelTa: "கோரிக்கை அனுப்பப்படவில்லை", group: "nolink" },
  failed: { tone: "bad", label: "Payment failed", labelTa: "தோல்வி அடைந்தது", group: "failed" },
  claimed: { tone: "warn", label: "Customer says paid · check", labelTa: "செலுத்திவிட்டதாக கூறுகிறார் · சரிபார்க்கவும்", group: "claimed" },
  cod_due: { tone: "info", label: "Cash on delivery", labelTa: "டெலிவரி ரொக்கம் (COD)", group: "cod" },
  part_paid: { tone: "warn", label: "Part paid", labelTa: "பகுதி செலுத்தப்பட்டது", group: "unpaid" },
};

function waited(ms: number, now: number, isTa = false) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 60) return isTa ? `${m} நிமிடம்` : `${m} min`;
  if (m < 48 * 60) return isTa ? `${Math.round(m / 60)} மணிநேரம்` : `${Math.round(m / 60)} hours`;
  return isTa ? `${Math.round(m / 1440)} நாட்கள்` : `${Math.round(m / 1440)} days`;
}

/** Payments › To collect: every order still owed money, with the next step for each. */
export function CollectList({ rows, nowMs, canOperate, intro = true }: { rows: CollectRow[]; nowMs: number; canOperate: boolean; intro?: boolean }) {
  const { isTa } = useLanguage();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<CollectRow | null>(null);

  const groupOf = (r: CollectRow) => STATE[r.state]?.group ?? "unpaid";
  const count = (f: string) => (f === "all" ? rows.length : f === "late" ? rows.filter((r) => r.late).length : rows.filter((r) => groupOf(r) === f).length);
  const opts = [
    { id: "all", label: isTa ? "அனைத்தும்" : "All" },
    { id: "unpaid", label: isTa ? "பணம் நிலுவை" : "Payment waiting" },
    { id: "nolink", label: isTa ? "அனுப்பப்படாதவை" : "No request sent" },
    { id: "claimed", label: isTa ? "செலுத்தியதாகக் கூறியவை" : "Customer says paid" },
    { id: "cod", label: isTa ? "ரொக்கம் (COD)" : "Cash on delivery" },
    { id: "failed", label: isTa ? "தோல்வி" : "Failed" },
    { id: "late", label: isTa ? "தாமதம்" : "Late" },
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
          {isTa ? "இன்னும் பணம் வராத ஆர்டர்கள். பழைய ஆர்டர்களுக்கு முதலில் நினைவூட்டுங்கள்." : "Orders where the money has not come in yet. Chase the oldest first."}
        </p>
      )}
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input
            id="payment-search"
            name="q"
            type="search"
            placeholder={isTa ? "வாடிக்கையாளர் அல்லது ஆர்டரைத் தேடுங்கள்…" : "Search customer or order"}
            aria-label={isTa ? "வாடிக்கையாளர் அல்லது ஆர்டரைத் தேடுங்கள்" : "Search"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Chips label={isTa ? "பண நிலை" : "Payment state"} value={filter} onChange={setFilter} options={opts.map((o) => ({ ...o, n: count(o.id) }))} />
        {canOperate && remindable.length > 0 && <RemindAll ids={remindable.map((r) => r.id)} isTa={isTa} />}
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
                    {r.cod ? (isTa ? "டெலிவரி ரொக்கம் · " : "Cash on delivery · ") : r.requested ? (isTa ? "பண இணைப்பு · " : "Payment link · ") : ""}
                    {isTa ? `காத்திருப்பு ${waited(r.waitingSinceMs, nowMs, isTa)} · ஆர்டர் ${r.status.toLowerCase()}` : `waiting ${waited(r.waitingSinceMs, nowMs)} · order ${r.status.toLowerCase()}`}
                  </p>
                </div>
                <b style={{ font: "600 20px var(--display)" }}>{inr(r.due)}</b>
              </div>
              <div className="tools" style={{ margin: "10px 0" }}>
                <Pill tone={st.tone}>{isTa ? st.labelTa : st.label}</Pill>
                {r.late && <Pill tone="bad">{isTa ? "தாமதம்" : "Late"}</Pill>}
                {r.state === "requested" && (
                  <span className="muted small">
                    {isTa ? "WhatsApp-ல் பணம் செலுத்தியதும் தானாகப் பச்சையாக மாறும்" : "Turns green by itself when they pay on WhatsApp"}
                  </span>
                )}
                {r.due < r.total && (
                  <span className="muted small">
                    {isTa ? `${inr(r.total - r.due)} ஏற்கனவே பெறப்பட்டது` : `${inr(r.total - r.due)} already received`}
                  </span>
                )}
              </div>
              {canOperate && (
                <div className="tools">
                  {r.state === "claimed" ? (
                    <>
                      <PAction action={verifyPaymentClaim.bind(null, r.id, true)} className="primary">
                        {isTa ? "பணம் பெறப்பட்டது" : "Payment received"}
                      </PAction>
                      <PAction
                        action={verifyPaymentClaim.bind(null, r.id, false)}
                        confirm={
                          isTa
                            ? `${r.name}-ன் பணம் பெறப்படவில்லை எனக் குறிக்கவா? அவரிடம் UPI குறிப்பு எண் அல்லது ஸ்கிரீன்ஷாட் கேட்கப்படும்.`
                            : `Mark ${r.name}'s payment as not received? They'll be asked for the UPI reference or a screenshot.`
                        }
                      >
                        {isTa ? "பெறப்படவில்லை" : "Not received"}
                      </PAction>
                    </>
                  ) : r.cod ? (
                    <button type="button" className="btn primary" onClick={() => setPaying(r)}>
                      {isTa ? "ரொக்கம் பதிவு செய்" : "Record cash received"}
                    </button>
                  ) : r.state === "unpaid" ? (
                    <>
                      {r.canRequest && (
                        <PAction
                          action={requestPayment.bind(null, r.id)}
                          className="primary"
                          confirm={
                            isTa
                              ? `${r.ref} ஆர்டருக்காக ${r.name}-க்கு WhatsApp 'Review and pay' செய்தி அனுப்பவா?`
                              : `Send ${r.name} the WhatsApp “Review and pay” message for ${r.ref}?`
                          }
                        >
                          {isTa ? "பண இணைப்பு அனுப்பு" : "Send payment link"}
                        </PAction>
                      )}
                      <PAction action={setPaymentMethod.bind(null, r.id, "cod")}>
                        {isTa ? "டெலிவரி ரொக்கமாக மாற்று" : "Mark as cash on delivery"}
                      </PAction>
                      <button type="button" className="btn sm" onClick={() => setPaying(r)}>
                        {isTa ? "செலுத்தப்பட்டதாகக் குறி" : "Mark paid"}
                      </button>
                    </>
                  ) : (
                    <>
                      {r.canRequest && (
                        <PAction action={requestPayment.bind(null, r.id)} className="primary">
                          {r.state === "failed" ? (isTa ? "புதிய இணைப்பு அனுப்பு" : "Send a new link") : isTa ? "நினைவூட்டல் அனுப்பு" : "Send reminder"}
                        </PAction>
                      )}
                      <button type="button" className="btn sm" onClick={() => setPaying(r)}>
                        {isTa ? "செலுத்தப்பட்டதாகக் குறி" : "Mark paid"}
                      </button>
                      <PAction action={setPaymentMethod.bind(null, r.id, "cod")}>
                        {isTa ? "டெலிவரி ரொக்கமாக மாற்று" : "Change to cash on delivery"}
                      </PAction>
                    </>
                  )}
                  <Link className="btn sm ghost" href={`/dashboard/replies?r=${r.customerId}`}>
                    {isTa ? "உரையாடலைத் திற" : "Open chat"}
                  </Link>
                </div>
              )}
            </article>
          );
        })}
        {list.length === 0 && (
          <p className="muted">
            {rows.length
              ? isTa
                ? "எதுவும் பொருந்தவில்லை."
                : "Nothing matches."
              : isTa
                ? "வசூலிக்க வேண்டிய தொகை எதுவும் இல்லை. நன்று."
                : "Nothing to collect. Good work."}
          </p>
        )}
      </div>

      {paying && <RecordPaymentSheet open onClose={() => setPaying(null)} id={paying.id} who={paying.name} due={paying.due} cod={paying.cod} />}
    </>
  );
}

/** Sends the payment request again to everyone whose link is waiting. */
function RemindAll({ ids, isTa = false }: { ids: string[]; isTa?: boolean }) {
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
          if (
            !(await confirmAction(
              isTa
                ? `பணம் செலுத்தாத ${ids.length} வாடிக்கையாளர்களுக்கு மீண்டும் பணக் கோரிக்கையை அனுப்பவா?`
                : `Send the payment request again to ${ids.length} customer${ids.length === 1 ? "" : "s"} who haven't paid?`
            ))
          )
            return;
          start(async () => {
            let ok = 0;
            const errors: string[] = [];
            for (const id of ids) {
              const r = await requestPayment(id);
              if (r.ok) ok += 1;
              else if (r.message) errors.push(r.message);
            }
            toastResult({
              ok: ok > 0,
              message: isTa ? `${ids.length} பேரில் ${ok} பேருக்கு நினைவூட்டல் அனுப்பப்பட்டது.` : `Reminder sent to ${ok} of ${ids.length}.`,
              errors: errors.slice(0, 3),
            });
            router.refresh();
          });
        } finally {
          busy.current = false;
        }
      }}
    >
      {pending ? (isTa ? "அனுப்பப்படுகிறது…" : "Sending…") : isTa ? "அனைவருக்கும் நினைவூட்டு" : "Remind everyone"}
    </button>
  );
}

/** "Record a payment": find an order still owed money by its number, then record it. */
export function RecordByNumber({ rows }: { rows: CollectRow[] }) {
  const { isTa } = useLanguage();
  const dlg = useRef<HTMLDialogElement>(null);
  const [num, setNum] = useState("");
  const [paying, setPaying] = useState<CollectRow | null>(null);
  const digits = num.replace(/\D/g, "");
  const match = digits ? rows.find((r) => r.ref.replace(/\D/g, "") === digits) : undefined;
  return (
    <>
      <button type="button" className="btn primary" onClick={() => dlg.current?.showModal()}>
        {isTa ? "+ பணம் பதிவு செய்" : "+ Record a payment"}
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
          <h2>{isTa ? "செலுத்தப்பட்டதாகக் குறிக்க" : "Mark paid"}</h2>
          <p className="muted small">
            {isTa ? "வாடிக்கையாளர் போர்ட்டலுக்கு வெளியே நேரடியாக பணம் செலுத்தும்போது இதைப் பயன்படுத்தவும்." : "Use this when the customer paid you outside thabaal."}
          </p>
          <div className="field">
            <label htmlFor="mpo">{isTa ? "ஆர்டர் எண்" : "Order number"}</label>
            <input id="mpo" type="text" inputMode="numeric" placeholder="1047" value={num} onChange={(e) => setNum(e.target.value)} autoFocus />
            {match ? (
              <p className="note small">
                {isTa ? "ஆர்டர் " : "Order "}
                <b>{match.ref}</b> · {match.name} · {inr(match.due)} {isTa ? "வர வேண்டியுள்ளது" : "waiting"}
              </p>
            ) : (
              <p className="muted small">
                {digits
                  ? isTa
                    ? `${digits} என்ற ஆர்டர் பணத்திற்காகக் காத்திருக்கவில்லை.`
                    : `No order ${digits} is waiting for payment.`
                  : isTa
                    ? "ஆர்டர்கள் பக்கத்தில் நீங்கள் பார்க்கும் எண்ணைத் தட்டச்சு செய்யவும்."
                    : "Type the number you see on the order in Orders."}
              </p>
            )}
          </div>
          <div className="acts">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>
              {isTa ? "ரத்து" : "Cancel"}
            </button>
            <button type="submit" className="btn primary" disabled={!match}>
              {isTa ? "அடுத்து" : "Next"}
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
  const { isTa } = useLanguage();
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => dlg.current?.showModal()}>
        {isTa ? "ரசீது காண்க" : "View receipt"}
      </button>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className="dlg">
          <h2>{isTa ? "ரசீது" : "Receipt"}</h2>
          <div className="list">
            <div className="row">
              <div className="grow muted">{isTa ? "ஆர்டர்" : "Order"}</div>
              <b>{row.ref}</b>
            </div>
            <div className="row">
              <div className="grow muted">{isTa ? "வாடிக்கையாளர்" : "Customer"}</div>
              <b>{row.name}</b>
            </div>
            <div className="row">
              <div className="grow muted">{isTa ? "செலுத்திய முறை" : "Paid by"}</div>
              <b>{way}</b>
            </div>
            {row.reference && (
              <div className="row">
                <div className="grow muted">{isTa ? "குறிப்பு எண்" : "Reference"}</div>
                <b>{row.reference}</b>
              </div>
            )}
            {row.collectedBy && (
              <div className="row">
                <div className="grow muted">{isTa ? "வசூலித்தவர்" : "Collected by"}</div>
                <b>{row.collectedBy}</b>
              </div>
            )}
            <div className="row">
              <div className="grow muted">{isTa ? "நேரம்" : "When"}</div>
              <b>{when}</b>
            </div>
            <div className="row" style={{ borderTop: "2px solid var(--line)" }}>
              <div className="grow t">{isTa ? "தொகை" : "Amount"}</div>
              <b style={{ font: "600 20px var(--display)" }}>{inr(row.amount)}</b>
            </div>
          </div>
          <div className="acts">
            <Link className="btn" href={`/dashboard/replies?r=${row.customerId}`}>
              {isTa ? "உரையாடலைத் திற" : "Open chat"}
            </Link>
            <button type="button" className="btn primary" onClick={() => dlg.current?.close()}>
              {isTa ? "மூடு" : "Close"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Downloads rows as a CSV file (opens in Excel). */
export function CsvButton({ name, rows, label }: { name: string; rows: (string | number)[][]; label?: string }) {
  const { isTa } = useLanguage();
  const defaultLabel = label ?? (isTa ? "CSV ஏற்றுமதி" : "Export CSV");
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
        const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }}
    >
      {defaultLabel}
    </button>
  );
}

/** Payments › All transactions: money in, refunds and failed payments, searchable. */
export function TxnTable({ rows }: { rows: (TxnRow & { when: string })[] }) {
  const { isTa } = useLanguage();
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
          <input
            type="search"
            placeholder={isTa ? "வாடிக்கையாளர், ஆர்டர் அல்லது தொகையைத் தேடுங்கள்…" : "Search customer, order or amount"}
            aria-label={isTa ? "பரிவர்த்தனைகளைத் தேடுங்கள்" : "Search transactions"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Chips
          label={isTa ? "வகை" : "Kind"}
          value={f}
          onChange={setF}
          options={[
            { id: "all", label: isTa ? "அனைத்தும்" : "All" },
            { id: "in", label: isTa ? "வந்த பணம்" : "Money in" },
            { id: "refund", label: isTa ? "திருப்பிச் செலுத்தியவை" : "Refunds" },
            { id: "fail", label: isTa ? "தோல்வி / காலாவதி" : "Failed or expired" },
          ]}
        />
        <CsvButton
          name="transactions"
          label={isTa ? "ஏற்றுமதி" : "Export"}
          rows={[
            [isTa ? "தேதி" : "Date", isTa ? "ஆர்டர்" : "Order", isTa ? "வாடிக்கையாளர்" : "Customer", isTa ? "வகை" : "Kind", isTa ? "முறை" : "Way", isTa ? "தொகை" : "Amount", isTa ? "நிலை" : "Status"],
            ...list.map((r) => [r.when, r.ref, r.name, r.kind === "in" ? (isTa ? "வந்த பணம்" : "Money in") : r.kind === "refund" ? (isTa ? "திருப்பிச் செலுத்தியது" : "Refund") : isTa ? "தோல்வி" : "Failed", r.way, r.amount, r.status]),
          ]}
        />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{isTa ? "தேதி" : "Date"}</th>
                <th>{isTa ? "ஆர்டர்" : "Order"}</th>
                <th>{isTa ? "வாடிக்கையாளர்" : "Customer"}</th>
                <th>{isTa ? "வகை" : "Kind"}</th>
                <th>{isTa ? "முறை" : "Way"}</th>
                <th className="num">{isTa ? "தொகை" : "Amount"}</th>
                <th>{isTa ? "நிலை" : "Status"}</th>
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
                  <td>{r.kind === "in" ? (isTa ? "வந்த பணம்" : "Money in") : r.kind === "refund" ? (isTa ? "திருப்பிச் செலுத்தியது" : "Refund") : isTa ? "தோல்வி" : "Payment"}</td>
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
            {isTa ? "பொருத்தமான பரிவர்த்தனைகள் எதுவும் இல்லை." : "Nothing matches."}
          </p>
        )}
      </div>
    </>
  );
}
