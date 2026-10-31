"use client";

// Admin panel › Enquiries: "Add an enquiry", and "Edit details" on one enquiry. The server checks the login is an
// admin and the details make sense (lib/leads.ts).

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { PLANS } from "@/lib/account-plans";
import { LEAD_SOURCES } from "@/lib/lead-stages";
import { addEnquiry, saveEnquiry } from "../../dashboard/actions/leads";

export type LeadFields = { shop: string; person: string; phone: string; town: string; sells: string; source: string; plan: string; ownerId: string; note: string };
const EMPTY: LeadFields = { shop: "", person: "", phone: "", town: "", sells: "", source: "Walk-in", plan: "growth", ownerId: "", note: "" };

export function LeadDialog({ team, me, lead }: { team: { id: string; name: string }[]; me: string; lead?: { id: string } & LeadFields }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const start0 = () => (lead ? { ...lead } : { ...EMPTY, ownerId: me });
  const [f, setF] = useState<LeadFields>(start0);
  const [busy, start] = useTransition();
  const set = (k: keyof LeadFields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const id = (k: string) => `ld-${lead ? "e" : "n"}-${k}`;

  return (
    <>
      <button
        type="button"
        className={lead ? "btn sm" : "btn primary"}
        onClick={() => {
          setF(start0());
          ref.current?.showModal();
        }}
      >
        {lead ? "Edit details" : "Add an enquiry"}
      </button>
      <dialog ref={ref} aria-labelledby={id("title")} onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form
          className="dlg"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = lead ? await saveEnquiry(lead.id, f) : await addEnquiry(f);
              toast(r.ok, r.message);
              if (r.ok) {
                ref.current?.close();
                if (!lead && r.id) router.push(`/admin/enquiries/${r.id}`);
                else router.refresh();
              }
            });
          }}
        >
          <h2 id={id("title")}>{lead ? "Edit the enquiry" : "Add an enquiry"}</h2>
          {!lead && (
            <p className="muted small" style={{ marginTop: -6 }}>
              For a shop that called, messaged or walked in. It starts in New enquiry with a follow-up today.
            </p>
          )}
          <div className="formgrid">
            <div className="field">
              <label htmlFor={id("shop")}>Shop name</label>
              <input id={id("shop")} type="text" required maxLength={120} value={f.shop} onChange={set("shop")} />
            </div>
            <div className="field">
              <label htmlFor={id("person")}>Owner</label>
              <input id={id("person")} type="text" maxLength={80} value={f.person} onChange={set("person")} />
            </div>
            <div className="field">
              <label htmlFor={id("phone")}>Phone</label>
              <input id={id("phone")} type="tel" inputMode="numeric" required value={f.phone} onChange={set("phone")} />
            </div>
            <div className="field">
              <label htmlFor={id("town")}>Town</label>
              <input id={id("town")} type="text" maxLength={60} value={f.town} onChange={set("town")} />
            </div>
            <div className="field">
              <label htmlFor={id("sells")}>What do they sell?</label>
              <input id={id("sells")} type="text" maxLength={120} value={f.sells} onChange={set("sells")} />
            </div>
            <div className="field">
              <label htmlFor={id("source")}>Where from</label>
              <select id={id("source")} value={f.source} onChange={set("source")}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={id("plan")}>Plan they asked about</label>
              <select id={id("plan")} value={f.plan} onChange={set("plan")}>
                <option value="">Not sure yet</option>
                {PLANS.map((p) => (
                  <option key={p.k} value={p.k}>
                    {p.n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={id("owner")}>Who follows up</label>
              <select id={id("owner")} value={f.ownerId} onChange={set("ownerId")}>
                <option value="">Nobody yet</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={id("note")}>What did they ask for?</label>
            <textarea id={id("note")} rows={3} maxLength={1000} value={f.note} onChange={set("note")} />
          </div>
          <div className="acts">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : lead ? "Save" : "Add the enquiry"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
