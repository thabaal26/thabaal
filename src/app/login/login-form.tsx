"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useActionState } from "react";
import { login } from "./actions";

interface LoginFormProps {
  lang?: "en" | "ta";
}

export function LoginForm({ lang = "en" }: LoginFormProps) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const isTamil = lang === "ta";

  return (
    <div className="thabaal-formwrap">
      <form action={action} className="thabaal-form">
        <h1>{isTamil ? "உள்நுழைக" : "Sign in"}</h1>
        <p className="sub">
          {isTamil
            ? "மீண்டும் வருக! தொடர உள்நுழையவும்"
            : "Welcome back! Please sign in to continue"}
        </p>

        {/* Google SSO Button */}
        <button
          type="button"
          onClick={() => {
            alert("Demo: OAuth is ready to connect with your Google Cloud workspace.");
          }}
          className="thabaal-google"
          aria-label={isTamil ? "Google கணக்குடன் தொடரவும்" : "Continue with Google"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
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

        {/* Divider */}
        <div className="thabaal-divider">
          <i></i>
          <span>{isTamil ? "அல்லது மின்னஞ்சல் மூலம்" : "or sign in with email"}</span>
          <i></i>
        </div>

        {/* Error Alert */}
        {state?.error && (
          <div
            role="alert"
            className="w-full mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-400"
          >
            {state.error}
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
            placeholder={isTamil ? "கடவுச்சொல்" : "Password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="thabaal-eye"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4.5 text-[#5d6e86]" />
            ) : (
              <Eye className="size-4.5 text-[#5d6e86]" />
            )}
          </button>
        </div>

        {/* Remember me & Forgot password */}
        <div className="thabaal-row">
          <label>
            <input type="checkbox" id="remember" name="remember" defaultChecked />
            <span>{isTamil ? "என்னை நினைவில் கொள்" : "Remember me"}</span>
          </label>
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
