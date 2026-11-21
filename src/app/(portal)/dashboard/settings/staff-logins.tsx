"use client";

// Settings › Staff logins: who can sign in to this business, and adding or removing staff logins within the plan.
// The server checks the login is the owner or a manager, the plan's limit, and everything typed.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { addStaffLogin, removeStaffLogin } from "../actions/team";

type Login = { id: string; name: string; email: string; access: string; owner: boolean; you: boolean };

export function StaffLogins({ logins, used, limit, planName, canChange }: { logins: Login[]; used: number; limit: number | null; planName: string | null; canChange: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const full = limit !== null && used >= limit;
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <section className="card" id="staff">
      <div className="hd">
        <div>
          <h2>Staff logins</h2>
          <p>
            {limit === null
              ? "People who can sign in to this business."
              : `${used} of ${limit} staff logins on the ${planName} plan are in use. Staff can take orders, dispatch and reply to customers.`}
          </p>
        </div>
      </div>
      <div className="list">
        {logins.map((u) => (
          <div className="row" key={u.id}>
            <div className="grow">
              <div className="t">
                {u.name || u.email}
                {u.you ? " (you)" : ""}
              </div>
              <div className="muted small">
                {u.email} · {u.owner ? "Owner" : u.access === "MANAGER" ? "Manager" : u.access === "VIEWER" ? "View only" : "Staff"}
              </div>
            </div>
            {canChange && !u.owner && !u.you && (
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() => window.confirm(`Remove ${u.name || u.email}'s login? They won't be able to sign in any more.`) && run(() => removeStaffLogin(u.id))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {canChange && (
        <form
          style={{ marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addStaffLogin(f), () => setF({ name: "", email: "", password: "" }));
          }}
        >
          <div className="formgrid">
            <div className="field">
              <label htmlFor="staff-name">Name</label>
              <input id="staff-name" type="text" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="staff-email">Email</label>
              <input id="staff-email" type="email" required maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="staff-password">Password for them</label>
              <input id="staff-password" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </div>
          </div>
          <div className="tools" style={{ marginTop: 12 }}>
            <button type="submit" className="btn primary" disabled={busy || full}>
              {busy ? "Adding…" : "Add staff login"}
            </button>
            <span className="muted small">{full ? "All staff logins on your plan are in use. A bigger plan in My account gives you more." : "Give them the email and password; they can change it with Forgot password."}</span>
          </div>
        </form>
      )}
    </section>
  );
}
