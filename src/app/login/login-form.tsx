"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState, useActionState } from "react";
import { login } from "./actions";

interface LoginFormProps {
  lang?: "en" | "ta";
  isNight?: boolean;
}

export function LoginForm({ lang = "en", isNight = false }: LoginFormProps) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const isTamil = lang === "ta";

  return (
    <div className="space-y-4 sm:space-y-4.5 w-full">
      {/* 1. GOOGLE SSO BUTTON */}
      <button
        type="button"
        onClick={() => {
          alert("Demo: OAuth is ready to connect with your Google Cloud workspace.");
        }}
        className={`group flex h-11 sm:h-12 w-full items-center justify-center gap-2.5 rounded-full border text-xs sm:text-sm font-semibold transition-all active:scale-[0.99] ${
          isNight
            ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] shadow-sm"
            : "border-slate-200/90 bg-white text-[#10283B] hover:bg-slate-50 shadow-sm"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span>{isTamil ? "Google கணக்குடன் தொடரவும்" : "Continue with Google"}</span>
      </button>

      {/* 2. DIVIDER */}
      <div className="flex items-center gap-3 py-0.5 text-2xs uppercase tracking-wider">
        <div className={`h-px flex-1 ${isNight ? "bg-white/10" : "bg-slate-200"}`} />
        <span className={isNight ? "text-white/40 font-medium" : "text-slate-400 font-medium"}>
          {isTamil ? "அல்லது மின்னஞ்சல் மூலம்" : "or sign in with email"}
        </span>
        <div className={`h-px flex-1 ${isNight ? "bg-white/10" : "bg-slate-200"}`} />
      </div>

      {/* 3. CREDENTIAL FORM */}
      <form action={action} className="space-y-3.5 sm:space-y-4">
        {state?.error && (
          <div
            role="alert"
            className={`rounded-2xl border px-4 py-2.5 text-xs font-medium backdrop-blur-md animate-fade ${
              isNight
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.error}
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="email-input"
            className={`block text-xs font-semibold ${
              isNight ? "text-white/80" : "text-[#10283B]"
            }`}
          >
            {isTamil ? "மின்னஞ்சல் முகவரி" : "Email address"}
          </label>
          <div
            className={`relative flex items-center rounded-full border px-4 py-3 sm:py-3.5 transition-all focus-within:ring-2 focus-within:ring-[#F5A623]/30 ${
              isNight
                ? "border-white/15 bg-white/[0.06] text-white focus-within:border-[#F5A623] focus-within:bg-white/[0.09]"
                : "border-slate-200/90 bg-[#F8FAFC] text-[#10283B] focus-within:border-[#F5A623] focus-within:bg-white shadow-sm"
            }`}
          >
            <Mail
              aria-hidden
              className={`mr-2.5 size-4 shrink-0 ${isNight ? "text-white/40" : "text-slate-400"}`}
            />
            <input
              id="email-input"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus
              defaultValue={state?.email}
              placeholder={isTamil ? "name@company.com" : "name@company.com"}
              className={`w-full bg-transparent text-xs sm:text-sm focus:outline-none ${
                isNight
                  ? "text-white placeholder:text-white/40"
                  : "text-[#10283B] placeholder:text-slate-400"
              }`}
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="password-input"
            className={`block text-xs font-semibold ${
              isNight ? "text-white/80" : "text-[#10283B]"
            }`}
          >
            {isTamil ? "கடவுச்சொல்" : "Password"}
          </label>
          <div
            className={`relative flex items-center rounded-full border px-4 py-3 sm:py-3.5 transition-all focus-within:ring-2 focus-within:ring-[#F5A623]/30 ${
              isNight
                ? "border-white/15 bg-white/[0.06] text-white focus-within:border-[#F5A623] focus-within:bg-white/[0.09]"
                : "border-slate-200/90 bg-[#F8FAFC] text-[#10283B] focus-within:border-[#F5A623] focus-within:bg-white shadow-sm"
            }`}
          >
            <Lock
              aria-hidden
              className={`mr-2.5 size-4 shrink-0 ${isNight ? "text-white/40" : "text-slate-400"}`}
            />
            <input
              id="password-input"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className={`w-full bg-transparent pr-8 text-xs sm:text-sm focus:outline-none ${
                isNight
                  ? "text-white placeholder:text-white/40"
                  : "text-[#10283B] placeholder:text-slate-400"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className={`absolute right-3.5 transition active:scale-95 ${
                isNight
                  ? "text-white/40 hover:text-white"
                  : "text-slate-400 hover:text-[#10283B]"
              }`}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* Remember Me & Forgot Password Row */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
          <label
            className={`flex cursor-pointer select-none items-center gap-2 font-medium transition ${
              isNight ? "text-white/70 hover:text-white" : "text-slate-600 hover:text-[#10283B]"
            }`}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-[#F5A623]"
            />
            <span>{isTamil ? "என்னை நினைவில் கொள்" : "Remember me"}</span>
          </label>
          <a
            href="mailto:support@thabaal.com?subject=Password%20Reset%20Request"
            className={`font-semibold transition hover:underline ${
              isNight ? "text-amber-400 hover:text-amber-300" : "text-amber-800 hover:text-amber-900"
            }`}
          >
            {isTamil ? "கடவுச்சொல் மறந்ததா?" : "Forgot password?"}
          </a>
        </div>

        {/* Submit Button (Signature Mango Yellow) */}
        <button
          type="submit"
          disabled={pending}
          className="group relative mt-2 flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F5A623] px-6 text-sm sm:text-base font-bold text-[#10283B] shadow-md shadow-amber-500/25 transition-all hover:bg-[#E59819] hover:shadow-amber-500/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span>
            {pending
              ? isTamil ? "உள்நுழைகிறது..." : "Signing in..."
              : isTamil ? "தபாலில் உள்நுழைக" : "Sign in to Thabaal"}
          </span>
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform group-hover:translate-x-1"
          />
        </button>

        {/* Sign up invitation */}
        <p className={`pt-2 text-center text-xs ${isNight ? "text-white/60" : "text-slate-500"}`}>
          {isTamil ? "கணக்கு இல்லையா? " : "Don't have an account? "}
          <a
            href="mailto:access@thabaal.com?subject=Thabaal%20Access%20Request"
            className={`font-bold transition hover:underline ${
              isNight ? "text-white hover:text-amber-300" : "text-[#10283B] hover:text-amber-700"
            }`}
          >
            {isTamil ? "பதிவு செய்க" : "Sign Up"}
          </a>
        </p>
      </form>
    </div>
  );
}
