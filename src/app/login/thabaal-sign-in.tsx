"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { LoginIllustration } from "./login-illustration";
import "./thabaal-login.css";

function getThemeSnapshot(): "day" | "night" {
  if (typeof window === "undefined") return "day";
  try {
    const saved = localStorage.getItem("thabaal-theme");
    if (saved === "night" || saved === "day") return saved;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "night";
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
  const syncedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "day" as const);
  const [localTheme, setLocalTheme] = useState<"day" | "night" | null>(null);
  const theme = localTheme ?? syncedTheme;
  const syncedLang = useSyncExternalStore(subscribeTheme, getLangSnapshot, () => "en" as const);
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
    <main className="thabaal-page" data-theme={theme} data-lang={lang} lang={lang}>
      {/* LEFT COLUMN: SIGN IN FORM */}
      <section className="thabaal-left">
        {/* Language Switcher Pill */}
        <div className="thabaal-lang-pill" role="group" aria-label={lang === "ta" ? "மொழி" : "Language"}>
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

        {/* Brand Bird Mark & Adaptive Day/Night Wordmark */}
        <div className="thabaal-brand">
          <Image
            src="/brands/thabaal/mark.png"
            className="mark"
            alt="Thabaal Bird"
            width={180}
            height={100}
            priority
          />
          {/* English and Tamil wordmarks, each in a day and a night colour; CSS shows the right one. */}
          <div className="words" role="img" aria-label={lang === "ta" ? "தபால்" : "thabaal"}>
            <Image src="/brands/thabaal/w-day.png" className="w-day w-en" alt="" width={320} height={90} priority />
            <Image src="/brands/thabaal/w-night.png" className="w-night w-en" alt="" width={320} height={90} priority />
            <Image src="/brands/thabaal/w-ta-day.png" className="w-day w-ta" alt="" width={320} height={90} priority />
            <Image src="/brands/thabaal/w-ta-night.png" className="w-night w-ta" alt="" width={320} height={90} priority />
          </div>
        </div>

        {/* Credential Form */}
        <LoginForm lang={lang} />
      </section>

      {/* RIGHT COLUMN: ANIMATED SKY WITH BIRD & TOGGLE */}
      <LoginIllustration isNight={isNight} onToggleTheme={toggleTheme} lang={lang} />
    </main>
  );
}
