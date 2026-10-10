"use client";

import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState, useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ lang = "en" }: { lang?: "en" | "ta" }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const isTamil = lang === "ta";

  return (
    <form action={action} className="space-y-4 w-full">
      {state?.error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-300 backdrop-blur-md animate-fade"
        >
          {state.error}
        </div>
      )}

      {/* Email Field with Pill Shape and Mail Icon */}
      <div>
        <div className="relative flex items-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-3.5 sm:py-4 text-white transition-all focus-within:border-[#8B5CF6] focus-within:bg-white/[0.09] focus-within:ring-2 focus-within:ring-[#8B5CF6]/30">
          <Mail aria-hidden className="mr-3 size-4.5 shrink-0 text-white/50" />
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus
            defaultValue={state?.email}
            placeholder={isTamil ? "மின்னஞ்சல்" : "Email"}
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Password Field with Pill Shape, Lock Icon & Toggle */}
      <div>
        <div className="relative flex items-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-3.5 sm:py-4 text-white transition-all focus-within:border-[#8B5CF6] focus-within:bg-white/[0.09] focus-within:ring-2 focus-within:ring-[#8B5CF6]/30">
          <Lock aria-hidden className="mr-3 size-4.5 shrink-0 text-white/50" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder={isTamil ? "கடவுச்சொல்" : "Password"}
            className="w-full bg-transparent pr-8 text-sm sm:text-base text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-4 text-white/40 transition hover:text-white active:scale-95"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <div className="mt-2 text-right">
          <a
            href="mailto:support@thabaal.com?subject=Password%20Reset%20Request"
            className="text-xs text-white/50 transition hover:text-purple-300"
          >
            {isTamil ? "கடவுச்சொல் மறந்ததா?" : "Forgot Password?"}
          </a>
        </div>
      </div>

      {/* Submit Button with Pill Shape, Purple Gradient & Paper Airplane Icon */}
      <button
        type="submit"
        disabled={pending}
        className="group relative mt-6 flex h-12 sm:h-13 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#6e2feb] to-[#8854f6] px-6 text-sm sm:text-base font-semibold text-white shadow-lg shadow-purple-950/50 transition-all hover:from-[#5d20da] hover:to-[#7840e6] hover:shadow-purple-800/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span>
          {pending
            ? isTamil ? "உள்நுழைகிறது..." : "Logging In..."
            : isTamil ? "உள்நுழைக" : "Log In"}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-4 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        >
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>

      {/* Footer Link */}
      <p className="pt-2 text-center text-xs text-white/60">
        {isTamil ? "கணக்கு இல்லையா? " : "Don't have an account? "}
        <a
          href="mailto:access@thabaal.com?subject=Thabaal%20Access%20Request"
          className="font-semibold text-white transition hover:text-purple-300 hover:underline"
        >
          {isTamil ? "பதிவு செய்க" : "Sign Up"}
        </a>
      </p>
    </form>
  );
}
