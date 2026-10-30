"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

type Lang = "en" | "ta";

interface HeritageFooterProps {
  lang: Lang;
}

const MAILTO_DEMO = "mailto:thabaal26@gmail.com?subject=Thabaal%20demo%20request";
const TEL_PHONE = "tel:+916379140626";

export function HeritageFooter({ lang }: HeritageFooterProps) {
  const ta = lang === "ta";
  const footerRef = useRef<HTMLElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const rafId = useRef<number | null>(null);

  // 1. One-time Scroll-Triggered Reveal via IntersectionObserver
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    // Check if user prefers reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect(); // Fire once and never replay repeatedly
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. High-Performance Pointer Parallax (Desktop Only) via requestAnimationFrame & CSS variables
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    // Skip on touch/mobile
    if (window.innerWidth < 1024) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (rafId.current) cancelAnimationFrame(rafId.current);

    rafId.current = requestAnimationFrame(() => {
      const el = footerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Normalized coordinates from -1 to 1 relative to center
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      el.style.setProperty("--mouse-x", nx.toFixed(3));
      el.style.setProperty("--mouse-y", ny.toFixed(3));
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    const el = footerRef.current;
    if (!el) return;
    el.style.setProperty("--mouse-x", "0");
    el.style.setProperty("--mouse-y", "0");
  }, []);

  return (
    <footer
      id="login"
      ref={footerRef}
      className={`thabaal-footer heritage-footer ${isRevealed ? "is-revealed" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label={ta ? "தள அடிக்குறிப்பு" : "Site footer"}
    >
      {/* Layer A — Clean Light Content Area */}
      <div className="footer-content-area">
        <div className="landing-container footer-content-grid">
          {/* Column 1 — Brand Identity */}
          <div className="footer-col footer-col--brand">
            <a href="#" className="footer-logo-link" aria-label="Thabaal Home">
              <Image
                src={ta ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
                alt="Thabaal"
                width={154}
                height={52}
                className="footer-logo footer-logo--day"
                style={{ width: "138px", height: "auto" }}
              />
              <Image
                src={ta ? "/brands/thabaal/thabaal-logo-ta-dark.png" : "/brands/thabaal/thabaal-logo-en-dark.png"}
                alt="Thabaal"
                width={154}
                height={52}
                className="footer-logo footer-logo--night"
                style={{ width: "138px", height: "auto" }}
              />
            </a>
            <p className="footer-brand-desc">
              {ta
                ? "வாட்ஸ்அப் மார்க்கெட்டிங், தெளிவான அறிக்கைகள், கேட்லாக் ஆர்டர்கள் மற்றும் டெம்ப்ளேட் கண்காணிப்பு — அனைத்தும் ஒரே எளிய தளத்தில்."
                : "WhatsApp marketing, clearer analytics, catalogue orders and template visibility in one simple place."}
            </p>
          </div>

          {/* Column 2 — Navigation (2 Sub-Columns with Center Hairline) */}
          <div className="footer-col footer-col--nav">
            <h4 className="footer-col-title">{ta ? "பிரிவுகள்" : "Navigation"}</h4>
            <nav className="footer-nav-split" aria-label={ta ? "அடிக்குறிப்பு வழிசெலுத்தல்" : "Footer navigation"}>
              <div className="footer-nav-col">
                <a href="#features" className="footer-nav-link">
                  {ta ? "தபால் ஏன்" : "Why Thabaal"}
                </a>
                <a href="#reports" className="footer-nav-link">
                  {ta ? "அறிக்கைகள்" : "Analytics"}
                </a>
                <a href="#how-it-works" className="footer-nav-link">
                  {ta ? "ஆர்டர்கள்" : "Orders"}
                </a>
              </div>
              <div className="footer-nav-divider" aria-hidden="true" />
              <div className="footer-nav-col">
                <a href="#templates" className="footer-nav-link">
                  {ta ? "டெம்ப்ளேட்டுகள்" : "Templates"}
                </a>
                <a href="#pricing" className="footer-nav-link">
                  {ta ? "கட்டணம்" : "Pricing"}
                </a>
                <a href={MAILTO_DEMO} className="footer-nav-link footer-nav-link--accent">
                  {ta ? "டெமோ பதிவு செய்க" : "Book a demo"}
                </a>
              </div>
            </nav>
          </div>

          {/* Column 3 — Contact Details */}
          <div className="footer-col footer-col--contact">
            <h4 className="footer-col-title">{ta ? "தொடர்புக்கு" : "Contact"}</h4>
            <div className="footer-contact-list">
              <a href={TEL_PHONE} className="footer-contact-item">
                <span className="footer-contact-icon" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </span>
                <span>63791 40626</span>
              </a>
              <a href="mailto:thabaal26@gmail.com" className="footer-contact-item">
                <span className="footer-contact-icon" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <span>thabaal26@gmail.com</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Layer B — Interactive Tamil Nadu Heritage Illustration & Temple Trail */}
      <div className="heritage-landscape-wrap" aria-hidden="true">
        <svg
          viewBox="0 0 1440 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="heritage-svg"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Soft Atmospheric Sky Gradient (Day) */}
            <linearGradient id="heritageSkyDay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="50%" stopColor="#EDF4FC" />
              <stop offset="85%" stopColor="#FFF4DE" />
              <stop offset="100%" stopColor="#E2EEF9" />
            </linearGradient>

            {/* Deep Twilight Sky Gradient (Night) */}
            <linearGradient id="heritageSkyNight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#071526" />
              <stop offset="60%" stopColor="#0E233D" />
              <stop offset="100%" stopColor="#153258" />
            </linearGradient>

            {/* Sunrise Warm Radial Glow */}
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFC72C" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#FDB913" stopOpacity="0.75" />
              <stop offset="70%" stopColor="#FFE58F" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>

            {/* Night Moon Glow */}
            <radialGradient id="nightMoonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E2E8F0" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#94A3B8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0B1E38" stopOpacity="0" />
            </radialGradient>

            {/* Coastal Water Gradient */}
            <linearGradient id="coastalWater" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BAD7F2" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#4A7BB0" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#1E3E66" stopOpacity="0.8" />
            </linearGradient>

            {/* Water Sun Reflection Shimmer */}
            <linearGradient id="waterShimmer" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFC72C" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FFC72C" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* 0. Soft Sky Background Surface */}
          <rect x="0" y="0" width="1440" height="220" fill="url(#heritageSkyDay)" className="heritage-sky-bg" />

          {/* 1. Sky & Celestial Atmosphere (Layer with slowest parallax) */}
          <g className="heritage-layer heritage-layer--sky">
            {/* Rising Morning Sun (disc & soft radiating halo behind mandapam) */}
            <circle cx="830" cy="110" r="56" fill="url(#sunGlow)" className="heritage-sun heritage-sun--day" />
            <circle cx="830" cy="110" r="32" fill="#FDB913" opacity="0.85" className="heritage-sun heritage-sun--day" />
            <circle cx="830" cy="110" r="18" fill="#FFE58F" opacity="0.95" className="heritage-sun heritage-sun--day" />
            <circle cx="830" cy="110" r="32" fill="url(#nightMoonGlow)" className="heritage-sun heritage-sun--night" />

            {/* Soft billowy atmospheric cumulus clouds */}
            <g className="heritage-clouds" opacity="0.62">
              <path
                d="M 60 90 C 50 68, 76 50, 102 54 C 118 34, 156 32, 182 48 C 202 40, 228 46, 238 64 C 254 62, 272 74, 272 90 L 60 90 Z"
                fill="#d8e5f2"
              />
              <path
                d="M 620 108 C 606 94, 626 76, 646 78 C 664 60, 696 58, 714 74 C 732 64, 756 72, 766 88 L 620 108 Z"
                fill="#e6f0f8"
              />
              <path
                d="M 1060 120 C 1046 92, 1084 66, 1120 70 C 1144 38, 1198 32, 1232 56 C 1262 44, 1304 54, 1318 82 C 1348 76, 1378 92, 1378 122 L 1060 120 Z"
                fill="#d8e5f2"
              />
            </g>

            {/* Distant flock of birds soaring gracefully across the morning sky */}
            <g className="heritage-sky-birds" opacity="0.4" stroke="#2d527c" strokeWidth="1.5" fill="none" strokeLinecap="round">
              <path d="M 510 50 Q 514 44 518 50 Q 522 44 526 50" />
              <path d="M 528 42 Q 532 36 536 42 Q 540 36 544 42" />
              <path d="M 546 52 Q 550 46 554 52 Q 558 46 562 52" />
              <path d="M 964 56 Q 968 50 972 56 Q 976 50 980 56" />
              <path d="M 982 48 Q 986 42 990 48 Q 994 42 998 48" />
            </g>
          </g>

          {/* 2. Distant Western Ghats / Nilgiris Hill Ridges */}
          <g className="heritage-layer heritage-layer--hills">
            <path
              d="M 0 118 Q 220 90 460 110 T 920 94 Q 1180 84 1440 106 L 1440 220 L 0 220 Z"
              fill="#bfd7ee"
              className="heritage-hill heritage-hill--back"
              opacity="0.5"
            />
            <path
              d="M 0 130 Q 240 108 520 124 T 1000 110 Q 1240 100 1440 120 L 1440 220 L 0 220 Z"
              fill="#94bbdc"
              className="heritage-hill heritage-hill--mid"
              opacity="0.6"
            />
          </g>

          {/* 3. Heritage Architecture, Monuments & Flora Trail */}
          <g className="heritage-layer heritage-layer--monuments">
            {/* Coastal Water Reflection Strip */}
            <rect x="0" y="132" width="1440" height="88" fill="url(#coastalWater)" />
            {/* Sun shimmer on water */}
            <ellipse cx="830" cy="144" rx="110" ry="8" fill="url(#waterShimmer)" />

            {/* ── Left Headland: Coastal Village Cottage with lit windows ── */}
            <g className="heritage-monument heritage-cottage" opacity="0.95">
              {/* Cottage Base & Walls */}
              <path d="M 76 175 L 76 148 L 128 148 L 128 175 Z" fill="#132d4b" />
              {/* Tiled Sloping Roof with overhang */}
              <path d="M 70 148 L 102 130 L 134 148 Z" fill="#1e446d" />
              <line x1="70" y1="148" x2="134" y2="148" stroke="#081b2e" strokeWidth="2" />
              {/* 3 Warm lit yellow windows (cottage interior light) */}
              <rect x="83" y="153" width="8" height="7" rx="1" fill="#FFC72C" />
              <rect x="96" y="153" width="8" height="7" rx="1" fill="#FFC72C" />
              <rect x="109" y="153" width="8" height="7" rx="1" fill="#FFC72C" />
              <line x1="87" y1="153" x2="87" y2="160" stroke="#996300" strokeWidth="0.8" />
              <line x1="100" y1="153" x2="100" y2="160" stroke="#996300" strokeWidth="0.8" />
              <line x1="113" y1="153" x2="113" y2="160" stroke="#996300" strokeWidth="0.8" />
            </g>

            {/* ── Monument A: Majestic Grand Dravidian Gopuram (Hero — Madurai/Thanjavur Style) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--main" role="img" aria-label="Grand Dravidian Temple Gopuram">
              {/* Adhisthana / Foundation Plinth */}
              <path d="M 158 175 L 158 152 L 278 152 L 278 175 Z" fill="#0d2644" />
              <line x1="156" y1="152" x2="280" y2="152" stroke="#255182" strokeWidth="2" />
              {/* Arched Dwarapala Gateway Portal with inner depth */}
              <path d="M 206 175 L 206 154 Q 218 144 230 154 L 230 175 Z" fill="#051322" />
              <path d="M 210 175 L 210 156 Q 218 148 226 156 L 226 175 Z" fill="#020912" />

              {/* Tier 1 */}
              <path d="M 164 152 L 170 135 L 266 135 L 272 152 Z" fill="#13365d" />
              <line x1="162" y1="135" x2="274" y2="135" stroke="#2c5d94" strokeWidth="1.8" />
              <rect x="186" y="139" width="7" height="9" rx="1.5" fill="#081d33" />
              <rect x="214" y="138" width="8" height="10" rx="1.5" fill="#081d33" />
              <rect x="243" y="139" width="7" height="9" rx="1.5" fill="#081d33" />

              {/* Tier 2 */}
              <path d="M 171 135 L 177 118 L 259 118 L 265 135 Z" fill="#173e6b" />
              <line x1="169" y1="118" x2="267" y2="118" stroke="#2c5d94" strokeWidth="1.8" />
              <rect x="191" y="122" width="6" height="8" rx="1.2" fill="#081d33" />
              <rect x="215" y="121" width="6" height="9" rx="1.2" fill="#081d33" />
              <rect x="239" y="122" width="6" height="8" rx="1.2" fill="#081d33" />

              {/* Tier 3 */}
              <path d="M 178 118 L 184 102 L 252 102 L 258 118 Z" fill="#1b4679" />
              <line x1="176" y1="102" x2="260" y2="102" stroke="#2c5d94" strokeWidth="1.8" />
              <rect x="196" y="106" width="5" height="7" rx="1" fill="#081d33" />
              <rect x="215.5" y="105" width="5" height="8" rx="1" fill="#081d33" />
              <rect x="235" y="106" width="5" height="7" rx="1" fill="#081d33" />

              {/* Tier 4 */}
              <path d="M 185 102 L 190 86 L 246 86 L 251 102 Z" fill="#1f4e87" />
              <line x1="183" y1="86" x2="253" y2="86" stroke="#2c5d94" strokeWidth="1.8" />
              <rect x="201" y="90" width="4.5" height="6.5" rx="0.8" fill="#081d33" />
              <rect x="216" y="89" width="4.5" height="7" rx="0.8" fill="#081d33" />
              <rect x="231" y="90" width="4.5" height="6.5" rx="0.8" fill="#081d33" />

              {/* Tier 5 */}
              <path d="M 191 86 L 196 70 L 240 70 L 245 86 Z" fill="#245796" />
              <line x1="189" y1="70" x2="247" y2="70" stroke="#2c5d94" strokeWidth="1.8" />
              <rect x="206" y="74" width="4" height="6" rx="0.6" fill="#081d33" />
              <rect x="216.5" y="73" width="4" height="6.5" rx="0.6" fill="#081d33" />
              <rect x="227" y="74" width="4" height="6" rx="0.6" fill="#081d33" />

              {/* Tier 6 */}
              <path d="M 197 70 L 201 55 L 235 55 L 239 70 Z" fill="#2962a6" />
              <line x1="195" y1="55" x2="241" y2="55" stroke="#2c5d94" strokeWidth="1.8" />

              {/* Sala Barrel Shikhara Roof Crest */}
              <path d="M 194 55 C 194 39, 242 39, 242 55 Z" fill="#306eb8" />
              <line x1="193" y1="55" x2="243" y2="55" stroke="#12355b" strokeWidth="1.6" />

              {/* 7 Refined Golden Kalasam Finials */}
              <path d="M 218 41 L 218 26" stroke="#FFC72C" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="218" cy="25" r="2.6" fill="#FFC72C" />

              <path d="M 211 42 L 211 30" stroke="#FFC72C" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="211" cy="29" r="2" fill="#FFC72C" />
              <path d="M 225 42 L 225 30" stroke="#FFC72C" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="225" cy="29" r="2" fill="#FFC72C" />

              <path d="M 205 44 L 205 34" stroke="#FFC72C" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="205" cy="33" r="1.7" fill="#FFC72C" />
              <path d="M 231 44 L 231 34" stroke="#FFC72C" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="231" cy="33" r="1.7" fill="#FFC72C" />

              <path d="M 200 47 L 200 39" stroke="#FFC72C" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="200" cy="38" r="1.4" fill="#FFC72C" />
              <path d="M 236 47 L 236 39" stroke="#FFC72C" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="236" cy="38" r="1.4" fill="#FFC72C" />
            </g>

            {/* ── Monument B: Second Gopuram (Mid-Distance Architectural Rhythm) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--second" role="img" aria-label="Second Temple Gopuram">
              <path d="M 300 175 L 300 155 L 374 155 L 374 175 Z" fill="#0f2b4a" />
              <line x1="298" y1="155" x2="376" y2="155" stroke="#255182" strokeWidth="1.6" />
              <path d="M 331 175 L 331 159 Q 337 154 343 159 L 343 175 Z" fill="#061626" />

              <path d="M 303 155 L 308 139 L 366 139 L 371 155 Z" fill="#14375f" />
              <line x1="301" y1="139" x2="373" y2="139" stroke="#255182" strokeWidth="1.6" />
              <rect x="333" y="143" width="7" height="8" rx="1" fill="#081d33" />

              <path d="M 310 139 L 315 123 L 359 123 L 364 139 Z" fill="#183f6b" />
              <line x1="308" y1="123" x2="366" y2="123" stroke="#255182" strokeWidth="1.6" />
              <rect x="334" y="127" width="5.5" height="7" rx="0.8" fill="#081d33" />

              <path d="M 317 123 L 322 107 L 352 107 L 357 123 Z" fill="#1d4879" />
              <line x1="315" y1="107" x2="359" y2="107" stroke="#255182" strokeWidth="1.6" />

              <path d="M 323 107 L 327 91 L 347 91 L 351 107 Z" fill="#225289" />
              <line x1="321" y1="91" x2="353" y2="91" stroke="#255182" strokeWidth="1.6" />

              {/* Shikhara & 5 Kalasams */}
              <path d="M 323 91 C 323 78, 351 78, 351 91 Z" fill="#295f9c" />
              <line x1="337" y1="80" x2="337" y2="68" stroke="#FFC72C" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="337" cy="67" r="2.1" fill="#FFC72C" />
              <line x1="331" y1="82" x2="331" y2="72" stroke="#FFC72C" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="331" cy="71" r="1.6" fill="#FFC72C" />
              <line x1="343" y1="82" x2="343" y2="72" stroke="#FFC72C" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="343" cy="71" r="1.6" fill="#FFC72C" />
              <line x1="326" y1="85" x2="326" y2="77" stroke="#FFC72C" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="326" cy="76" r="1.3" fill="#FFC72C" />
              <line x1="348" y1="85" x2="348" y2="77" stroke="#FFC72C" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="348" cy="76" r="1.3" fill="#FFC72C" />
            </g>

            {/* ── Monument C: Distant Third Gopuram (Center Horizon) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--distant">
              <path d="M 558 175 L 558 159 L 626 159 L 626 175 Z" fill="#153356" opacity="0.9" />
              <path d="M 561 159 L 566 145 L 618 145 L 623 159 Z" fill="#193b63" opacity="0.9" />
              <path d="M 567 145 L 572 131 L 612 131 L 617 145 Z" fill="#1d4470" opacity="0.9" />
              <path d="M 574 131 L 578 117 L 606 117 L 610 131 Z" fill="#224e80" opacity="0.9" />
              <path d="M 576 117 C 576 107, 608 107, 608 117 Z" fill="#275990" opacity="0.9" />
              <line x1="592" y1="109" x2="592" y2="97" stroke="#FFC72C" strokeWidth="1.5" strokeLinecap="round" opacity="0.95" />
              <circle cx="592" cy="96" r="1.7" fill="#FFC72C" />
            </g>

            {/* ── Monument D: Traditional Pillared Mandapam (Colonnade / Hall of 1000 Pillars) ── */}
            <g className="heritage-monument heritage-mandapam" role="img" aria-label="Heritage Pillared Mandapam">
              {/* Upper Parapet & Cornice Slab */}
              <rect x="726" y="126" width="198" height="5" rx="0.5" fill="#1b3d63" />
              <rect x="730" y="121" width="190" height="5" fill="#254d77" />
              {/* Row of 20 Classical Stone Pillars */}
              {[...Array(20)].map((_, i) => {
                const px = 734 + i * 9.6;
                return (
                  <g key={`pillar-${i}`}>
                    <line x1={px} y1={131} x2={px} y2={175} stroke="#132f4e" strokeWidth="2.5" />
                    <rect x={px - 2} y={131} width="4" height="2" fill="#2d5885" />
                    <rect x={px - 1.8} y={173} width="3.6" height="2" fill="#091b2e" />
                  </g>
                );
              })}
            </g>

            {/* ── Monument E: Coastal Lighthouse on Rocky Shoreline ── */}
            <g className="heritage-monument heritage-lighthouse" role="img" aria-label="Coastal Lighthouse">
              {/* Rocky Promontory */}
              <path d="M 1010 178 Q 1035 165 1060 178 Z" fill="#0b2036" />
              {/* Tapered Lighthouse Tower */}
              <path d="M 1027 174 L 1030 80 L 1040 80 L 1043 174 Z" fill="#193b61" />
              {/* Balcony Gallery */}
              <line x1="1025" y1="80" x2="1045" y2="80" stroke="#FFC72C" strokeWidth="2" />
              {/* Lantern Room */}
              <rect x="1029" y="70" width="12" height="10" rx="1" fill="#FFC72C" opacity="0.95" />
              {/* Dome & Light Beacon */}
              <path d="M 1028 70 C 1028 62, 1042 62, 1042 70 Z" fill="#0e2640" />
              <line x1="1035" y1="62" x2="1035" y2="56" stroke="#FFC72C" strokeWidth="1.5" strokeLinecap="round" />
            </g>

            {/* ── Monument F: Traditional Tamil Catamaran / Fishing Boat (`Pattai`) ── */}
            <g className="heritage-monument heritage-boat" role="img" aria-label="Tamil Fishing Boat">
              {/* Slender Hull with Curved Bow and Stern */}
              <path d="M 1245 162 C 1268 174, 1318 174, 1340 160 C 1320 168, 1275 168, 1245 162 Z" fill="#0a1e33" />
              <path d="M 1242 161 L 1342 159 L 1334 166 L 1248 166 Z" fill="#16385d" />
              {/* Tall Mast & Rigging */}
              <line x1="1290" y1="162" x2="1290" y2="94" stroke="#061524" strokeWidth="2.2" />
              <line x1="1255" y1="160" x2="1290" y2="94" stroke="#475569" strokeWidth="1" opacity="0.65" />
              <line x1="1325" y1="159" x2="1290" y2="94" stroke="#475569" strokeWidth="1" opacity="0.65" />
              {/* Angled Billowing Triangular Sails */}
              <path d="M 1290 98 Q 1320 114 1324 156 L 1290 156 Z" fill="#ffffff" opacity="0.95" stroke="#cbd5e1" strokeWidth="0.8" />
              <path d="M 1288 102 Q 1262 118 1256 156 L 1288 156 Z" fill="#e6edf5" opacity="0.88" stroke="#cbd5e1" strokeWidth="0.8" />
              {/* Two Fishermen Silhouettes */}
              <circle cx="1278" cy="153" r="2.2" fill="#061524" />
              <path d="M 1276 155 L 1280 155 L 1281 161 L 1275 161 Z" fill="#061524" />
              <circle cx="1302" cy="154" r="2.2" fill="#061524" />
              <path d="M 1300 156 L 1304 156 L 1305 161 L 1299 161 Z" fill="#061524" />
            </g>

            {/* ── Lush Tamil Nadu Flora: Iconic Palmyra Palms & Coconut Groves ── */}
            {/* Leftmost iconic Palmyra palm cluster (State tree of Tamil Nadu) */}
            <g className="heritage-flora heritage-palms--left" fill="#081e35">
              {/* Tall Palmyra Palm 1 */}
              <path d="M 22 175 Q 25 110 28 40 L 31 40 Q 28 110 25 175 Z" />
              {/* Rich fan fronds */}
              <g transform="translate(29, 40)">
                <path d="M 0 0 C -12 -10, -28 -14, -34 -4 C -28 6, -14 4, 0 0 Z" />
                <path d="M 0 0 C -18 -20, -28 -32, -18 -30 C -8 -18, -4 -6, 0 0 Z" />
                <path d="M 0 0 C -6 -24, 0 -38, 6 -36 C 8 -22, 4 -8, 0 0 Z" />
                <path d="M 0 0 C 12 -22, 26 -30, 26 -22 C 16 -12, 8 -4, 0 0 Z" />
                <path d="M 0 0 C 22 -14, 34 -12, 34 -2 C 24 6, 14 4, 0 0 Z" />
                <path d="M 0 0 C 20 8, 30 18, 26 22 C 16 16, 8 8, 0 0 Z" />
                <path d="M 0 0 C -16 8, -26 18, -24 22 C -14 16, -6 8, 0 0 Z" />
              </g>

              {/* Tall Palmyra Palm 2 */}
              <path d="M 52 175 Q 55 118 58 58 L 61 58 Q 58 118 55 175 Z" />
              <g transform="translate(59, 58) scale(0.82)">
                <path d="M 0 0 C -12 -10, -26 -12, -30 -4 C -24 5, -12 4, 0 0 Z" />
                <path d="M 0 0 C -16 -18, -24 -28, -16 -26 C -7 -16, -3 -5, 0 0 Z" />
                <path d="M 0 0 C -5 -22, 0 -34, 5 -32 C 7 -20, 3 -7, 0 0 Z" />
                <path d="M 0 0 C 10 -20, 22 -26, 22 -20 C 14 -10, 7 -3, 0 0 Z" />
                <path d="M 0 0 C 18 -12, 28 -10, 28 -2 C 20 5, 12 3, 0 0 Z" />
              </g>

              {/* Coastal Bush / Shrub Silhouette */}
              <path d="M 0 175 C 16 162 38 164 54 171 C 70 160 92 162 110 175 Z" fill="#061729" />
            </g>

            {/* Interspersed Palms across the Trail */}
            <g className="heritage-flora heritage-palms--trail" fill="#0d2540" opacity="0.95">
              {/* Near Main Gopuram */}
              <path d="M 146 175 Q 149 132 152 90 L 154 90 Q 151 132 148 175 Z" />
              <g transform="translate(153, 90) scale(0.55)">
                <path d="M 0 0 C -16 -12, -26 -8, -20 2 C -10 6, -4 2, 0 0 Z" />
                <path d="M 0 0 C -14 -22, -6 -28, 2 -18 C 6 -8, 2 -2, 0 0 Z" />
                <path d="M 0 0 C 12 -22, 22 -16, 18 -4 C 10 4, 4 2, 0 0 Z" />
                <path d="M 0 0 C 18 -6, 26 2, 18 10 C 10 8, 4 4, 0 0 Z" />
              </g>

              {/* Between Gopurams */}
              <path d="M 288 175 Q 290 138 292 102 L 294 102 Q 292 138 290 175 Z" />
              <g transform="translate(293, 102) scale(0.5)">
                <path d="M 0 0 C -16 -12, -26 -8, -20 2 C -10 6, -4 2, 0 0 Z" />
                <path d="M 0 0 C -14 -22, -6 -28, 2 -18 C 6 -8, 2 -2, 0 0 Z" />
                <path d="M 0 0 C 12 -22, 22 -16, 18 -4 C 10 4, 4 2, 0 0 Z" />
              </g>

              {/* Center Palms */}
              <path d="M 440 175 Q 442 140 444 108 L 446 108 Q 444 140 442 175 Z" />
              <g transform="translate(445, 108) scale(0.48)">
                <path d="M 0 0 C -14 -10, -22 -6, -18 2 C -8 5, -3 2, 0 0 Z" />
                <path d="M 0 0 C -10 -18, -4 -24, 2 -16 C 5 -7, 2 -2, 0 0 Z" />
                <path d="M 0 0 C 10 -18, 18 -12, 16 -4 C 8 3, 3 2, 0 0 Z" />
              </g>

              <path d="M 500 175 Q 502 138 504 104 L 506 104 Q 504 138 502 175 Z" />
              <g transform="translate(505, 104) scale(0.45)">
                <path d="M 0 0 C -14 -10, -22 -6, -18 2 C -8 5, -3 2, 0 0 Z" />
                <path d="M 0 0 C 10 -18, 18 -12, 16 -4 C 8 3, 3 2, 0 0 Z" />
              </g>

              <path d="M 668 175 Q 670 142 672 112 L 674 112 Q 672 142 670 175 Z" />
              <g transform="translate(673, 112) scale(0.46)">
                <path d="M 0 0 C -14 -10, -22 -6, -18 2 C -8 5, -3 2, 0 0 Z" />
                <path d="M 0 0 C 10 -18, 18 -12, 16 -4 C 8 3, 3 2, 0 0 Z" />
              </g>

              {/* Near Mandapam */}
              <path d="M 948 175 Q 950 142 952 112 L 954 112 Q 952 142 950 175 Z" />
              <g transform="translate(953, 112) scale(0.5)">
                <path d="M 0 0 C -14 -10, -24 -6, -18 2 C -8 5, -3 2, 0 0 Z" />
                <path d="M 0 0 C 12 -18, 20 -12, 16 -4 C 8 3, 3 2, 0 0 Z" />
              </g>
            </g>

            {/* Right Headland Palms */}
            <g className="heritage-flora heritage-palms--right" fill="#081d33">
              <path d="M 1395 175 Q 1392 116 1389 44 L 1392 44 Q 1395 116 1398 175 Z" />
              <g transform="translate(1390, 44) scale(0.92)">
                <path d="M 0 0 C -12 -10, -28 -14, -34 -4 C -28 6, -14 4, 0 0 Z" />
                <path d="M 0 0 C -18 -20, -28 -32, -18 -30 C -8 -18, -4 -6, 0 0 Z" />
                <path d="M 0 0 C -6 -24, 0 -38, 6 -36 C 8 -22, 4 -8, 0 0 Z" />
                <path d="M 0 0 C 12 -22, 26 -30, 26 -22 C 16 -12, 8 -4, 0 0 Z" />
                <path d="M 0 0 C 22 -14, 34 -12, 34 -2 C 24 6, 14 4, 0 0 Z" />
              </g>

              <path d="M 1428 175 Q 1425 124 1422 64 L 1425 64 Q 1428 124 1431 175 Z" />
              <g transform="translate(1424, 64) scale(0.76)">
                <path d="M 0 0 C -12 -10, -26 -12, -30 -4 C -24 5, -12 4, 0 0 Z" />
                <path d="M 0 0 C 10 -20, 22 -26, 22 -20 C 14 -10, 7 -3, 0 0 Z" />
              </g>
              <path d="M 1345 175 C 1370 164 1405 162 1440 168 L 1440 175 Z" fill="#061729" />
            </g>
          </g>

          {/* 4. Layered Deep-Navy Foreground Waves (Layer with highest parallax) */}
          <g className="heritage-layer heritage-layer--waves">
            {/* Wave 1: Back Wave */}
            <path
              className="heritage-wave heritage-wave--back"
              d="M 0 142 C 240 126, 480 156, 740 134 C 1000 156, 1200 130, 1440 144 L 1440 220 L 0 220 Z"
            />
            {/* Wave 2: Mid Wave */}
            <path
              className="heritage-wave heritage-wave--mid"
              d="M 0 158 C 260 176, 520 142, 800 168 C 1040 142, 1220 166, 1440 154 L 1440 220 L 0 220 Z"
            />
            {/* Wave 3: Front Wave (Dips gently around boat so hull is clearly seen, merges seamlessly with bottom bar) */}
            <path
              className="heritage-wave heritage-wave--front"
              d="M 0 174 C 280 192, 580 162, 880 186 C 1080 166, 1200 174, 1240 168 C 1285 162, 1335 162, 1370 156 C 1410 160, 1430 166, 1440 168 L 1440 220 L 0 220 Z"
            />
          </g>

          {/* 5. Signature Golden Dotted Flight Path with Smooth Loop-the-Loop */}
          <g className="heritage-layer heritage-layer--flightpath">
            {/* The Golden Path: Smooth undulating curves, circular loop, and clean exit to bird */}
            <path
              id="heritageFlightPath"
              className="heritage-flight-line"
              d="M 60 168 C 160 154, 240 166, 320 166 C 400 166, 460 162, 530 162 C 610 162, 670 165, 740 164 C 820 163, 900 162, 970 162 C 1030 162, 1080 154, 1130 138 C 1155 124, 1172 102, 1186 78 C 1198 58, 1218 64, 1218 84 C 1218 102, 1198 112, 1182 106 C 1168 100, 1172 84, 1188 80 C 1212 74, 1246 60, 1274 46"
              stroke="#FFC72C"
              strokeWidth="2.6"
              strokeDasharray="6 7"
              strokeLinecap="round"
            />

            {/* Glowing Golden Route Marker Pins */}
            <g className="heritage-route-pins">
              {/* Pin 1 */}
              <circle cx="60" cy="168" r="6.5" fill="#FFC72C" opacity="0.32" className="heritage-pin-halo" />
              <circle cx="60" cy="168" r="3.6" fill="#FFC72C" />
              {/* Pin 2 */}
              <circle cx="320" cy="166" r="3.4" fill="#FFC72C" />
              {/* Pin 3 */}
              <circle cx="530" cy="162" r="5.5" fill="#FFC72C" opacity="0.32" className="heritage-pin-halo" />
              <circle cx="530" cy="162" r="3.6" fill="#FFC72C" />
              {/* Pin 4 */}
              <circle cx="740" cy="164" r="3.4" fill="#FFC72C" />
              {/* Pin 5 */}
              <circle cx="970" cy="162" r="5.5" fill="#FFC72C" opacity="0.32" className="heritage-pin-halo" />
              <circle cx="970" cy="162" r="3.6" fill="#FFC72C" />
            </g>

            {/* 6. Authentic Official Thabaal Carrier Bird Motif perched directly at Path Endpoint */}
            <g
              className="heritage-endpoint-bird-svg"
              transform="translate(1274, 25) rotate(-14 26 15)"
              role="img"
              aria-label="Thabaal Carrier Bird"
            >
              <image
                href="/brands/thabaal/mark.png"
                x="0"
                y="0"
                width="54"
                height="30"
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          </g>
        </svg>
      </div>

      {/* Layer C — Deep-Navy Bottom Bar */}
      <div className="footer-bottom-bar">
        <div className="landing-container footer-bottom-inner">
          <span className="footer-copyright">
            © 2026 Thabaal. {ta ? "வளரும் வணிகங்களுக்காக உருவாக்கப்பட்டது." : "Built for growing businesses."}
          </span>
          <span className="footer-tagline">
            {ta ? "வாட்ஸ்அப் மார்க்கெட்டிங் இனி எளிது." : "WhatsApp marketing made simple."}
          </span>
        </div>
      </div>
    </footer>
  );
}
