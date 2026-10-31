"use client";

// Admin panel › Settings › Plans and prices: "Edit prices". The server checks the login is an admin and the
// prices make sense (lib/plan-prices.ts checkPrices) before saving.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { PLANS } from "@/lib/account-plans";
import { DEFAULT_PRICES, savePercent, type PriceTable } from "@/lib/plan-prices";
import { updatePlanPrices } from "../../dashboard/actions/admin-settings";

type Draft = Record<string, { m: string; q: string; y: string }>;
const toDraft = (p: PriceTable): Draft => Object.fromEntries(PLANS.map((x) => [x.k, { m: String(p[x.k].m), q: String(p[x.k].q), y: String(p[x.k].y) }]));
const num = (s: string) => Number(s.replace(/[,\s₹]/g, ""));
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function PriceEditor({ prices }: { prices: PriceTable }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(prices));
  const [busy, start] = useTransition();

  const set = (k: string, c: "m" | "q" | "y", v: string) => setDraft((d) => ({ ...d, [k]: { ...d[k], [c]: v } }));
  const hint = (k: string, c: "q" | "y") => {
    const row = { m: num(draft[k].m), q: num(draft[k].q), y: num(draft[k].y) };
    if (!(row.m > 0) || !(row[c] > 0)) return "";
    return `${inr(row[c] / (c === "q" ? 3 : 12))}/mo · saves ${savePercent(row, c)}%`;
  };

  return (
    <>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          setDraft(toDraft(prices));
          ref.current?.showModal();
        }}
      >
        Edit prices
      </button>
      <dialog ref={ref} aria-labelledby="price-edit-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form
          className="dlg"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updatePlanPrices(draft);
              toast(r.ok, r.message);
              if (r.ok) {
                ref.current?.close();
                router.refresh();
              }
            });
          }}
        >
          <h2 id="price-edit-title">Edit plan prices</h2>
          <p className="muted small" style={{ marginTop: -6 }}>
            Whole rupees, GST included. New subscriptions use these straight away: My account, the website and Razorpay. Businesses already subscribed keep
            the price they signed up at.
          </p>
          {PLANS.map((p) => (
            <fieldset key={p.k} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 700, marginBottom: 6 }}>{p.n}</legend>
              <div className="formgrid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                {(["m", "q", "y"] as const).map((c) => (
                  <div className="field" key={c}>
                    <label htmlFor={`pr-${p.k}-${c}`}>{c === "m" ? "Monthly" : c === "q" ? "3 months" : "12 months"}</label>
                    <input id={`pr-${p.k}-${c}`} type="text" inputMode="numeric" required value={draft[p.k][c]} onChange={(e) => set(p.k, c, e.target.value)} />
                    {c !== "m" && <span className="muted small">{hint(p.k, c)}</span>}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="acts">
            <button type="button" className="btn" style={{ marginRight: "auto" }} onClick={() => setDraft(toDraft(DEFAULT_PRICES))} disabled={busy}>
              Fill in the original prices
            </button>
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Save prices"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
