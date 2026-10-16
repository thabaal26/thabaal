"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { FLOW_KEYS, ORDER_FLOWS, type OrderFlowKey } from "@/lib/order-flow";
import { saveOrderFlow } from "../actions/orders";

/** Settings → Order steps: pick the flow that matches the shop; the preview shows the steps every order gets. */
export function OrderStepsForm({ current, canChange }: { current: OrderFlowKey; canChange: boolean }) {
  const router = useRouter();
  const [flow, setFlow] = useState<OrderFlowKey>(current);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveOrderFlow(flow);
      toastResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <section id="order-steps" className="card" style={{ scrollMarginTop: 80 }}>
      <div className="hd">
        <div>
          <h2>Order steps</h2>
          <p>The stages every order passes through. Choose the one that matches how your shop works.</p>
        </div>
      </div>

      <div className="list" role="radiogroup" aria-label="Order steps">
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
                {f.steps.length} steps
              </span>
            </label>
          );
        })}
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <div className="muted small" style={{ marginBottom: 8 }}>What you will see on every order</div>
        <div className="steps" style={{ fontSize: 13 }}>
          {ORDER_FLOWS[flow].steps.map((s, i) => (
            <span key={s.key} style={{ display: "contents" }}>
              {i > 0 && "›"}
              <b className="on">{s.label}</b>
            </span>
          ))}
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 12 }}>
        Pick the one that matches your shop. A step you do not use is filled in by thabaal on its own, so nothing is left half done and your reports stay correct.
      </p>

      {canChange ? (
        <div className="tools" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" disabled={pending || flow === current} aria-busy={pending} onClick={save}>
            {pending ? "Saving…" : "Save order steps"}
          </button>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>Only the business owner can change the order steps.</p>
      )}
    </section>
  );
}
