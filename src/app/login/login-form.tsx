"use client";

import { Eye, EyeOff } from "@/components/icons";
import { useState, useActionState } from "react";
import { login } from "./actions";

interface LoginFormProps {
  lang?: "en" | "ta";
}

/** The sign-in errors the server sends, in Tamil. Anything unexpected is shown as sent. */
const TA_ERRORS: Record<string, string> = {
  "Enter your email and password.": "மின்னஞ்சல் மற்றும் கடவுச்சொல்லை உள்ளிடவும்.",
  "Email or password is incorrect.": "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறாக உள்ளது.",
};

export function LoginForm({ lang = "en" }: LoginFormProps) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const isTamil = lang === "ta";
  const error = state?.error && (isTamil ? (TA_ERRORS[state.error] ?? state.error) : state.error);

  return (
    <div className="thabaal-formwrap">
      <form action={action} className="thabaal-form">
        <h1>{isTamil ? "உள்நுழைக" : "Sign in"}</h1>
        <p className="sub">
          {isTamil
            ? "மீண்டும் வருக! தொடர உள்நுழையவும்"
            : "Welcome back! Please sign in to continue"}
        </p>

        {/* Sign-in is by email only: there's no Google sign-in behind the portal, so no button for one. */}

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="w-full mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-400"
          >
            {error}
          </div>
        )}

        {/* Email Field */}
        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            aria-label={isTamil ? "மின்னஞ்சல் முகவரி" : "Email"}
            placeholder={isTamil ? "மின்னஞ்சல் முகவரி" : "Email id"}
            autoComplete="email"
            required
            defaultValue={state?.email}
          />
        </div>

        {/* Password Field */}
        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            aria-label={isTamil ? "கடவுச்சொல்" : "Password"}
            placeholder={isTamil ? "கடவுச்சொல்" : "Password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="thabaal-eye"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={isTamil ? (showPassword ? "கடவுச்சொல்லை மறை" : "கடவுச்சொல்லைக் காட்டு") : showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4.5 text-[#5d6e86]" />
            ) : (
              <Eye className="size-4.5 text-[#5d6e86]" />
            )}
          </button>
        </div>

        {/* Sessions always last the same time, so there's no "remember me" switch that would do nothing. */}
        <div className="thabaal-row" style={{ justifyContent: "flex-end" }}>
          <a href="mailto:support@thabaal.com?subject=Password%20Reset%20Request">
            {isTamil ? "கடவுச்சொல் மறந்ததா?" : "Forgot password?"}
          </a>
        </div>

        {/* Submit Login Button */}
        <button type="submit" disabled={pending} className="thabaal-login-btn">
          {pending
            ? isTamil
              ? "உள்நுழைகிறது..."
              : "Logging in..."
            : isTamil
              ? "உள்நுழைக"
              : "Login"}
        </button>

        {/* Sign up */}
        <p className="thabaal-signup">
          {isTamil ? "கணக்கு இல்லையா? " : "Don't have an account? "}
          <a href="mailto:access@thabaal.com?subject=Thabaal%20Access%20Request">
            {isTamil ? "பதிவு செய்க" : "Sign up"}
          </a>
        </p>
      </form>
    </div>
  );
}
