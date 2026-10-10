"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

interface LoginIllustrationProps {
  isNight?: boolean;
  isTamil?: boolean;
  onToggleTheme?: () => void;
}

const noop = () => () => {};

const CLOUDS = [
  { top: 8, w: 130, dur: 36, delay: 0, opacity: 0.6 },
  { top: 24, w: 110, dur: 44, delay: -6, opacity: 0.55 },
  { top: 58, w: 190, dur: 28, delay: -10, opacity: 0.75 },
  { top: 74, w: 210, dur: 32, delay: -4, opacity: 0.8 },
  { top: 14, w: 250, dur: 22, delay: -14, opacity: 0.85 },
];

export function LoginIllustration({
  isNight = false,
  isTamil = false,
  onToggleTheme,
}: LoginIllustrationProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="relative h-full w-full min-h-[500px] select-none overflow-hidden rounded-[26px]">
      {/* 1. ANIMATED SKY GRADIENT */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          isNight
            ? "bg-gradient-to-b from-[#040a1d] via-[#0c1844] to-[#2b2e72] opacity-100"
            : "bg-gradient-to-b from-[#76bff8] via-[#a9d8ff] to-[#ffcba3] opacity-100"
        }`}
      />

      {/* 2. TWINKLING STARS (Night Mode) */}
      {mounted && isNight && (
        <div className="absolute inset-0 transition-opacity duration-1000">
          {Array.from({ length: 48 }).map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white animate-[twinkle_3s_ease-in-out_infinite]"
              style={{
                left: `${(i * 2.3 * 13) % 94 + 3}%`,
                top: `${(i * 1.9 * 11) % 68 + 4}%`,
                width: `${(i % 3) + 1.5}px`,
                height: `${(i % 3) + 1.5}px`,
                animationDelay: `${(i * 0.17) % 3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* 3. CELESTIAL BODY: RADIANT SUN (Day) / GLOWING CRESCENT MOON (Night) */}
      <div
        className={`absolute right-[14%] top-[12%] size-24 sm:size-28 rounded-full transition-all duration-1000 ${
          isNight
            ? "translate-y-2 scale-90 bg-transparent shadow-[inset_-0.55em_0.15em_0_0_#f8f4de] drop-shadow-[0_0_24px_rgba(255,248,210,0.65)]"
            : "bg-radial from-[#fffbe0] via-[#ffd84d] to-[#ffc533] shadow-[0_0_80px_30px_rgba(255,220,120,0.7),0_0_160px_60px_rgba(255,200,120,0.35)] animate-[puff_6s_ease-in-out_infinite_alternate]"
        }`}
      />

      {/* 4. FLOATING CLOUDS LAYER */}
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-1000 ${
          isNight ? "text-[#8ea3cb]/40" : "text-white/85"
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
            <svg
              viewBox="0 0 300 100"
              className="w-full animate-[puff_6s_ease-in-out_infinite_alternate]"
            >
              <path
                fill="currentColor"
                d="M14 94C10 86 16 80 13 70C10 56 22 40 38 36C48 20 70 12 86 20C94 24 98 30 99 38C104 33 114 33 122 38C133 45 136 58 134 68C133 73 132 78 138 78C145 78 150 74 158 77C168 80 180 80 200 80C230 80 256 80 276 81C288 82 292 90 284 94Z"
              />
            </svg>
          </div>
        ))}
      </div>

      {/* 5. CENTER HERO: FLYING THABAAL CARRIER BIRD (Adapts perfectly to Day & Night!) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center -translate-y-6 sm:-translate-y-8">
        <div className="relative flex flex-col items-center">
          {/* Wind Speed Streaks */}
          <div className="relative w-64 sm:w-72">
            <span className="absolute -left-4 top-6 h-1 w-14 animate-[streak_1.4s_linear_infinite] rounded-full bg-white/70" />
            <span className="absolute -left-10 top-14 h-1 w-20 animate-[streak_1.8s_linear_infinite_0.4s] rounded-full bg-white/60" />
            <span className="absolute -left-2 top-22 h-1 w-12 animate-[streak_1.2s_linear_infinite_0.8s] rounded-full bg-white/50" />
          </div>

          {/* Genuine Thabaal Carrier Bird Logo in Flight */}
          <div className="relative h-28 w-60 sm:h-32 sm:w-68 animate-[float_3.4s_ease-in-out_infinite] drop-shadow-2xl">
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
              alt="Thabaal in flight"
              fill
              priority
              className="object-contain"
            />
          </div>

          {/* Slogan Pill Badge */}
          <div
            className={`mt-4 rounded-full border px-4 py-2 text-center backdrop-blur-md shadow-lg transition-colors duration-700 ${
              isNight ? "border-white/20 bg-black/40" : "border-white/30 bg-black/25"
            }`}
          >
            <p className="text-xs sm:text-sm font-bold tracking-wide text-white">
              {isTamil ? "செய்திகள் கொண்டு செல்லும் வேகம்" : "Messages that move business"}
            </p>
            <p className="text-2xs text-white/80">
              {isNight
                ? "Active 24/7 · High Throughput Infrastructure"
                : "Warm, quick, dependable customer campaigns"}
            </p>
          </div>
        </div>
      </div>

      {/* 6. INTERACTIVE SLIDING ORBIT THEME SWITCHER */}
      {onToggleTheme && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isNight ? "Switch to day mode" : "Switch to night mode"}
            className="group relative flex h-12 w-24 cursor-pointer items-center rounded-full border-2 border-white/50 bg-black/40 p-1 shadow-xl backdrop-blur-md transition active:scale-95"
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
              className={`relative z-10 flex size-9 items-center justify-center rounded-full shadow-md transition-transform duration-500 ${
                isNight
                  ? "translate-x-12 bg-gradient-to-br from-[#f2f2f2] to-[#b9b9be] text-gray-800"
                  : "translate-x-0 bg-gradient-to-br from-[#fff3a0] to-[#f7b81c] text-amber-900"
              }`}
            >
              <span className="text-sm select-none">{isNight ? "🌙" : "☀️"}</span>
            </span>
          </button>
          <span className="text-3xs font-extrabold uppercase tracking-widest text-white/90 drop-shadow">
            {isNight ? "Night Sky (Click to switch)" : "Day Sky (Click to switch)"}
          </span>
        </div>
      )}
    </div>
  );
}
