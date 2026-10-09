"use client";

import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { changePassword } from "../actions/account";

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="max-w-md space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePassword(cur, next);
          toastResult(r);
          if (r.ok) { setCur(""); setNext(""); }
        });
      }}
    >
      <Field id="cur" label="Current password" required>
        <input type="password" autoComplete="current-password" className="field" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Field id="new" label="New password" hint="8+ characters" required>
        <input type="password" autoComplete="new-password" minLength={8} className="field" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Button type="submit" className="max-sm:w-full" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
