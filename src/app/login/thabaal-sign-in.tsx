"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { LoginForm } from "./login-form";

const noop = () => () => {};

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

const CLOUDS = [
  { top: 6, w: 150, dur: 45, delay: 0, opacity: 0.55 },
  { top: 20, w: 130, dur: 52, delay: -8, opacity: 0.6 },
  { top: 38, w: 140, dur: 40, delay: -18, opacity: 0.5 },
  { top: 56, w: 220, dur: 32, delay: -12, opacity: 0.8 },
  { top: 72, w: 240, dur: 36, delay: -4, opacity: 0.85 },
  { top: 12, w: 320, dur: 24, delay: -16, opacity: 0.95 },
  { top: 82, w: 280, dur: 28, delay: -22, opacity: 0.9 },
];

export function ThabaalSignIn() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const syncedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "day" as const);
  const [localTheme, setLocalTheme] = useState<"day" | "night" | null>(null);
  const theme = localTheme ?? syncedTheme;
  const [lang, setLang] = useState<"en" | "ta">("en");

  const toggleTheme = () => {
    const next = theme === "day" ? "night" : "day";
    setLocalTheme(next);
    try {
      localStorage.setItem("thabaal-theme", next);
    } catch {}
  };

  const isNight = theme === "night";
  const isTamil = lang === "ta";

  return (
    <div
      data-theme={theme}
      className={`min-h-dvh w-full transition-colors duration-700 ${
        isNight ? "bg-[#07142b] text-[#eef3fb]" : "bg-thabaal-cream text-thabaal-ink"
      }`}
    >
      <div className="grid min-h-dvh w-full lg:grid-cols-[1fr_1.15fr]">
        {/* LEFT COLUMN: Sign In Form with Glass Panel */}
        <section className="relative z-10 flex flex-col justify-between px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:px-10 lg:px-14">
          {/* Top Brand Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-32 sm:h-10 sm:w-36">
                <Image
                  src={isTamil ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
                  alt={isTamil ? "தபால்" : "Thabaal"}
                  fill
                  priority
                  className="object-contain object-left"
                />
              </div>
            </div>

            {/* Language & Theme Pill */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-line-strong/30 bg-panel/70 p-0.5 text-xs font-semibold backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`rounded-full px-2.5 py-1 transition ${
                    lang === "en" ? "bg-thabaal-mango text-thabaal-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("ta")}
                  className={`rounded-full px-2.5 py-1 font-tamil transition ${
                    lang === "ta" ? "bg-thabaal-mango text-thabaal-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  தமிழ்
                </button>
              </div>

              {/* Mobile theme toggle icon */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isNight ? "Switch to day" : "Switch to night"}
                className="grid size-9 place-items-center rounded-full border border-line-strong/30 bg-panel/70 text-sm shadow-sm transition active:scale-95 lg:hidden"
              >
                {isNight ? "🌙" : "☀️"}
              </button>
            </div>
          </div>

          {/* Mobile sky header preview (compact on mobile) */}
          <div className="mt-4 overflow-hidden rounded-card lg:hidden">
            <div
              className={`relative h-36 w-full overflow-hidden transition-all duration-700 ${
                isNight
                  ? "bg-gradient-to-b from-[#040a1d] via-[#0c1844] to-[#2b2e72]"
                  : "bg-gradient-to-b from-[#76bff8] via-[#a9d8ff] to-[#ffcba3]"
              }`}
            >
              <div
                className={`absolute right-8 top-4 size-14 rounded-full transition-all duration-700 ${
                  isNight
                    ? "translate-y-1 bg-transparent shadow-[inset_-0.35em_0.1em_0_0_#f8f4de] drop-shadow-[0_0_12px_rgba(255,248,210,0.55)]"
                    : "bg-radial from-[#fffbe0] via-[#ffd84d] to-[#ffc533] shadow-[0_0_40px_16px_rgba(255,220,120,0.65)]"
                }`}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-16 w-32 animate-[float_3.4s_ease-in-out_infinite]">
                  <Image
                    src="/brands/thabaal/thabaal-logo-en.png"
                    alt="Flying bird"
                    fill
                    className="object-contain drop-shadow-md"
                  />
                </div>
              </div>
              <p className="absolute bottom-2 left-3 text-2xs font-semibold uppercase tracking-wider text-white/90">
                {isNight ? "Night Flight · 24/7 Delivery" : "Swift Carrier · Messages That Move"}
              </p>
            </div>
          </div>

          {/* Center Card: Form Container */}
          <div className="mx-auto my-auto w-full max-w-sm py-8 sm:py-10">
            <div className="glass-panel p-6 sm:p-8">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-thabaal-mango/20 px-3 py-1 text-2xs font-bold uppercase tracking-widest text-brand-deep">
                  <span className="size-1.5 rounded-full bg-signal-green" />
                  {isTamil ? "நம்பகமான தபால்" : "A message with momentum"}
                </span>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                  {isTamil ? "வணக்கம், உள்நுழையவும்" : "Welcome back"}
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  {isTamil
                    ? "உங்கள் வாடிக்கையாளர் பிரச்சாரங்களையும் ஆர்டர்களையும் விரைவாக நிர்வகிக்கவும்."
                    : "Warm, quick, and dependable identity for customer messaging, campaigns, and orders."}
                </p>
              </div>

              {/* Real Next.js Action LoginForm */}
              <LoginForm lang={lang} />
            </div>

            {/* Bottom info banner */}
            <div className="mt-4 flex items-center justify-between px-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-signal-green" />
                {isTamil ? "நட்பு · வேகம் · உறுதி" : "Friendly · Swift · Reliable"}
              </span>
              <a
                href="https://thabaal.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-ink"
              >
                <span>About Thabaal</span>
                <ArrowUpRight className="size-3" />
              </a>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted sm:text-left">
            {isTamil
              ? "© 2026 தபால். அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை."
              : "© 2026 Thabaal. Messages that move business. Access by invitation."}
          </p>
        </section>

        {/* RIGHT COLUMN: Creative Animated Sky & Carrier Bird in Flight */}
        <section
          aria-hidden="true"
          className="relative hidden min-h-dvh select-none overflow-hidden lg:block"
        >
          {/* Animated Sky Gradient (Day / Night) */}
          <div
            className={`absolute inset-0 transition-opacity duration-1000 ${
              isNight
                ? "bg-gradient-to-b from-[#040a1d] via-[#0c1844] to-[#2b2e72] opacity-100"
                : "bg-gradient-to-b from-[#76bff8] via-[#a9d8ff] to-[#ffcba3] opacity-100"
            }`}
          />

          {/* Twinkling Stars (Night) */}
          {mounted && isNight && (
            <div className="absolute inset-0 transition-opacity duration-1000">
              {Array.from({ length: 48 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute rounded-full bg-white animate-[twinkle_3s_ease-in-out_infinite]"
                  style={{
                    left: `${(i * 2.1 * 13) % 96}%`,
                    top: `${(i * 1.9 * 11) % 72}%`,
                    width: `${(i % 3) + 1.5}px`,
                    height: `${(i % 3) + 1.5}px`,
                    animationDelay: `${(i * 0.17) % 3}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Sun (Day) / Moon (Night) */}
          <div
            className={`absolute right-[16%] top-[14%] size-28 rounded-full transition-all duration-1000 ${
              isNight
                ? "translate-y-2 scale-90 bg-transparent shadow-[inset_-0.6em_0.16em_0_0_#f8f4de] drop-shadow-[0_0_24px_rgba(255,248,210,0.6)]"
                : "bg-radial from-[#fffbe0] via-[#ffd84d] to-[#ffc533] shadow-[0_0_90px_35px_rgba(255,220,120,0.7),0_0_180px_80px_rgba(255,200,120,0.35)]"
            }`}
          />

          {/* Floating Clouds Layer */}
          <div
            className={`pointer-events-none absolute inset-0 transition-colors duration-1000 ${
              isNight ? "text-[#8ea3cb]/50" : "text-white/80"
            }`}
          >
            {CLOUDS.map((c, i) => (
              <div
                key={i}
                className="absolute animate-[drift_linear_infinite]"
                style={{
                  top: `${c.top}%`,
                  width: `${c.w}px`,
                  opacity: c.opacity,
                  animationDuration: `${c.dur}s`,
                  animationDelay: `${c.delay}s`,
                }}
              >
                <svg viewBox="0 0 300 100" className="w-full animate-[puff_6s_ease-in-out_infinite_alternate]">
                  <path
                    fill="currentColor"
                    d="M14 94C10 86 16 80 13 70C10 56 22 40 38 36C48 20 70 12 86 20C94 24 98 30 99 38C104 33 114 33 122 38C133 45 136 58 134 68C133 73 132 78 138 78C145 78 150 74 158 77C168 80 180 80 200 80C230 80 256 80 276 81C288 82 292 90 284 94Z"
                  />
                </svg>
              </div>
            ))}
          </div>

          {/* Floating Thabaal Carrier Bird Hero */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative flex flex-col items-center">
              {/* Speed wind streaks */}
              <div className="relative w-72">
                <span className="absolute -left-6 top-8 h-1 w-16 animate-[streak_1.4s_linear_infinite] rounded-full bg-white/70" />
                <span className="absolute -left-12 top-16 h-1 w-24 animate-[streak_1.8s_linear_infinite_0.4s] rounded-full bg-white/60" />
                <span className="absolute -left-4 top-24 h-1 w-14 animate-[streak_1.2s_linear_infinite_0.8s] rounded-full bg-white/50" />
              </div>

              {/* Carrier Bird with Floating Motion */}
              <div className="relative size-64 animate-[float_3.4s_ease-in-out_infinite] drop-shadow-2xl sm:size-72">
                <Image
                  src={isTamil ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
                  alt="Thabaal in flight"
                  fill
                  priority
                  className="object-contain"
                />
              </div>

              {/* Slogan Pill */}
              <div className="mt-4 rounded-full border border-white/20 bg-black/25 px-5 py-2 text-center backdrop-blur-md">
                <p className="text-sm font-semibold tracking-wide text-white">
                  {isTamil ? "செய்திகள் கொண்டு செல்லும் வேகம்" : "Messages that move business"}
                </p>
                <p className="text-2xs text-white/70">
                  {isNight ? "Active 24/7 · High Throughput Infrastructure" : "Warm, quick, dependable customer campaigns"}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Day/Night Orbit Toggle Button */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute -inset-1.5 animate-pulse rounded-full border-2 border-white/50" />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isNight ? "Switch to day mode" : "Switch to night mode"}
                className="relative flex h-14 w-28 cursor-pointer items-center rounded-full border-2 border-white/40 bg-black/40 p-1 shadow-pop backdrop-blur-lg transition active:scale-95"
              >
                {/* Track background */}
                <span className="absolute inset-0 rounded-full overflow-hidden">
                  <span
                    className={`absolute inset-0 transition-opacity duration-500 ${
                      isNight
                        ? "bg-gradient-to-r from-[#091124] to-[#1c294e] opacity-100"
                        : "bg-gradient-to-r from-[#2177d6] to-[#74baf7] opacity-100"
                    }`}
                  />
                </span>

                {/* Sliding knob with sun/moon face */}
                <span
                  className={`relative z-10 flex size-11 items-center justify-center rounded-full shadow-md transition-transform duration-500 ${
                    isNight
                      ? "translate-x-14 bg-gradient-to-br from-[#f2f2f2] to-[#b9b9be] text-gray-800"
                      : "translate-x-0 bg-gradient-to-br from-[#fff3a0] to-[#f7b81c] text-amber-900"
                  }`}
                >
                  <span className="text-base select-none">{isNight ? "🌙" : "☀️"}</span>
                </span>
              </button>
            </div>
            <span className="text-2xs font-bold uppercase tracking-widest text-white/80 drop-shadow">
              {isNight ? "Night Sky (Click to switch)" : "Day Sky (Click to switch)"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
