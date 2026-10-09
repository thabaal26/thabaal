"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field id="email" label="Email">
        <input name="email" type="email" inputMode="email" autoComplete="email" required autoFocus defaultValue={state?.email} className="field" placeholder="you@company.com" />
      </Field>
      <Field id="password" label="Password" error={state?.error}>
        <input name="password" type="password" autoComplete="current-password" required className="field" placeholder="••••••••" />
      </Field>
      <Button type="submit" loading={pending} className="w-full sm:h-11">
        Sign in <ArrowRight aria-hidden className="size-4" />
      </Button>
    </form>
  );
}
