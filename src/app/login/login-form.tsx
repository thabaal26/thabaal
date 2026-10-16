"use client";

import { Eye, EyeOff } from "@/components/icons";
import { useState, useEffect, useActionState } from "react";
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
  const [oauthError, setOauthError] = useState<string | null>(null);
  const isTamil = lang === "ta";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (!err) return;
      // The refused Google address comes in a short-lived cookie (not the URL); read it once, then drop it.
      const emailParam = decodeURIComponent(document.cookie.match(/(?:^|;\s*)wp_oauth_email=([^;]*)/)?.[1] ?? "") || null;
      if (emailParam) document.cookie = "wp_oauth_email=; Max-Age=0; path=/login";
      // Clean the address bar so a refresh or shared link doesn't repeat the message.
      window.history.replaceState(null, "", window.location.pathname);

      if (err === "google_not_configured") {
        setOauthError(
          isTamil
            ? "Google உள்நுழைவு இன்னும் அமைக்கப்படவில்லை. .env கோப்பில் GOOGLE_CLIENT_ID அமைக்கவும்."
            : "Google sign-in is not configured yet. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
        );
      } else if (err === "unauthorized_email") {
        setOauthError(
          isTamil
            ? `இந்த Google கணக்கு (${emailParam || "மின்னஞ்சல்"}) பதிவு செய்யப்படவில்லை. உங்கள் நிர்வாகியைத் தொடர்பு கொள்ளவும்.`
            : `The Google account ${emailParam ? `(${emailParam}) ` : ""}isn't registered with Thabaal. Ask your business's manager to add this email, or sign in with the account they added.`
        );
      } else if (err === "google_unverified") {
        setOauthError(
          isTamil
            ? "இந்த Google கணக்கின் மின்னஞ்சல் உறுதிப்படுத்தப்படவில்லை. உறுதிப்படுத்திய கணக்கில் உள்நுழையவும்."
            : "Google hasn't confirmed this account's email address, so it can't be used to sign in. Use a verified Google account or your password."
        );
      } else if (err === "google_denied") {
        setOauthError(
          isTamil
            ? "Google உள்நுழைவு ரத்து செய்யப்பட்டது."
            : "Google sign-in was canceled or access was denied."
        );
      } else if (err === "state_mismatch") {
        setOauthError(
          isTamil
            ? "பாதுகாப்பு சரிபார்ப்பு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."
            : "Security verification failed. Please try signing in again."
        );
      } else if (err === "google_auth_failed") {
        setOauthError(
          isTamil
            ? "Google மூலம் உள்நுழைய முடியவில்லை. மீண்டும் முயற்சிக்கவும்."
            : "Failed to authenticate with Google. Please try again."
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isTamil]);

  const formError = state?.error && (isTamil ? (TA_ERRORS[state.error] ?? state.error) : state.error);
  const error = formError || oauthError;

  return (
    <div className="thabaal-formwrap">
      <form
        action={(formData) => {
          setOauthError(null);
          return action(formData);
        }}
        className="thabaal-form"
      >
        <h1>{isTamil ? "உள்நுழைக" : "Sign in"}</h1>
        <p className="sub">
          {isTamil
            ? "மீண்டும் வருக! தொடர உள்நுழையவும்"
            : "Welcome back! Please sign in to continue"}
        </p>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="w-full mt-4 mb-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs font-semibold text-red-400"
          >
            {error}
          </div>
        )}

        {/* Continue with Google */}
        <a href="/api/auth/google" className="thabaal-google">
          <svg className="shrink-0" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>{isTamil ? "Google மூலம் தொடரவும்" : "Continue with Google"}</span>
        </a>

        {/* Divider */}
        <div className="thabaal-divider">
          <i />
          <span>{isTamil ? "அல்லது" : "or continue with email"}</span>
          <i />
        </div>

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
