"use client";

import { useState, useTransition } from "react";
import { T } from "../portal-ui";
import { safeAction, toastResult } from "@/components/toast";
import { changePassword } from "../actions/account";

/** Change password, in the portal design's form style. */
export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, start] = useTransition();
  const mismatch = again.length > 0 && again !== next;
  return (
    <form
      className="stack"
      style={{ gap: 12, marginTop: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch) return;
        start(async () => {
          const r = await safeAction(() => changePassword(cur, next));
          toastResult(r);
          if (r.ok) {
            setCur("");
            setNext("");
            setAgain("");
          }
        });
      }}
    >
      <div className="field">
        <label htmlFor="cur">Current password</label>
        <input id="cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="formgrid">
        <div className="field">
          <label htmlFor="new">New password</label>
          <input id="new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="again">Type it again</label>
          <input id="again" type="password" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
      </div>
      {mismatch && <p className="msg err">The two new passwords don&apos;t match.</p>}
      <div className="tools">
        <button type="submit" className="btn primary" disabled={pending || mismatch}>
          <T>{pending ? "Changing…" : "Change password"}</T>
        </button>
        <span className="muted small">8 or more characters.</span>
      </div>
    </form>
  );
}
