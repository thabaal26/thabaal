"use client";

// Admin panel › Messages › Send a message (admin design): kind, who gets it, the text with {placeholders}, a preview
// for the first shop, and send now or schedule. The server works out the shops again and checks everything.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { AUDIENCES, fillFor, isPaymentKind, KINDS, pickAudience, unknownPlaceholders, wrapped, type Audience, type OwnerKind, type OwnerTarget } from "@/lib/owner-messages-core";
import { sendOwnerMessage } from "../../dashboard/actions/owner-messages";

export function SendForm({ shops, quiet }: { shops: OwnerTarget[]; quiet: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<OwnerKind>("rem");
  const [audience, setAudience] = useState<Audience>("auto");
  const [text, setText] = useState(KINDS[0].text);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [later, setLater] = useState(false);
  const [at, setAt] = useState("");
  const [busy, start] = useTransition();

  const { to, left } = pickAudience(kind, audience, shops, picked);
  const bad = unknownPlaceholders(text);
  const shown = shops.filter((s) => !q || [s.name, s.owner].join(" ").toLowerCase().includes(q.toLowerCase()));
  const why = [...new Set(left.map((l) => l.why))].map((w) => `${left.filter((l) => l.why === w).length} ${w}`).join(", ");

  const send = (when: "now" | "later") => {
    if (!to.length) return toast(false, "No shop will get this. Change who should get it.");
    if (when === "now" && !window.confirm(`Send this to ${to.length} business owner${to.length === 1 ? "" : "s"} on WhatsApp?`)) return;
    start(async () => {
      const r = await sendOwnerMessage({ kind, audience, picked, text, when, at: when === "later" ? at : undefined });
      toast(r.ok, r.message);
      if (r.ok) {
        setLater(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="g6">
      <div className="card">
        <div className="hd">
          <div>
            <h2>Write to your shops</h2>
            <p>Goes to the owner on WhatsApp, from your thabaal number.</p>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="msty">What kind of message?</label>
          <select
            id="msty"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as OwnerKind;
              setKind(k);
              setText(KINDS.find((x) => x.k === k)?.text ?? "");
            }}
          >
            {KINDS.map((k) => (
              <option key={k.k} value={k.k}>
                {k.n}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="msto">Who should get it?</label>
          <select id="msto" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {AUDIENCES.map((a) => (
              <option key={a.k} value={a.k}>
                {a.n}
              </option>
            ))}
          </select>
        </div>
        {audience === "pick" && (
          <div style={{ marginBottom: 12 }}>
            <input type="search" placeholder="Type a shop or owner to find it" aria-label="Find shops" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
            <div className="tools" style={{ marginBottom: 8, fontSize: 13 }}>
              <button type="button" className="btn sm" onClick={() => setPicked([...new Set([...picked, ...shown.map((s) => s.id)])])}>
                Select all shown
              </button>
              <button type="button" className="btn sm" onClick={() => setPicked([])}>
                Clear
              </button>
              <span className="muted small" style={{ marginLeft: "auto" }}>
                {picked.length} chosen · {shown.length} shown
              </span>
            </div>
            <div className="list" style={{ maxHeight: 220, overflow: "auto", border: "1.5px solid var(--line)", borderRadius: 12, padding: "4px 10px" }}>
              {shown.map((s) => (
                <label key={s.id} className="row" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(s.id)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                  />
                  <span className="grow">
                    {s.name} <span className="muted small">· {s.owner ?? "no owner name"}{s.planName ? ` · ${s.planName}` : ""}</span>
                  </span>
                </label>
              ))}
              {!shown.length && <p className="muted small">No shop matches that.</p>}
            </div>
          </div>
        )}
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="mstx">Message</label>
          <textarea id="mstx" rows={6} maxLength={900} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="muted small" style={{ marginTop: 6 }}>
            Use <b>{"{shop}"}</b>, <b>{"{owner}"}</b>, <b>{"{amount}"}</b>, <b>{"{date}"}</b>, <b>{"{plan}"}</b>. They are filled in for each shop.
            {bad.length > 0 && <span style={{ color: "var(--bad)" }}> {`{${bad[0]}}`} can&apos;t be filled in.</span>}
          </div>
        </div>
        {later && (
          <div className="field" style={{ marginBottom: 12, maxWidth: 260 }}>
            <label htmlFor="msat">Send on</label>
            <input id="msat" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
        )}
        <div className="tools" style={{ flexWrap: "wrap" }}>
          {later ? (
            <>
              <button type="button" className="btn primary" disabled={busy || !at} onClick={() => send("later")}>
                {busy ? "Saving…" : "Schedule it"}
              </button>
              <button type="button" className="btn" onClick={() => setLater(false)} disabled={busy}>
                Back
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn primary" disabled={busy || !to.length || bad.length > 0 || !text.trim()} onClick={() => send("now")}>
                {busy ? "Sending…" : "Send now"}
              </button>
              <button type="button" className="btn" onClick={() => setLater(true)} disabled={busy}>
                Schedule
              </button>
            </>
          )}
          <span className="muted small">
            {to.length ? `${to.length} shop${to.length === 1 ? "" : "s"} will get this` : "No shop matches this just now"}
            {left.length ? ` · left out: ${why}` : ""}
          </span>
        </div>
      </div>

      <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <div className="hd">
            <div>
              <h2>How it will look</h2>
              <p>Shown with the first shop on the list.</p>
            </div>
          </div>
          <div className="card" style={{ background: "var(--soft)", boxShadow: "none", whiteSpace: "pre-wrap", fontSize: 14.5 }} data-testid="preview">
            {to[0] ? wrapped(kind, to[0].owner, fillFor(text, to[0])) : "Pick who should get the message."}
          </div>
          <div className="muted small" style={{ marginTop: 10 }}>
            {to[0] ? `Shown for ${to[0].name}. Each shop sees their own name and amount.` : ""}
          </div>
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Before you send</h2>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }} className="muted">
            <li>Each message is charged by Meta on your number: reminders at the utility rate, the rest at the marketing rate.</li>
            <li>Nothing goes out outside quiet hours ({quiet}). A message sent later waits for them.</li>
            <li>One message a week per shop is plenty. More and they mute you.</li>
            <li>
              {isPaymentKind(kind)
                ? "Shops on auto-pay never get a payment reminder; Razorpay reminds them."
                : "Payment reminders are left out for shops on auto-pay automatically."}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
