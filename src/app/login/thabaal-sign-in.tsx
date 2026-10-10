"use client";

import { useState } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { LoginIllustration } from "./login-illustration";

export function ThabaalSignIn() {
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [lang, setLang] = useState<"en" | "ta">("en");

  const isNight = theme === "night";
  const isTamil = lang === "ta";

  const toggleTheme = () => {
    setTheme((prev) => (prev === "day" ? "night" : "day"));
  };

  return (
    <div
      className={`relative min-h-dvh w-full overflow-x-hidden transition-colors duration-700 flex items-center justify-center p-4 sm:p-6 lg:p-8 ${
        isNight ? "bg-[#090814]" : "bg-[#D8C4F8]"
      }`}
    >
      {/* 1. TOPOGRAPHY WAVY CONTOUR BACKGROUND */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
        {/* Ambient radial glows */}
        <div
          className={`absolute -top-32 -left-32 size-[600px] rounded-full blur-3xl transition-colors duration-700 ${
            isNight ? "bg-[#1E113E]/50" : "bg-[#C4A5F4]/60"
          }`}
        />
        <div
          className={`absolute -bottom-32 -right-32 size-[650px] rounded-full blur-3xl transition-colors duration-700 ${
            isNight ? "bg-[#160B30]/60" : "bg-[#B790EE]/50"
          }`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[800px] rounded-full blur-2xl transition-colors duration-700 ${
            isNight ? "bg-[#140A28]/40" : "bg-[#E5D7FA]/40"
          }`}
        />

        {/* Topography flow lines SVG */}
        <svg
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
            isNight ? "opacity-25" : "opacity-40"
          }`}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1440 900"
        >
          <path
            d="M-100 150 C 200 80, 450 250, 800 120 C 1150 -10, 1350 220, 1600 160"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.45"
          />
          <path
            d="M-100 280 C 250 220, 500 380, 850 260 C 1200 140, 1380 340, 1600 290"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.4"
          />
          <path
            d="M-100 420 C 300 360, 550 510, 900 400 C 1250 290, 1420 480, 1600 430"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.35"
          />
          <path
            d="M-100 560 C 350 500, 600 650, 950 540 C 1300 430, 1460 620, 1600 570"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.4"
          />
          <path
            d="M-100 700 C 400 640, 650 790, 1000 680 C 1350 570, 1500 760, 1600 710"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.35"
          />
          <path
            d="M-100 840 C 450 780, 700 930, 1050 820 C 1400 710, 1540 900, 1600 850"
            fill="none"
            stroke={isNight ? "#7C3AED" : "#9E70E8"}
            strokeWidth="1.5"
            strokeOpacity="0.3"
          />

          <ellipse cx="250" cy="300" rx="200" ry="90" fill="none" stroke={isNight ? "#7C3AED" : "#9E70E8"} strokeWidth="1.2" strokeOpacity="0.25" transform="rotate(-12 250 300)" />
          <ellipse cx="250" cy="300" rx="140" ry="60" fill="none" stroke={isNight ? "#7C3AED" : "#9E70E8"} strokeWidth="1.2" strokeOpacity="0.25" transform="rotate(-12 250 300)" />
          <ellipse cx="1200" cy="650" rx="240" ry="110" fill="none" stroke={isNight ? "#7C3AED" : "#9E70E8"} strokeWidth="1.2" strokeOpacity="0.25" transform="rotate(15 1200 650)" />
          <ellipse cx="1200" cy="650" rx="170" ry="75" fill="none" stroke={isNight ? "#7C3AED" : "#9E70E8"} strokeWidth="1.2" strokeOpacity="0.25" transform="rotate(15 1200 650)" />
        </svg>
      </div>

      {/* 2. MAIN SIGN-IN CARD */}
      <div className="relative z-10 w-full max-w-[980px] rounded-[36px] bg-[#111116] border border-white/10 shadow-[0_30px_90px_-15px_rgba(25,10,50,0.65)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.15fr] items-stretch">
          
          {/* LEFT COLUMN: Form Panel */}
          <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-12">
            
            {/* Top Brand Bar */}
            <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
              <div className="flex items-center gap-2.5">
                <div className="relative h-8 w-28 sm:h-9 sm:w-32">
                  <Image
                    src={isTamil ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
                    alt={isTamil ? "தபால்" : "Thabaal"}
                    fill
                    priority
                    className="object-contain object-left"
                  />
                </div>
              </div>

              {/* Controls Pill (Theme Toggle & Language Switcher) */}
              <div className="flex items-center gap-2">
                {/* Day / Night Dark Toggle Button */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={isNight ? "Switch to Day Mode" : "Switch to Night Mode"}
                  aria-label={isNight ? "Switch to Day Mode" : "Switch to Night Mode"}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-white/[0.12] active:scale-95"
                >
                  <span className="text-sm select-none">{isNight ? "🌙" : "☀️"}</span>
                  <span className="text-2xs font-semibold text-white/80">{isNight ? "Night" : "Day"}</span>
                </button>

                {/* Language Switcher Pill */}
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] p-0.5 text-xs font-semibold backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setLang("en")}
                    className={`rounded-full px-2.5 py-1 transition ${
                      lang === "en" ? "bg-gradient-to-r from-[#6e2feb] to-[#8854f6] text-white shadow-sm" : "text-white/60 hover:text-white"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang("ta")}
                    className={`rounded-full px-2.5 py-1 font-tamil transition ${
                      lang === "ta" ? "bg-gradient-to-r from-[#6e2feb] to-[#8854f6] text-white shadow-sm" : "text-white/60 hover:text-white"
                    }`}
                  >
                    தமிழ்
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile-only compact scenic preview header */}
            <div className="mb-6 h-36 w-full overflow-hidden rounded-2xl border border-white/10 lg:hidden shadow-md">
              <LoginIllustration isNight={isNight} />
            </div>

            {/* Form Section */}
            <div className="my-auto">
              {/* Heading */}
              <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                <span>{isTamil ? "வணக்கம்" : "Welcome back"}</span>
                <span className="inline-block origin-bottom-right animate-[ring_2s_ease-in-out_infinite]">👋</span>
              </h1>
              <p className="text-xs sm:text-sm text-white/50 mb-7">
                {isTamil
                  ? "வாடிக்கையாளர் பிரச்சாரங்களையும் ஆர்டர்களையும் நிர்வகிக்கவும்"
                  : "Sign in to launch WhatsApp campaigns and manage live orders"}
              </p>

              {/* Real Next.js Action Form */}
              <LoginForm lang={lang} />
            </div>

            {/* Footer Trust Badge */}
            <div className="mt-8 pt-4 border-t border-white/[0.06] flex items-center justify-between text-2xs text-white/40">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isTamil ? "நேரடி ஒத்திசைவு செயலில் உள்ளது" : "Thabaal Engine · Live Cloud Sync"}
              </span>
              <span>© 2026 Thabaal</span>
            </div>
          </div>

          {/* RIGHT COLUMN: Scenic Artwork Card (Desktop) */}
          <div className="hidden lg:block p-3.5 lg:p-4 h-full">
            <div className="relative h-full min-h-[520px] rounded-[28px] overflow-hidden border border-white/10 shadow-inner">
              <LoginIllustration isNight={isNight} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
