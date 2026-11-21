"use client";

import { Eye, EyeOff } from "@/components/icons";
import { useActionState, useState } from "react";
import { requestPasswordReset, resetPassword } from "./reset-actions";

type Lang = "en" | "ta";

const TA: Record<string, string> = {
  "Enter the email you sign in with.": "நீங்கள் உள்நுழையும் மின்னஞ்சலை உள்ளிடுங்கள்.",
  "Too many reset requests. Wait 15 minutes and try again.": "பல முறை கேட்டுவிட்டீர்கள். 15 நிமிடம் கழித்து மீண்டும் முயற்சிக்கவும்.",
  "Use 8 or more characters.": "குறைந்தது 8 எழுத்துகள் வேண்டும்.",
  "That password is too long.": "கடவுச்சொல் மிக நீளமாக உள்ளது.",
  "The two passwords don't match.": "இரண்டு கடவுச்சொற்களும் ஒன்றாக இல்லை.",
  "This link has expired or was already used. Ask for a new one.": "இந்த இணைப்பு காலாவதியானது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது. புதியதைக் கேளுங்கள்.",
};
const say = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);
const err = (lang: Lang, e: string) => (lang === "ta" ? (TA[e] ?? e) : e);

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "w-full mt-4 mb-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs font-semibold text-red-400"
          : "w-full mt-4 mb-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-xs font-semibold leading-relaxed text-emerald-600"
      }
    >
      {children}
    </div>
  );
}

const MailIcon = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const LockIcon = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/** Step 1: ask for a reset link by email. */
export function ForgotForm({ lang = "en" }: { lang?: Lang }) {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <div className="thabaal-formwrap">
      <form action={action} className="thabaal-form">
        <h1>{say(lang, "Forgot password?", "கடவுச்சொல் மறந்துவிட்டதா?")}</h1>
        <p className="sub">
          {say(lang, "Enter your login email. We'll send a link to set a new password.", "உங்கள் உள்நுழைவு மின்னஞ்சலை உள்ளிடுங்கள். புதிய கடவுச்சொல் அமைக்க இணைப்பு அனுப்புவோம்.")}
        </p>

        {state?.error && <Alert>{err(lang, state.error)}</Alert>}
        {state?.sent && (
          <Alert tone="ok">
            {say(
              lang,
              `If ${state.email} has a Thabaal login, a reset link is on its way. It works once, for 30 minutes. Check spam too.`,
              `${state.email} க்கு Thabaal கணக்கு இருந்தால், இணைப்பு அனுப்பப்பட்டுள்ளது. அது 30 நிமிடம், ஒரு முறை மட்டும் வேலை செய்யும். Spam-ஐயும் பாருங்கள்.`,
            )}
          </Alert>
        )}

        <div className="thabaal-field">
          <MailIcon />
          <input
            name="email"
            type="email"
            aria-label={say(lang, "Email", "மின்னஞ்சல்")}
            placeholder={say(lang, "Email id", "மின்னஞ்சல் முகவரி")}
            autoComplete="email"
            required
            defaultValue={state?.email}
          />
        </div>

        <button type="submit" disabled={pending} className="thabaal-login-btn">
          {pending ? say(lang, "Sending...", "அனுப்புகிறது...") : state?.sent ? say(lang, "Send again", "மீண்டும் அனுப்பு") : say(lang, "Send reset link", "இணைப்பை அனுப்பு")}
        </button>

        <p className="thabaal-signup auth-foot">
          {say(lang, "Remembered it? ", "நினைவுக்கு வந்ததா? ")}
          <a href="/login">{say(lang, "Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</a>
        </p>
      </form>
    </div>
  );
}

/** Step 2: the link from the email lands here to set the new password. */
export function ResetForm({ lang = "en", token, valid }: { lang?: Lang; token: string; valid: boolean }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again.length > 0 && again !== pw;

  if (!valid) {
    return (
      <div className="thabaal-formwrap">
        <div className="thabaal-form">
          <h1>{say(lang, "Link expired", "இணைப்பு காலாவதியானது")}</h1>
          <p className="sub">
            {say(lang, "This reset link has expired or was already used. Ask for a new one.", "இந்த இணைப்பு காலாவதியானது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது. புதியதைக் கேளுங்கள்.")}
          </p>
          <a href="/forgot-password" className="thabaal-login-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            {say(lang, "Get a new link", "புதிய இணைப்பு பெறு")}
          </a>
          <p className="thabaal-signup auth-foot">
            <a href="/login">{say(lang, "Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="thabaal-formwrap">
      <form action={action} className="thabaal-form">
        <h1>{say(lang, "Set a new password", "புதிய கடவுச்சொல்")}</h1>
        <p className="sub">
          {say(lang, "Use 8 or more characters. You'll be signed out on every other device.", "குறைந்தது 8 எழுத்துகள். மற்ற எல்லா சாதனங்களிலும் வெளியேற்றப்படுவீர்கள்.")}
        </p>

        {state?.error && <Alert>{err(lang, state.error)}</Alert>}
        <input type="hidden" name="token" value={token} />

        <div className="thabaal-field">
          <LockIcon />
          <input
            name="password"
            type={show ? "text" : "password"}
            aria-label={say(lang, "New password", "புதிய கடவுச்சொல்")}
            placeholder={say(lang, "New password", "புதிய கடவுச்சொல்")}
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button type="button" className="thabaal-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4.5 shrink-0 text-[#5d6e86]" /> : <Eye className="size-4.5 shrink-0 text-[#5d6e86]" />}
          </button>
        </div>
        <div className="thabaal-field">
          <LockIcon />
          <input
            name="again"
            type={show ? "text" : "password"}
            aria-label={say(lang, "Type it again", "மீண்டும் உள்ளிடுங்கள்")}
            placeholder={say(lang, "Type it again", "மீண்டும் உள்ளிடுங்கள்")}
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
        {mismatch && <Alert>{err(lang, "The two passwords don't match.")}</Alert>}

        <button type="submit" disabled={pending || mismatch} className="thabaal-login-btn">
          {pending ? say(lang, "Saving...", "சேமிக்கிறது...") : say(lang, "Save new password", "புதிய கடவுச்சொல்லைச் சேமி")}
        </button>

        <p className="thabaal-signup auth-foot">
          <a href="/login">{say(lang, "Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</a>
        </p>
      </form>
    </div>
  );
}
