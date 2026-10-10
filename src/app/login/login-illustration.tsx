"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

interface LoginIllustrationProps {
  isNight?: boolean;
  onToggleTheme?: () => void;
  lang?: "en" | "ta";
}

const noop = () => () => {};

// 11 cloud configurations: [top%, width px, duration s, phase 0-1, opacity, layer, symbol]
const CLOUDS = [
  { top: 6, w: 150, dur: 110, delay: -11.0, op: 0.55, layer: "far", symbol: "cB" },
  { top: 24, w: 130, dur: 120, delay: -66.0, op: 0.50, layer: "far", symbol: "cA" },
  { top: 44, w: 140, dur: 105, delay: -84.0, op: 0.50, layer: "far", symbol: "cC" },
  { top: 68, w: 150, dur: 115, delay: -40.2, op: 0.50, layer: "far", symbol: "cB" },
  { top: 14, w: 230, dur: 70, delay: -21.0, op: 0.85, layer: "mid", symbol: "cA" },
  { top: 36, w: 210, dur: 64, delay: -48.0, op: 0.90, layer: "mid", symbol: "cC" },
  { top: 58, w: 240, dur: 72, delay: -3.6, op: 0.85, layer: "mid", symbol: "cB" },
  { top: 80, w: 220, dur: 66, delay: -33.0, op: 0.90, layer: "mid", symbol: "cA" },
  { top: 3, w: 340, dur: 44, delay: -26.4, op: 1.00, layer: "near", symbol: "cC" },
  { top: 52, w: 360, dur: 40, delay: -8.0, op: 1.00, layer: "near", symbol: "cA" },
  { top: 84, w: 330, dur: 46, delay: -41.4, op: 1.00, layer: "near", symbol: "cB" },
];

// Pre-computed 70 stars with deterministic coordinates to avoid hydration mismatches
const STARS = Array.from({ length: 70 }).map((_, i) => ({
  left: `${((i * 17.3 + 11) % 96 + 2).toFixed(1)}%`,
  top: `${((i * 23.7 + 7) % 68 + 2).toFixed(1)}%`,
  size: `${((i % 4) * 0.5 + 1.2).toFixed(1)}px`,
  duration: `${((i % 5) * 0.4 + 2.2).toFixed(1)}s`,
  delay: `${((i % 7) * 0.35).toFixed(1)}s`,
}));

export function LoginIllustration({ isNight = false, onToggleTheme, lang = "en" }: LoginIllustrationProps) {
  const ta = lang === "ta";
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <section className="thabaal-right" aria-label={ta ? "அனிமேஷன் வானம்" : "Animated sky"}>
      {/* 1. SKY GRADIENTS */}
      <div className="thabaal-sky day" />
      <div className="thabaal-sky night" />

      {/* 2. CELESTIAL BODIES */}
      <div className="thabaal-sun" />
      <div className="thabaal-moon" />

      {/* 3. TWINKLING STARS (Night Mode) */}
      <div className="thabaal-stars">
        {mounted &&
          STARS.map((s, idx) => (
            <i
              key={idx}
              className="thabaal-star"
              style={
                {
                  left: s.left,
                  top: s.top,
                  "--s": s.size,
                  "--d": s.duration,
                  "--dl": s.delay,
                } as React.CSSProperties
              }
            />
          ))}
      </div>

      {/* 4. CLOUDS SVG SYMBOLS */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <symbol id="cA" viewBox="0 0 300 100">
            <path
              fill="currentColor"
              d="M14 94C10 86 16 80 13 70C10 56 22 40 38 36C48 20 70 12 86 20C94 24 98 30 99 38C104 33 114 33 122 38C133 45 136 58 134 68C133 73 132 78 138 78C145 78 150 74 158 77C168 80 180 80 200 80C230 80 256 80 276 81C288 82 292 90 284 94Z"
            />
            <path
              fill="#7a6a58"
              fillOpacity=".09"
              d="M14 94C10 86 16 80 13 70C10 56 22 40 38 36C48 22 62 14 76 15C60 24 48 40 44 56C42 68 46 82 48 94Z"
            />
          </symbol>
          <symbol id="cB" viewBox="0 0 300 100">
            <path
              fill="currentColor"
              d="M16 94C10 88 14 80 14 72C14 56 30 46 46 48C54 32 78 24 98 32C110 37 116 46 116 54C128 52 140 58 142 70C143 76 142 78 148 79C158 80 172 80 196 81C230 82 262 82 280 84C290 86 290 94 280 94Z"
            />
            <path
              fill="#7a6a58"
              fillOpacity=".09"
              d="M16 94C10 88 14 80 14 72C14 56 30 46 46 48C54 32 70 25 86 26C70 36 62 50 60 64C59 76 62 86 64 94Z"
            />
          </symbol>
          <symbol id="cC" viewBox="0 0 300 100">
            <path
              fill="currentColor"
              d="M12 94C8 86 14 78 14 70C14 56 28 46 44 48C50 36 66 30 80 36C86 28 100 24 114 30C128 36 132 48 130 56C142 56 152 64 152 74C152 78 150 80 156 80C170 80 190 80 220 81C250 82 276 82 288 86C292 90 290 94 282 94Z"
            />
            <path
              fill="#7a6a58"
              fillOpacity=".09"
              d="M12 94C8 86 14 78 14 70C14 56 28 46 44 48C50 36 62 31 74 33C58 42 50 54 48 66C47 78 50 86 52 94Z"
            />
          </symbol>
        </defs>
      </svg>

      {/* 5. DRIFTING & PUFFING CLOUDS */}
      <div className="thabaal-clouds">
        {CLOUDS.map((c, idx) => (
          <div
            key={idx}
            className={`thabaal-cloud l-${c.layer}`}
            style={
              {
                "--top": `${c.top}%`,
                "--w": `${c.w}px`,
                "--dur": `${c.dur}s`,
                "--delay": `${c.delay}s`,
                "--op": c.op,
                "--puff": "6s",
              } as React.CSSProperties
            }
          >
            <svg>
              <use href={`#${c.symbol}`} />
            </svg>
          </div>
        ))}
      </div>

      {/* 6. CENTER FLYING THABAAL CARRIER BIRD */}
      <div className="thabaal-birdpos" aria-hidden="true">
        <div className="thabaal-birdfloat">
          <i className="thabaal-streak" />
          <i className="thabaal-streak" />
          <i className="thabaal-streak" />
          <div className="thabaal-bird">
            <Image
              src="/brands/thabaal/wing.png"
              className="wing"
              alt=""
              width={640}
              height={354}
              priority
            />
            <Image
              src="/brands/thabaal/body.png"
              className="body"
              alt="thabaal bird"
              width={640}
              height={354}
              priority
            />
          </div>
        </div>
      </div>

      {/* 7. SLIDING THEME TOGGLE (Positioned at Top-Right as in Laptop Photo) */}
      {onToggleTheme && (
        <div className="thabaal-togglewrap" id="togglewrap">
          <div className="thabaal-tgbox">
            <span className="thabaal-pulse" aria-hidden="true" />
            <button
              type="button"
              className="thabaal-toggle"
              onClick={onToggleTheme}
              role="switch"
              aria-checked={isNight}
              aria-label={ta ? (isNight ? "பகல் தோற்றத்திற்கு மாற்று" : "இரவு தோற்றத்திற்கு மாற்று") : isNight ? "Switch to day" : "Switch to night"}
              title={ta ? (isNight ? "பகல் தோற்றம்" : "இரவு தோற்றம்") : isNight ? "Day mode" : "Night mode"}
            >
              {/* Night Sky track */}
              <span className="thabaal-tk thabaal-tk-night">
                <i className="dot" style={{ left: "14px", top: "9px" }} />
                <i className="dot" style={{ left: "46px", top: "7px", animationDelay: ".6s" }} />
                <i className="dot" style={{ left: "28px", top: "24px", animationDelay: "1.2s" }} />
                <span className="thabaal-tc" style={{ right: "6px", width: "42px" }} />
                <span
                  className="thabaal-tc"
                  style={{ right: "40px", width: "30px", bottom: "-9px" }}
                />
              </span>

              {/* Day Sky track */}
              <span className="thabaal-tk thabaal-tk-day">
                <span className="thabaal-tc" style={{ left: "4px", width: "42px" }} />
                <span
                  className="thabaal-tc"
                  style={{ left: "36px", width: "36px", bottom: "-9px" }}
                />
                <span
                  className="thabaal-tc"
                  style={{ left: "70px", width: "24px", bottom: "-7px" }}
                />
              </span>

              {/* Knob with Sun & Moon Face */}
              <span className="thabaal-ringwrap">
                <span className="thabaal-ring" style={{ width: "52px", height: "52px" }} />
              </span>
              <span className="thabaal-knob">
                <span className="face sunface" />
                <span className="face moonface" />
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
