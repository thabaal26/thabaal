"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { LoginForm } from "./login-form";
import { LoginIllustration } from "./login-illustration";

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
  const isTamil = lang === "ta";

  const toggleTheme = () => {
    const next = theme === "day" ? "night" : "day";
    setLocalTheme(next);
    try {
      localStorage.setItem("thabaal-theme", next);
    } catch {}
  };

  return (
    <div
      data-theme={theme}
      className={`relative min-h-dvh w-full overflow-x-hidden transition-colors duration-700 flex items-center justify-center p-3 sm:p-6 lg:p-8 ${
        isNight ? "bg-[#060D1E] text-white" : "bg-[#FFF9F0] text-[#10283B]"
      }`}
    >
      {/* 1. AMBIENT BACKGROUND GLOW & DELICATE CONTOUR TRACE */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
        {/* Soft radial ambient glows */}
        <div
          className={`absolute -top-32 -left-32 size-[650px] rounded-full blur-3xl transition-colors duration-700 ${
            isNight ? "bg-indigo-950/40" : "bg-amber-100/60"
          }`}
        />
        <div
          className={`absolute -bottom-32 -right-32 size-[700px] rounded-full blur-3xl transition-colors duration-700 ${
            isNight ? "bg-blue-950/30" : "bg-orange-100/50"
          }`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[850px] rounded-full blur-2xl transition-colors duration-700 ${
            isNight ? "bg-[#0A1838]/30" : "bg-amber-50/70"
          }`}
        />

        {/* Elegant topography contour flow lines */}
        <svg
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
            isNight ? "opacity-25" : "opacity-45"
          }`}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1440 900"
        >
          <path
            d="M-100 150 C 200 80, 450 250, 800 120 C 1150 -10, 1350 220, 1600 160"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.4"
          />
          <path
            d="M-100 280 C 250 220, 500 380, 850 260 C 1200 140, 1380 340, 1600 290"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.35"
          />
          <path
            d="M-100 420 C 300 360, 550 510, 900 400 C 1250 290, 1420 480, 1600 430"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.3"
          />
          <path
            d="M-100 560 C 350 500, 600 650, 950 540 C 1300 430, 1460 620, 1600 570"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.35"
          />
          <path
            d="M-100 700 C 400 640, 650 790, 1000 680 C 1350 570, 1500 760, 1600 710"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.3"
          />
          <path
            d="M-100 840 C 450 780, 700 930, 1050 820 C 1400 710, 1540 900, 1600 850"
            fill="none"
            stroke={isNight ? "#6366F1" : "#D4AF37"}
            strokeWidth="1.2"
            strokeOpacity="0.25"
          />
        </svg>
      </div>

      {/* 2. MAIN FLOATING CARD CONTAINER */}
      <div
        className={`relative z-10 w-full max-w-[1040px] rounded-[32px] sm:rounded-[36px] overflow-hidden transition-all duration-700 ${
          isNight
            ? "bg-[#0B1528]/95 border border-white/10 shadow-[0_30px_90px_-15px_rgba(0,0,0,0.7)]"
            : "bg-white/95 border border-slate-200/80 shadow-[0_25px_80px_-15px_rgba(16,40,59,0.12)] backdrop-blur-xl"
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.15fr] items-stretch">
          
          {/* LEFT COLUMN: Sign In Form Panel */}
          <div className="flex flex-col justify-between p-6 sm:p-9 lg:p-11">
            
            {/* Top Brand Bar */}
            <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
              {/* Logo (Adapts dynamically to Day & Night!) */}
              <div className="flex items-center gap-2.5">
                <div className="relative h-8 w-28 sm:h-9 sm:w-32">
                  <Image
                    src={
                      isNight
                        ? isTamil
                          ? "/brands/thabaal/thabaal-logo-ta-dark.png"
                          : "/brands/thabaal/thabaal-logo-en-dark.png"
                        : isTamil
                          ? "/brands/thabaal/thabaal-logo-ta.png"
                          : "/brands/thabaal/thabaal-logo-en.png"
                    }
                    alt={isTamil ? "தபால்" : "Thabaal"}
                    fill
                    priority
                    className="object-contain object-left"
                  />
                </div>
              </div>

              {/* Controls (Theme Toggle & Language Switcher) */}
              <div className="flex items-center gap-2">
                {/* Day / Night Dark Toggle Button */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={isNight ? "Switch to Day Mode" : "Switch to Night Mode"}
                  aria-label={isNight ? "Switch to Day Mode" : "Switch to Night Mode"}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition active:scale-95 ${
                    isNight
                      ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
                      : "border-slate-200/90 bg-slate-100/80 text-[#10283B] hover:bg-slate-200/90 shadow-sm"
                  }`}
                >
                  <span className="text-sm select-none">{isNight ? "🌙" : "☀️"}</span>
                  <span className="text-2xs font-bold">{isNight ? "Night" : "Day"}</span>
                </button>

                {/* Language Switcher Pill */}
                <div
                  className={`inline-flex items-center rounded-full border p-0.5 text-xs font-semibold backdrop-blur-md ${
                    isNight
                      ? "border-white/15 bg-white/[0.06]"
                      : "border-slate-200/90 bg-slate-100/80 shadow-sm"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setLang("en")}
                    className={`rounded-full px-2.5 py-1 transition ${
                      lang === "en"
                        ? "bg-[#F5A623] text-[#10283B] font-bold shadow-sm"
                        : isNight
                          ? "text-white/60 hover:text-white"
                          : "text-slate-500 hover:text-[#10283B]"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang("ta")}
                    className={`rounded-full px-2.5 py-1 font-tamil transition ${
                      lang === "ta"
                        ? "bg-[#F5A623] text-[#10283B] font-bold shadow-sm"
                        : isNight
                          ? "text-white/60 hover:text-white"
                          : "text-slate-500 hover:text-[#10283B]"
                    }`}
                  >
                    தமிழ்
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile-only compact scenic preview header */}
            <div className="mb-5 h-36 w-full overflow-hidden rounded-2xl border border-white/10 lg:hidden shadow-md">
              <LoginIllustration isNight={isNight} isTamil={isTamil} onToggleTheme={toggleTheme} />
            </div>

            {/* Form Section */}
            <div className="my-auto">
              {/* Momentum Tag Badge */}
              <div className="mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-extrabold uppercase tracking-widest ${
                    isNight
                      ? "border border-amber-400/20 bg-amber-400/10 text-amber-300"
                      : "border border-amber-200/80 bg-amber-50 text-amber-900 shadow-sm"
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {isTamil ? "நம்பகமான தபால்" : "A message with momentum"}
                </span>
              </div>

              {/* Heading */}
              <h1
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight mb-1.5 flex items-center gap-2 ${
                  isNight ? "text-white" : "text-[#10283B]"
                }`}
              >
                <span>{isTamil ? "வணக்கம், உள்நுழையவும்" : "Welcome back"}</span>
                <span className="inline-block origin-bottom-right animate-[ring_2s_ease-in-out_infinite]">👋</span>
              </h1>
              <p className={`text-xs sm:text-sm mb-6 ${isNight ? "text-white/60" : "text-[#5A6E85]"}`}>
                {isTamil
                  ? "வாடிக்கையாளர் பிரச்சாரங்களையும் ஆர்டர்களையும் நிர்வகிக்கவும்"
                  : "Warm, quick, and dependable identity for customer messaging, campaigns, and orders."}
              </p>

              {/* Dynamic Credential LoginForm */}
              <LoginForm lang={lang} isNight={isNight} />
            </div>

            {/* Footer Trust & Info */}
            <div
              className={`mt-6 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-2xs ${
                isNight ? "border-white/[0.08] text-white/50" : "border-slate-100 text-slate-500"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {isTamil ? "நட்பு · வேகம் · உறுதி" : "Friendly · Swift · Reliable"}
                </span>
                <a
                  href="https://thabaal.com"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-0.5 font-medium transition ${
                    isNight ? "hover:text-white" : "hover:text-[#10283B]"
                  }`}
                >
                  <span>About Thabaal</span>
                  <ArrowUpRight className="size-3" />
                </a>
              </div>
              <span>
                {isTamil
                  ? "© 2026 தபால் · நேரடி கிளவுட் ஒத்திசைவு"
                  : "© 2026 Thabaal · Live Cloud Sync"}
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: Scenic Artwork Hero Card (Desktop) */}
          <div className="hidden lg:block p-3.5 lg:p-4 h-full">
            <div
              className={`relative h-full min-h-[540px] rounded-[28px] overflow-hidden border shadow-inner ${
                isNight ? "border-white/10" : "border-slate-200/70"
              }`}
            >
              <LoginIllustration
                isNight={isNight}
                isTamil={isTamil}
                onToggleTheme={toggleTheme}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
