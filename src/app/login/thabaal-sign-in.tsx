"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";
import { ForgotForm, ResetForm } from "./reset-forms";
import { LoginIllustration } from "./login-illustration";
import { LandingSections } from "./landing-sections";
import type { PriceTable } from "@/lib/plan-prices";
import { MascotIntro } from "./mascot-intro";
import { ScrollDownPrompt } from "./scroll-prompt";
import { SiteHeader } from "./site-header";
import "./thabaal-login.css";

function getThemeSnapshot(): "day" | "night" {
  if (typeof window === "undefined") return "day";
  try {
    const saved = localStorage.getItem("thabaal-theme");
    if (saved === "night" || saved === "day") return saved;
  } catch {}
  return "day";
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/** The last language picked on this device, so the sign-in page opens in it next time. */
function getLangSnapshot(): "en" | "ta" {
  if (typeof window === "undefined") return "en";
  try {
    return localStorage.getItem("thabaal-lang") === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export function ThabaalSignIn({
  mode = "login",
  resetToken = "",
  resetValid = false,
  prices,
}: {
  mode?: "login" | "signup" | "forgot" | "reset";
  resetToken?: string;
  resetValid?: boolean;
  /** Plan prices in force, for the pricing section (read on the server). */
  prices?: PriceTable;
}) {
  const syncedTheme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => "day" as const,
  );
  const [localTheme, setLocalTheme] = useState<"day" | "night" | null>(null);
  const theme = localTheme ?? syncedTheme;
  const syncedLang = useSyncExternalStore(
    subscribeTheme,
    getLangSnapshot,
    () => "en" as const,
  );
  const [localLang, setLocalLang] = useState<"en" | "ta" | null>(null);
  const lang = localLang ?? syncedLang;
  const setLang = (next: "en" | "ta") => {
    setLocalLang(next);
    try {
      localStorage.setItem("thabaal-lang", next);
    } catch {}
  };

  const isNight = theme === "night";

  const toggleTheme = () => {
    const next = theme === "day" ? "night" : "day";
    setLocalTheme(next);
    try {
      localStorage.setItem("thabaal-theme", next);
    } catch {}
  };

  return (
    <main
      className="thabaal-site"
      data-theme={theme}
      data-lang={lang}
      lang={lang}
    >
      <SiteHeader
        lang={lang}
        onToggleLang={() => setLang(lang === "en" ? "ta" : "en")}
        onSelectLang={setLang}
      />
      <div className="thabaal-page" id="top">
        {/* LEFT COLUMN: SIGN IN FORM */}
        <section className="thabaal-left">
          {/* Brand Wordmark with Mascot Bird Perched on Top */}
          <div className="w-full">
            <div className="thabaal-brand">
              {/* English and Tamil wordmarks, each in a day and a night colour; CSS shows the right one. */}
              <div
                className="words"
                role="img"
                aria-label={lang === "ta" ? "தபால்" : "thabaal"}
              >
                <Image
                  src="/brands/thabaal/w-day.png"
                  className="w-day w-en"
                  alt=""
                  width={320}
                  height={90}
                  priority
                />
                <Image
                  src="/brands/thabaal/w-night.png"
                  className="w-night w-en"
                  alt=""
                  width={320}
                  height={90}
                  priority
                />
                <Image
                  src="/brands/thabaal/w-ta-day.png"
                  className="w-day w-ta"
                  alt=""
                  width={320}
                  height={90}
                  priority
                />
                <Image
                  src="/brands/thabaal/w-ta-night.png"
                  className="w-night w-ta"
                  alt=""
                  width={320}
                  height={90}
                  priority
                />
                {/* Mascot bird sitting directly on top of the wordmark's last letter */}
                <MascotIntro lang={lang} />
              </div>
            </div>
          </div>

          {/* Credential Form. Privacy, terms and the rest are in the page footer below (one place, not two). */}
          {mode === "signup" ? (
            <SignupForm lang={lang} />
          ) : mode === "forgot" ? (
            <ForgotForm lang={lang} />
          ) : mode === "reset" ? (
            <ResetForm lang={lang} token={resetToken} valid={resetValid} />
          ) : (
            <LoginForm lang={lang} />
          )}
        </section>

        {/* RIGHT COLUMN: ANIMATED SKY WITH BIRD & TOGGLE */}
        <LoginIllustration
          isNight={isNight}
          onToggleTheme={toggleTheme}
          lang={lang}
        />
      </div>

      {/* Floating Attention "Scroll down to view" prompt with pulsing circle bar */}
      {mode === "login" && <ScrollDownPrompt lang={lang} />}

      {/* What Thabaal does: features, the order journey, pricing and questions, below the sign-in. */}
      {mode === "login" && <LandingSections lang={lang} prices={prices} />}
    </main>
  );
}
