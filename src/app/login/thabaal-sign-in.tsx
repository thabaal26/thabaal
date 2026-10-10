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

export function ThabaalSignIn() {
  const syncedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "day" as const);
  const [localTheme, setLocalTheme] = useState<"day" | "night" | null>(null);
  const theme = localTheme ?? syncedTheme;
  const [lang, setLang] = useState<"en" | "ta">("en");

  const isNight = theme === "night";

  const toggleTheme = () => {
    const next = theme === "day" ? "night" : "day";
    setLocalTheme(next);
    try {
      localStorage.setItem("thabaal-theme", next);
    } catch {}
  };

  return (
    <main className="thabaal-page" data-theme={theme}>
      {/* LEFT COLUMN: SIGN IN FORM */}
      <section className="thabaal-left">
        {/* Language Switcher Pill */}
        <div className="thabaal-lang-pill">
          <button
            type="button"
            onClick={() => setLang("en")}
            className={lang === "en" ? "active" : ""}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("ta")}
            className={lang === "ta" ? "active" : ""}
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
          <div className="words">
            <Image
              src="/brands/thabaal/w-day.png"
              className="w-day"
              alt="thabaal"
              width={320}
              height={90}
              priority
            />
            <Image
              src="/brands/thabaal/w-night.png"
              className="w-night"
              alt="thabaal"
              width={320}
              height={90}
              priority
            />
          </div>
        </div>

        {/* Credential Form */}
        <LoginForm lang={lang} />
      </section>

      {/* RIGHT COLUMN: ANIMATED SKY WITH BIRD & TOGGLE */}
      <LoginIllustration isNight={isNight} onToggleTheme={toggleTheme} />
    </main>
  );
}
