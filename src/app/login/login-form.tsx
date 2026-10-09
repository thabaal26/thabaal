"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState, useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { login } from "./actions";

export function LoginForm({ lang = "en" }: { lang?: "en" | "ta" }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const isTamil = lang === "ta";

  return (
    <div className="space-y-5">
      {/* Google SSO button */}
      <button
        type="button"
        onClick={() => {
          alert("Demo: OAuth is ready to connect with your Google Cloud workspace.");
        }}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-control border border-line-strong/60 bg-panel px-4 text-sm font-medium text-ink shadow-sm transition hover:border-line-strong hover:bg-canvas active:scale-[0.99]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        <span>{isTamil ? "Google கணக்குடன் தொடரவும்" : "Continue with Google"}</span>
      </button>

      <div className="flex items-center gap-3 text-2xs uppercase tracking-wider text-muted">
        <div className="h-px flex-1 bg-line" />
        <span>{isTamil ? "அல்லது மின்னஞ்சல் மூலம்" : "or sign in with email"}</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
          <div role="alert" className="rounded-control border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs font-medium text-danger">
            {state.error}
          </div>
        )}

        <Field id="email" label={isTamil ? "மின்னஞ்சல் முகவரி" : "Email address"}>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus
              defaultValue={state?.email}
              className="field pl-10"
              placeholder="name@company.com"
            />
          </div>
        </Field>

        <Field id="password" label={isTamil ? "கடவுச்சொல்" : "Password"}>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="field pl-10 pr-11"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-control text-muted transition hover:bg-canvas hover:text-ink active:scale-95"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex cursor-pointer select-none items-center gap-2 text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="check size-4"
            />
            <span>{isTamil ? "என்னை நினைவில் கொள்" : "Remember me"}</span>
          </label>
          <a
            href="mailto:support@thabaal.com?subject=Password%20Reset%20Request"
            className="font-medium text-brand-deep hover:underline"
          >
            {isTamil ? "கடவுச்சொல் மறந்ததா?" : "Forgot password?"}
          </a>
        </div>

        <Button
          type="submit"
          loading={pending}
          className="w-full sm:h-11 bg-thabaal-mango text-thabaal-ink hover:bg-[#f0b318] active:bg-[#e0a412] font-semibold text-sm shadow-card"
        >
          <span>{isTamil ? "தபாலில் உள்நுழைக" : "Sign in to Thabaal"}</span>
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </form>
    </div>
  );
}
