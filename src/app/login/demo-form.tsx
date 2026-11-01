"use client";

// The website's free demo form (landing page, #start). Only what we need to call back: WhatsApp number, shop and name
// are asked; town, what they sell and the plan help the call but can be left out. It lands in Admin › Enquiries.

import { useActionState } from "react";
import { requestDemo } from "./demo-actions";
import { DEMO_URL } from "./demo-link";

const PLAN_NAMES: Record<string, string> = { starter: "Starter", growth: "Growth", business: "Business" };

export function DemoForm({ lang, plan, onPlan }: { lang: "en" | "ta"; plan: string; onPlan: (p: string) => void }) {
  const ta = lang === "ta";
  const [state, action, pending] = useActionState(requestDemo, undefined);
  const v = state?.values;

  if (state?.ok) {
    // Thanks, what happens next and when, and the quicker way if they can't wait.
    const wa = DEMO_URL.startsWith("https://wa.me/")
      ? `${DEMO_URL.split("?")[0]}?text=${encodeURIComponent(`Hi Thabaal, I just asked for a demo for ${state.shop ?? "my shop"}.`)}`
      : DEMO_URL;
    return (
      <div className="demo-form-card demo-form-done" role="status" id="demo-done">
        <h3>{ta ? `நன்றி, ${state.person ?? ""}! 🙏` : `Thank you, ${state.person ?? ""}! 🙏`}</h3>
        <p>
          {state.again
            ? ta
              ? "உங்கள் கோரிக்கை ஏற்கனவே எங்களிடம் உள்ளது. இன்றே அழைக்கிறோம்."
              : "We already have your request, and we'll get back to you today."
            : ta
              ? `ஒரு வேலை மணி நேரத்திற்குள் (காலை 10 – இரவு 7) +91 ${state.phone} எண்ணுக்கு WhatsApp செய்கிறோம்.`
              : `We'll WhatsApp you on +91 ${state.phone} within one working hour (10 AM to 7 PM).`}
        </p>
        <a className="btn btn-dark" href={wa} target={wa.startsWith("https://") ? "_blank" : undefined} rel="noopener noreferrer">
          {ta ? "இப்போதே WhatsApp-ல் பேசுங்கள்" : "Chat now on WhatsApp"}
        </a>
      </div>
    );
  }

  return (
    <form className="demo-form-card" action={action} id="demo-form" key={state?.error ? JSON.stringify(v) : "new"}>
      <h3>{ta ? "இலவச 15 நிமிட டெமோ" : "Get a free 15-minute demo"}</h3>
      <p className="demo-form-sub">{ta ? "பணம் தேவையில்லை. உங்கள் கடைக்கு எப்படி வேலை செய்யும் என்று காட்டுவோம்." : "No payment needed. We show you how it works for your shop."}</p>
      {/* People never see this; robots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="demo-hp" />
      <label className="demo-field">
        <span>{ta ? "உங்கள் WhatsApp எண்" : "Your WhatsApp number"}</span>
        <input id="demo-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={16} placeholder="98765 43210" defaultValue={v?.phone ?? ""} />
      </label>
      <label className="demo-field">
        <span>{ta ? "கடையின் பெயர்" : "Shop name"}</span>
        <input id="demo-shop" name="shop" type="text" autoComplete="organization" required maxLength={120} placeholder={ta ? "எ.கா. மீனா ஆயில்ஸ்" : "e.g. Meena Oils"} defaultValue={v?.shop ?? ""} />
      </label>
      <label className="demo-field">
        <span>{ta ? "உங்கள் பெயர்" : "Your name"}</span>
        <input id="demo-person" name="person" type="text" autoComplete="name" required maxLength={80} defaultValue={v?.person ?? ""} />
      </label>
      <div className="demo-row">
        <label className="demo-field">
          <span>
            {ta ? "ஊர்" : "Town"} <i>{ta ? "(விருப்பம்)" : "(optional)"}</i>
          </span>
          <input id="demo-town" name="town" type="text" autoComplete="address-level2" maxLength={60} placeholder={ta ? "எ.கா. மதுரை" : "e.g. Madurai"} defaultValue={v?.town ?? ""} />
        </label>
        <label className="demo-field">
          <span>
            {ta ? "என்ன விற்கிறீர்கள்" : "What you sell"} <i>{ta ? "(விருப்பம்)" : "(optional)"}</i>
          </span>
          <input id="demo-sells" name="sells" type="text" maxLength={120} placeholder={ta ? "எ.கா. எண்ணெய், மளிகை" : "e.g. oils, groceries"} defaultValue={v?.sells ?? ""} />
        </label>
      </div>
      <label className="demo-field">
        <span>
          {ta ? "திட்டம்" : "Plan"} <i>{ta ? "(விருப்பம்)" : "(optional)"}</i>
        </span>
        <select id="demo-plan" name="plan" value={plan} onChange={(e) => onPlan(e.target.value)}>
          <option value="">{ta ? "இன்னும் தெரியவில்லை" : "Not sure yet"}</option>
          {Object.entries(PLAN_NAMES).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {state?.error && (
        <p className="demo-form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-dark demo-submit" disabled={pending} aria-busy={pending}>
        {pending ? (ta ? "அனுப்பப்படுகிறது…" : "Sending…") : ta ? "இலவச டெமோ பதிவு செய்க" : "Book my free demo"}
      </button>
      <p className="demo-form-foot">
        {ta ? "ஒரு வேலை மணி நேரத்திற்குள் WhatsApp செய்கிறோம். அல்லது " : "We WhatsApp you within one working hour. Or "}
        <a href={DEMO_URL} target={DEMO_URL.startsWith("https://") ? "_blank" : undefined} rel="noopener noreferrer">
          {ta ? "இப்போதே WhatsApp செய்யுங்கள்" : "chat with us now"}
        </a>
        .
      </p>
    </form>
  );
}
