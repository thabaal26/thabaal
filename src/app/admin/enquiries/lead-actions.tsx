"use client";

// Admin panel › one enquiry: move it along, log a call, set the next follow-up, and make a won enquiry a business.
// The server checks the login is an admin and every value (lib/leads.ts).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { BUSINESS_TYPES } from "@/lib/business-types";
import { LEAD_STAGES } from "@/lib/lead-stages";
import { logEnquiryCall, makeBusiness, moveEnquiry, setEnquiryFollowUp } from "../../dashboard/actions/leads";

function useRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string; id?: string }>, after?: (r: { ok: boolean; id?: string }) => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok, r.message);
      if (r.ok) {
        after?.(r);
        router.refresh();
      }
    });
  return { busy, run, router };
}

export function StageButtons({ id, stage, locked }: { id: string; stage: string; locked: boolean }) {
  const { busy, run } = useRun();
  if (locked) return <p className="muted small">This enquiry is a business now, so it stays Won.</p>;
  return (
    <div className="tools" style={{ flexWrap: "wrap" }}>
      {LEAD_STAGES.filter((s) => s.k !== stage).map((s) => (
        <button key={s.k} type="button" className={`btn sm${s.k === "won" ? " primary" : ""}`} disabled={busy} onClick={() => run(() => moveEnquiry(id, s.k))}>
          {s.k === "won" ? "Mark as won" : s.k === "lost" ? "Mark as lost" : `Move to ${s.n}`}
        </button>
      ))}
    </div>
  );
}

export function CallForm({ id, open, today }: { id: string; open: boolean; today: string }) {
  const { busy, run } = useRun();
  const [text, setText] = useState("");
  const [next, setNext] = useState("");
  return (
    <form
      className="stack"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => logEnquiryCall(id, { text, nextOn: next || undefined }),
          () => {
            setText("");
            setNext("");
          },
        );
      }}
    >
      <div className="field">
        <label htmlFor="call-text">Log a call: what happened?</label>
        <textarea id="call-text" rows={2} maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="tools" style={{ alignItems: "end", flexWrap: "wrap" }}>
        {open && (
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="call-next">Next follow-up (optional)</label>
            <input id="call-next" type="date" min={today} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        )}
        <button type="submit" className="btn sm primary" disabled={busy}>
          {busy ? "Saving…" : "Save the call"}
        </button>
      </div>
    </form>
  );
}

export function FollowUpForm({ id, current, today }: { id: string; current: string | null; today: string }) {
  const { busy, run } = useRun();
  const [day, setDay] = useState(current ?? today);
  return (
    <form
      className="tools"
      style={{ alignItems: "end", flexWrap: "wrap" }}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setEnquiryFollowUp(id, day));
      }}
    >
      <div className="field" style={{ minWidth: 180 }}>
        <label htmlFor="next-day">Set next follow-up</label>
        <input id="next-day" type="date" min={today} required value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <button type="submit" className="btn sm" disabled={busy}>
        Set follow-up
      </button>
    </form>
  );
}

export function ConvertForm({ id, shop, town }: { id: string; shop: string; town: string }) {
  const { busy, run, router } = useRun();
  const [name, setName] = useState(shop);
  const [city, setCity] = useState(town);
  const [type, setType] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => makeBusiness(id, { name, city, businessType: type || undefined }),
          (r) => r.id && router.push(`/admin/clients/${r.id}`),
        );
      }}
    >
      <div className="formgrid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="field">
          <label htmlFor="cv-name">Business name</label>
          <input id="cv-name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cv-city">City they deliver from</label>
          <input id="cv-city" type="text" required maxLength={40} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cv-type">Kind of business</label>
          <select id="cv-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Not sure</option>
            {BUSINESS_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="tools" style={{ marginTop: 12 }}>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Adding…" : "Make it a business"}
        </button>
        <span className="muted small">Adds it to All clients with this phone number. You add their login and WhatsApp number there.</span>
      </div>
    </form>
  );
}
