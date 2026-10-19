"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { LoginIllustration } from "./login-illustration";
import { LandingSections } from "./landing-sections";
import { MascotIntro } from "./mascot-intro";
import { ScrollDownPrompt } from "./scroll-prompt";
import { SiteHeader } from "./site-header";
import { ScrollReveal } from "@/components/motion";
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

export function ThabaalSignIn() {
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
        {/* Language Switcher Pill (Top-Left of Screen / Sky on mobile) */}
        <div
          className="thabaal-lang-pill"
          role="group"
          aria-label={lang === "ta" ? "மொழி" : "Language"}
        >
          <span className="thabaal-lang-slider" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLang("en")}
            className={lang === "en" ? "active" : ""}
            aria-pressed={lang === "en"}
            lang="en"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("ta")}
            className={lang === "ta" ? "active" : ""}
            aria-pressed={lang === "ta"}
            lang="ta"
          >
            தமிழ்
          </button>
        </div>

        {/* LEFT COLUMN: SIGN IN FORM */}
        <section className="thabaal-left">
          {/* Brand Wordmark with Mascot Bird Perched on Top */}
          <ScrollReveal direction="down" duration={500} className="w-full">
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
          </ScrollReveal>

          {/* Credential Form. Privacy, terms and the rest are in the page footer below (one place, not two). */}
          <LoginForm lang={lang} />
        </section>

        {/* RIGHT COLUMN: ANIMATED SKY WITH BIRD & TOGGLE */}
        <LoginIllustration
          isNight={isNight}
          onToggleTheme={toggleTheme}
          lang={lang}
        />
      </div>

      {/* Floating Attention "Scroll down to view" prompt with pulsing circle bar */}
      <ScrollDownPrompt lang={lang} />

      {/* What Thabaal does: features, the order journey, pricing and questions, below the sign-in. */}
      <LandingSections lang={lang} />
    </main>
  );
}
