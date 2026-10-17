"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { FLOW_KEYS, ORDER_FLOWS, type OrderFlowKey } from "@/lib/order-flow";
import { useLanguage } from "@/lib/i18n/context";
import { saveOrderFlow } from "../actions/orders";

const STEP_LABELS_TA: Record<string, string> = {
  Confirmed: "உறுதியானது",
  Paid: "பணம் வந்தது",
  Dispatched: "அனுப்பப்பட்டது",
  Delivered: "டெலிவரி ஆனது",
};

/** Settings → Order steps: pick the flow that matches the shop; the preview shows the steps every order gets. */
export function OrderStepsForm({ current, canChange }: { current: OrderFlowKey; canChange: boolean }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [flow, setFlow] = useState<OrderFlowKey>(current);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await safeAction(() => saveOrderFlow(flow));
      toastResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <section id="order-steps" className="card" style={{ scrollMarginTop: 80 }}>
      <div className="hd">
        <div>
          <h2>{isTa ? "ஆர்டர் நிலைகள்" : "Order steps"}</h2>
          <p>{isTa ? "ஒவ்வொரு ஆர்டரும் கடந்து செல்லும் நிலைகள். உங்கள் கடை செயல்படும் முறையைத் தேர்ந்தெடுக்கவும்." : "The stages every order passes through. Choose the one that matches how your shop works."}</p>
        </div>
      </div>

      <div className="list" role="radiogroup" aria-label={isTa ? "ஆர்டர் நிலைகள்" : "Order steps"}>
        {FLOW_KEYS.map((key) => {
          const f = ORDER_FLOWS[key];
          return (
            <label key={key} className="row" style={{ cursor: canChange ? "pointer" : "default", flexWrap: "nowrap", alignItems: "center" }}>
              <input
                type="radio"
                name="order-flow"
                value={key}
                checked={flow === key}
                disabled={!canChange}
                onChange={() => setFlow(key)}
                style={{ width: 18, height: 18, flexShrink: 0, accentColor: "var(--brand, #2563eb)" }}
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t" style={{ fontWeight: 600 }}>{f.label}</div>
                <div className="muted small">{f.hint}</div>
              </div>
              <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                {f.steps.length} {isTa ? "நிலைகள்" : "steps"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <div className="muted small" style={{ marginBottom: 8 }}>{isTa ? "ஒவ்வொரு ஆர்டரிலும் நீங்கள் பார்ப்பவை" : "What you will see on every order"}</div>
        <div className="steps" style={{ fontSize: 13 }}>
          {ORDER_FLOWS[flow].steps.map((s, i) => (
            <span key={s.key} style={{ display: "contents" }}>
              {i > 0 && " › "}
              <b className="on">{isTa ? (STEP_LABELS_TA[s.label] ?? s.label) : s.label}</b>
            </span>
          ))}
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 12 }}>
        {isTa
          ? "உங்கள் கடைக்கு ஏற்ற ஒன்றைத் தேர்ந்தெடுக்கவும். நீங்கள் பயன்படுத்தாத நிலை தபாலால் தானாக நிரப்பப்படும், எனவே அறிக்கைகள் எப்போதும் சரியாக இருக்கும்."
          : "Pick the one that matches your shop. A step you do not use is filled in by thabaal on its own, so nothing is left half done and your reports stay correct."}
      </p>

      {canChange ? (
        <div className="tools" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" disabled={pending || flow === current} aria-busy={pending} onClick={save}>
            {pending ? (isTa ? "சேமிக்கப்படுகிறது…" : "Saving…") : (isTa ? "ஆர்டர் நிலைகளை சேமி" : "Save order steps")}
          </button>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>{isTa ? "கடை உரிமையாளர் மட்டுமே ஆர்டர் நிலைகளை மாற்ற முடியும்." : "Only the business owner can change the order steps."}</p>
      )}
    </section>
  );
}

