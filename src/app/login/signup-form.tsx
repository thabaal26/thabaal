"use client";

import { Eye, EyeOff } from "@/components/icons";
import { useActionState, useState } from "react";
import { signup } from "./signup-actions";

/** The sign-up errors the server sends, in Tamil. Anything unexpected is shown as sent. */
const TA_ERRORS: Record<string, string> = {
  "Enter your business name (2 to 60 characters).": "உங்கள் வணிகப் பெயரை உள்ளிடவும் (2 முதல் 60 எழுத்துகள்).",
  "Enter just the city you deliver from, e.g. Chennai.": "நீங்கள் டெலிவரி செய்யும் நகரத்தின் பெயரை மட்டும் உள்ளிடவும், எ.கா. சென்னை.",
  "Enter your name.": "உங்கள் பெயரை உள்ளிடவும்.",
  "Enter a valid email address.": "சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.",
  "Password must be at least 8 characters.": "கடவுச்சொல் குறைந்தது 8 எழுத்துகள் இருக்க வேண்டும்.",
  "Please accept the Terms and Privacy Policy to continue.": "தொடர விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கையை ஏற்கவும்.",
  "This email already has an account. Sign in instead, or use a different email.": "இந்த மின்னஞ்சலுக்கு ஏற்கனவே கணக்கு உள்ளது. உள்நுழையவும் அல்லது வேறு மின்னஞ்சலைப் பயன்படுத்தவும்.",
};

export function SignupForm({ lang = "en" }: { lang?: "en" | "ta" }) {
  const [state, action, pending] = useActionState(signup, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const ta = lang === "ta";
  const v = state?.values;
  const error = state?.error && (ta ? (TA_ERRORS[state.error] ?? state.error) : state.error);
  const t = (en: string, tamil: string) => (ta ? tamil : en);

  return (
    <div className="thabaal-formwrap">
      <form action={action} className="thabaal-form">
        <h1>{t("Create your account", "உங்கள் கணக்கை உருவாக்குங்கள்")}</h1>
        <p className="sub">
          {t("Set up your business, pick a package and start using Thabaal once your payment is verified.", "வணிகத்தை அமைத்து, திட்டத்தைத் தேர்ந்தெடுங்கள்; கட்டணம் சரிபார்க்கப்பட்டதும் தபாலைப் பயன்படுத்தத் தொடங்கலாம்.")}
        </p>

        {error && (
          <div role="alert" className="w-full mt-4 mb-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs font-semibold text-red-400">
            {error}
          </div>
        )}

        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 9l1.5-5h15L21 9" />
            <path d="M4 9v11h16V9" />
            <path d="M9 20v-6h6v6" />
          </svg>
          <input id="business" name="business" type="text" aria-label={t("Business name", "வணிகப் பெயர்")} placeholder={t("Business name", "வணிகப் பெயர்")} autoComplete="organization" required maxLength={60} defaultValue={v?.business} />
        </div>

        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <input id="city" name="city" type="text" aria-label={t("City you deliver from", "டெலிவரி செய்யும் நகரம்")} placeholder={t("City you deliver from, e.g. Chennai", "நகரம், எ.கா. சென்னை")} autoComplete="address-level2" required maxLength={40} defaultValue={v?.city} />
        </div>

        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
          <input id="name" name="name" type="text" aria-label={t("Your name", "உங்கள் பெயர்")} placeholder={t("Your name", "உங்கள் பெயர்")} autoComplete="name" required maxLength={60} defaultValue={v?.name} />
        </div>

        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <input id="email" name="email" type="email" aria-label={t("Email", "மின்னஞ்சல்")} placeholder={t("Email id", "மின்னஞ்சல் முகவரி")} autoComplete="email" required defaultValue={v?.email} />
        </div>

        <div className="thabaal-field">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input id="password" name="password" type={showPassword ? "text" : "password"} aria-label={t("Password", "கடவுச்சொல்")} placeholder={t("Password (at least 8 characters)", "கடவுச்சொல் (8+ எழுத்துகள்)")} autoComplete="new-password" required minLength={8} />
          <button type="button" className="thabaal-eye" onClick={() => setShowPassword(!showPassword)} aria-label={ta ? (showPassword ? "கடவுச்சொல்லை மறை" : "கடவுச்சொல்லைக் காட்டு") : showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="size-4.5 shrink-0 text-[#5d6e86]" /> : <Eye className="size-4.5 shrink-0 text-[#5d6e86]" />}
          </button>
        </div>

        <label className="thabaal-row" style={{ justifyContent: "flex-start", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" name="terms" required defaultChecked={v?.agreed} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ fontSize: 13, lineHeight: 1.45 }}>
            {ta ? (
              <>
                நான் <a href="/terms" target="_blank" rel="noreferrer">விதிமுறைகள்</a> மற்றும் <a href="/privacy" target="_blank" rel="noreferrer">தனியுரிமைக் கொள்கையை</a> ஏற்கிறேன்.
              </>
            ) : (
              <>
                I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
              </>
            )}
          </span>
        </label>

        <button type="submit" disabled={pending} className="thabaal-login-btn">
          {pending ? t("Creating your account...", "கணக்கு உருவாக்கப்படுகிறது...") : t("Create account", "கணக்கை உருவாக்கு")}
        </button>

        <p className="thabaal-signup auth-foot">
          {t("Already have an account? ", "ஏற்கனவே கணக்கு உள்ளதா? ")}
          <a href="/login">{t("Sign in", "உள்நுழைக")}</a>
        </p>
      </form>
    </div>
  );
}
