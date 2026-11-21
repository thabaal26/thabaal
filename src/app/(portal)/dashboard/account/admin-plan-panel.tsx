"use client";

// Thabaal admin only: check plan payments clients sent and verify or turn them down, and record a period a
// business paid for before payments were tracked. The server re-checks that the person is an admin.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { CYCLE_NAMES, PLANS, inr, type BillingCycle, type PlanKey } from "@/lib/account-plans";
import { confirmPlanPayment, declinePlanPayment, recordPaidPeriod, requirePaidPlan } from "../actions/account";
import { Pill } from "../portal-ui";
import type { AccessState } from "@/lib/subscription-core";
import type { AdminPendingRow } from "./billing-types";

const planName = (k: string) => PLANS.find((p) => p.k === k)?.n ?? k;

export function PendingRow({ row, showClient }: { row: AdminPendingRow; showClient: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [startNow, setStartNow] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("Payment not found in the bank account");

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok, r.message);
      if (r.ok) router.refresh();
    });

  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div className="grow" style={{ minWidth: 220 }}>
        <div className="t">
          {showClient && <b>{row.clientName} · </b>}
          {planName(row.plan)} · {CYCLE_NAMES[row.cycle].en} · {inr(row.amount)}
        </div>
        <div className="muted small">
          UPI reference <b>{row.utr ?? "—"}</b>
          {row.payApp ? ` · ${row.payApp}` : ""}
          {row.paidOn ? ` · says paid ${row.paidOn}` : ""}
        </div>
        <div className="muted small">
          Sent {row.submittedLabel}
          {row.submittedBy ? ` by ${row.submittedBy}` : ""}
        </div>
        <div className="small" style={{ marginTop: 4 }}>
          If verified now: starts <b>{row.startsLabel}</b>, ends <b>{row.endsLabel}</b>
        </div>
        {!row.hasHistory && (
          <label className="small" style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "flex-start" }}>
            <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
            <span>
              This business has no paid period on record. Tick to start this plan when you verify, or record the period they
              already paid for first (below).
            </span>
          </label>
        )}
        {rejecting && (
          <div className="field" style={{ marginTop: 8 }}>
            <label>Why it is turned down (the client sees this)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </div>
        )}
      </div>
      <div className="tools">
        {rejecting ? (
          <>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setRejecting(false)}>
              Back
            </button>
            <button type="button" className="btn sm danger" disabled={busy} onClick={() => run(() => declinePlanPayment(row.id, reason))}>
              Turn down
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setRejecting(true)}>
              Not received
            </button>
            <button
              type="button"
              className="btn sm primary"
              disabled={busy || (!row.hasHistory && !startNow)}
              onClick={() => run(() => confirmPlanPayment(row.id, startNow))}
            >
              Money received: verify
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RecordPeriod({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [plan, setPlan] = useState<PlanKey>("growth");
  const [cycle, setCycle] = useState<BillingCycle>("m");
  const [startDate, setStartDate] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await recordPaidPeriod({ clientId, plan, cycle, startDate, note });
          toast(r.ok, r.message);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="formgrid">
        <div className="field">
          <label>Plan they paid for</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)}>
            {PLANS.map((p) => (
              <option key={p.k} value={p.k}>
                {p.n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>For how long</label>
          <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
            <option value="m">1 month</option>
            <option value="q">3 months</option>
            <option value="y">12 months</option>
          </select>
        </div>
        <div className="field">
          <label>Paid period started on</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. paid in cash, receipt 41" />
        </div>
      </div>
      <div className="tools">
        <button type="submit" className="btn sm" disabled={busy || !startDate}>
          Record paid period
        </button>
        <span className="muted small">It ends 1, 3 or 12 months after the start date. It can&apos;t overlap a period already on record.</span>
      </div>
    </form>
  );
}

const ACCESS_TEXT: Record<AccessState, string> = {
  ok: "Paid: everything open",
  due: "Paid, ending soon: everything open",
  overdue: "Overdue: everything open for now, locks soon",
  locked: "Locked: only Home, My account and Settings open",
  new: "Never paid: only Home, My account and Settings open",
  unmanaged: "No plan required yet: everything open",
};

/** Switch: must this business have a paid plan? New businesses start on; older ones stay off until switched on. */
function PlanRequiredSwitch({ clientId, required, access }: { clientId: string; required: boolean; access: AccessState }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 6 }}>
      <div className="grow" style={{ minWidth: 220 }}>
        <div className="t">Needs a paid plan to use thabaal</div>
        <div className="muted small">
          Now: <b>{ACCESS_TEXT[access]}</b>. When on, a business with no paid period, or whose plan ended
          more than the grace days ago, is locked to Home, My account and Settings. Record their paid period first if they already paid.
        </div>
      </div>
      <button
        type="button"
        className="sw"
        role="switch"
        aria-checked={required}
        aria-label="Needs a paid plan to use thabaal"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await requirePaidPlan(clientId, !required);
            toast(r.ok, r.message);
            if (r.ok) router.refresh();
          })
        }
      />
    </div>
  );
}

export function AdminPlanPanel({
  rows,
  clientId,
  clientName,
  hasHistory,
  planRequired = false,
  accessLabel,
}: {
  rows: AdminPendingRow[];
  clientId: string | null;
  clientName: string | null;
  hasHistory: boolean;
  planRequired?: boolean;
  accessLabel?: AccessState;
}) {
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--bar2)" }}>
      <div className="hd">
        <div>
          <h2 style={{ fontSize: 17 }}>Thabaal admin: old UPI payments and manual periods{clientName ? ` for ${clientName}` : ""}</h2>
          <p className="muted small">
            Plans are paid by Razorpay auto-pay and added by themselves. This panel only holds UPI references sent before auto-pay (check each
            against the bank statement before verifying) and lets you record a period paid outside thabaal. Only you see it.
          </p>
        </div>
        <Pill tone={rows.length ? "warn" : "ok"}>{rows.length ? `${rows.length} waiting` : "Nothing to check"}</Pill>
      </div>
      {rows.length > 0 && (
        <div className="list">
          {rows.map((r) => (
            <PendingRow key={r.id} row={r} showClient={!clientId} />
          ))}
        </div>
      )}
      {clientId && accessLabel && <PlanRequiredSwitch clientId={clientId} required={planRequired} access={accessLabel} />}
      {clientId ? (
        <details style={{ marginTop: 14 }} open={!hasHistory && rows.some((r) => !r.hasHistory)}>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
            Record a period this business already paid for (before payments were tracked here)
          </summary>
          <div style={{ marginTop: 12 }}>
            <RecordPeriod clientId={clientId} />
          </div>
        </details>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>
          Pick a business in the sidebar to see its plan and record a period it already paid for.
        </p>
      )}
    </div>
  );
}
