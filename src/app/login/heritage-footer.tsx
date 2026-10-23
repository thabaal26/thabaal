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
          viewBox="0 0 1440 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="heritage-svg"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Sunrise Glow */}
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FDB913" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#FFE58B" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#FFF9E6" stopOpacity="0" />
            </radialGradient>

            {/* Night Moon Glow */}
            <radialGradient id="nightMoonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E2E8F0" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#94A3B8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0B1E38" stopOpacity="0" />
            </radialGradient>

            {/* Coastal Water Gradient */}
            <linearGradient id="coastalWater" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.6" />
            </linearGradient>

            {/* Water Sun Reflection Shimmer */}
            <linearGradient id="waterShimmer" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFBF18" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#FFBF18" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* 1. Sky & Celestial Atmosphere (Layer with slowest parallax) */}
          <g className="heritage-layer heritage-layer--sky">
            {/* Rising Morning Sun (disc & soft radiating halo behind mandapam) */}
            <circle cx="875" cy="68" r="42" fill="url(#sunGlow)" className="heritage-sun heritage-sun--day" />
            <circle cx="875" cy="68" r="22" fill="#FDB913" opacity="0.6" className="heritage-sun heritage-sun--day" />
            <circle cx="875" cy="68" r="28" fill="url(#nightMoonGlow)" className="heritage-sun heritage-sun--night" />

            {/* Soft billowy atmospheric clouds */}
            <g className="heritage-clouds" opacity="0.4">
              <path
                d="M 120 40 C 115 32 125 24 135 25 C 142 16 158 15 168 22 C 176 18 186 21 190 28 C 198 27 206 32 206 39 C 206 44 195 48 180 48 L 130 48 C 122 48 118 45 120 40 Z"
                fill="currentColor"
              />
              <path
                d="M 680 34 C 676 28 684 21 692 22 C 698 15 712 14 720 19 C 727 16 735 18 738 24 C 744 23 750 27 750 33 C 750 38 742 41 730 41 L 688 41 C 682 41 678 38 680 34 Z"
                fill="currentColor"
              />
              <path
                d="M 1120 38 C 1114 30 1126 20 1138 22 C 1146 12 1165 11 1176 18 C 1185 14 1198 17 1202 25 C 1212 24 1220 29 1220 37 C 1220 43 1210 47 1195 47 L 1132 47 C 1123 47 1118 44 1120 38 Z"
                fill="currentColor"
              />
            </g>

            {/* Distant flock of birds soaring gracefully across the morning sky */}
            <g className="heritage-sky-birds" opacity="0.32" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
              <path d="M 512 26 Q 515 22 518 26 Q 521 22 524 26" />
              <path d="M 526 21 Q 529 17 532 21 Q 535 17 538 21" />
              <path d="M 540 27 Q 543 23 546 27 Q 549 23 552 27" />
              <path d="M 972 28 Q 975 24 978 28 Q 981 24 984 28" />
              <path d="M 986 23 Q 989 19 992 23 Q 995 19 998 23" />
            </g>
          </g>

          {/* 2. Distant Western Ghats / Nilgiris Hill Ridges */}
          <g className="heritage-layer heritage-layer--hills">
            {/* Distant ridge 1 */}
            <path
              d="M 0 64 Q 180 48 380 60 T 760 50 Q 940 44 1120 58 T 1440 52 L 1440 120 L 0 120 Z"
              fill="currentColor"
              className="heritage-hill heritage-hill--back"
              opacity="0.3"
            />
            {/* Mid-distance ridge 2 */}
            <path
              d="M 0 70 Q 220 56 460 68 T 920 60 Q 1160 54 1440 66 L 1440 120 L 0 120 Z"
              fill="currentColor"
              className="heritage-hill heritage-hill--mid"
              opacity="0.4"
            />
          </g>

          {/* 3. Heritage Architecture, Monuments & Flora Trail */}
          <g className="heritage-layer heritage-layer--monuments">
            {/* Coastal Water Reflection Strip */}
            <rect x="0" y="74" width="1440" height="46" fill="url(#coastalWater)" />
            {/* Sun shimmer on water */}
            <ellipse cx="875" cy="80" rx="95" ry="5" fill="url(#waterShimmer)" />

            {/* ── Left Headland: Coastal Village Cottage with lit windows ── */}
            <g className="heritage-monument heritage-cottage" opacity="0.85">
              {/* Cottage Base & Roof */}
              <path d="M 82 82 L 82 74 L 110 74 L 110 82 Z" fill="#1b3552" />
              <path d="M 78 74 L 96 66 L 114 74 Z" fill="#244569" />
              {/* Warm lit yellow windows (cottage interior light) */}
              <rect x="86" y="76" width="5" height="4" rx="0.5" fill="#FDB913" />
              <rect x="94" y="76" width="5" height="4" rx="0.5" fill="#FDB913" />
              <rect x="102" y="76" width="4" height="4" rx="0.5" fill="#FDB913" />
            </g>

            {/* ── Monument A: Majestic Grand Dravidian Gopuram (Primary Anchor) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--main" tabIndex={0} role="img" aria-label="Dravidian Temple Gopuram">
              {/* Adhisthana / Temple Base & Arched Gateway Portal */}
              <path d="M 188 82 L 188 72 L 236 72 L 236 82 Z" fill="#152d47" />
              <path d="M 207 82 L 207 74 Q 212 72 217 74 L 217 82 Z" fill="#081829" />
              {/* Tier 1 */}
              <path d="M 189 72 L 193 63 L 231 63 L 235 72 Z" fill="#1b3856" />
              <line x1="187" y1="63" x2="237" y2="63" stroke="#2b4c73" strokeWidth="1" />
              {/* Tier 2 */}
              <path d="M 194 63 L 198 54 L 226 54 L 230 63 Z" fill="#1e3e60" />
              <line x1="192" y1="54" x2="232" y2="54" stroke="#2b4c73" strokeWidth="1" />
              {/* Tier 3 */}
              <path d="M 199 54 L 203 45 L 221 45 L 225 54 Z" fill="#22446a" />
              <line x1="197" y1="45" x2="227" y2="45" stroke="#2b4c73" strokeWidth="1" />
              {/* Tier 4 */}
              <path d="M 204 45 L 207 37 L 217 37 L 220 45 Z" fill="#264b75" />
              <line x1="202" y1="37" x2="222" y2="37" stroke="#2b4c73" strokeWidth="1" />
              {/* Sala Barrel Shikhara Roof Crest */}
              <path d="M 206 37 C 206 30 218 30 218 37 Z" fill="#2c5380" />
              {/* 5 Traditional Golden Kalasam Finials */}
              <path d="M 212 30 L 212 25 Q 212 23 212 22" stroke="#FFBF18" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="212" cy="22" r="1.2" fill="#FFBF18" />
              <path d="M 208.5 32 L 208.5 27" stroke="#FFBF18" strokeWidth="0.9" strokeLinecap="round" />
              <circle cx="208.5" cy="26" r="0.9" fill="#FFBF18" />
              <path d="M 215.5 32 L 215.5 27" stroke="#FFBF18" strokeWidth="0.9" strokeLinecap="round" />
              <circle cx="215.5" cy="26" r="0.9" fill="#FFBF18" />
              {/* Niches / Carved details */}
              <rect x="210" y="65" width="4" height="5" rx="0.5" fill="#0c2033" />
              <rect x="210.5" y="56" width="3" height="4" rx="0.5" fill="#0c2033" />
              <rect x="211" y="47" width="2" height="3" rx="0.5" fill="#0c2033" />
            </g>

            {/* ── Monument B: Second Gopuram (Mid-Distance Architectural Rhythm) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--second" tabIndex={0} role="img" aria-label="Second Temple Gopuram">
              <path d="M 314 82 L 314 74 L 350 74 L 350 82 Z" fill="#152d47" />
              <path d="M 329 82 L 329 76 Q 332 74 335 76 L 335 82 Z" fill="#081829" />
              <path d="M 316 74 L 319 65 L 345 65 L 348 74 Z" fill="#1b3856" />
              <path d="M 320 65 L 323 57 L 341 57 L 344 65 Z" fill="#1e3e60" />
              <path d="M 324 57 L 327 48 L 337 48 L 340 57 Z" fill="#22446a" />
              <path d="M 327 48 C 327 42 337 42 337 48 Z" fill="#2c5380" />
              {/* Kalasams */}
              <path d="M 332 42 L 332 37" stroke="#FFBF18" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="332" cy="36" r="1.1" fill="#FFBF18" />
              <path d="M 329 44 L 329 40" stroke="#FFBF18" strokeWidth="0.8" strokeLinecap="round" />
              <path d="M 335 44 L 335 40" stroke="#FFBF18" strokeWidth="0.8" strokeLinecap="round" />
            </g>

            {/* ── Monument C: Distant Third Gopuram (Center Horizon) ── */}
            <g className="heritage-monument heritage-gopuram heritage-gopuram--distant">
              <path d="M 596 82 L 596 75 L 626 75 L 626 82 Z" fill="#152d47" opacity="0.85" />
              <path d="M 598 75 L 601 67 L 621 67 L 624 75 Z" fill="#1b3856" opacity="0.85" />
              <path d="M 602 67 L 605 59 L 617 59 L 620 67 Z" fill="#1e3e60" opacity="0.85" />
              <path d="M 606 59 C 606 53 616 53 616 59 Z" fill="#2c5380" opacity="0.85" />
              <path d="M 611 53 L 611 48" stroke="#FFBF18" strokeWidth="1" strokeLinecap="round" opacity="0.9" />
              <circle cx="611" cy="47" r="0.9" fill="#FFBF18" />
            </g>

            {/* ── Monument D: Traditional Pillared Mandapam (Colonnade / Hall of 1000 Pillars) ── */}
            <g className="heritage-monument heritage-mandapam" tabIndex={0} role="img" aria-label="Heritage Pillared Mandapam">
              {/* Stone Cornice / Beam */}
              <rect x="756" y="68" width="134" height="3" fill="#1b3552" />
              <rect x="758" y="65" width="130" height="3" fill="#23466d" />
              {/* Row of 16 Stone Pillars */}
              {[...Array(16)].map((_, i) => {
                const px = 760 + i * 8.4;
                return (
                  <g key={`pillar-${i}`}>
                    <line x1={px} y1={71} x2={px} y2={82} stroke="#1b3552" strokeWidth="1.6" />
                    <circle cx={px} cy={71} r="1.1" fill="#2c5380" />
                    <rect x={px - 1.2} y={80.5} width="2.4" height="1.5" fill="#112438" />
                  </g>
                );
              })}
            </g>

            {/* ── Monument E: Coastal Lighthouse on Rocky Shoreline ── */}
            <g className="heritage-monument heritage-lighthouse" tabIndex={0} role="img" aria-label="Coastal Lighthouse">
              {/* Rocky Promontory */}
              <path d="M 1032 84 Q 1048 77 1064 84 Z" fill="#0f253d" />
              {/* Tapering Lighthouse Tower */}
              <path d="M 1044 82 L 1046 50 L 1052 50 L 1054 82 Z" fill="#1a3759" />
              {/* Balcony Gallery */}
              <line x1="1043" y1="50" x2="1055" y2="50" stroke="#FFBF18" strokeWidth="1" />
              {/* Lantern Room */}
              <rect x="1046" y="44" width="6" height="6" fill="#FDB913" opacity="0.9" />
              {/* Dome & Light Beacon */}
              <path d="M 1045 44 C 1045 40 1053 40 1053 44 Z" fill="#0f253d" />
              <line x1="1049" y1="40" x2="1049" y2="37" stroke="#FDB913" strokeWidth="1" strokeLinecap="round" />
            </g>

            {/* ── Monument F: Traditional Tamil Catamaran / Fishing Boat (`Pattai`) ── */}
            <g className="heritage-monument heritage-boat" tabIndex={0} role="img" aria-label="Tamil Fishing Boat">
              {/* Hull */}
              <path d="M 1242 80 C 1252 86, 1278 86, 1294 79 C 1282 84, 1258 84, 1242 80 Z" fill="#11263d" />
              <path d="M 1240 79 L 1296 78 L 1290 82 L 1244 82 Z" fill="#1a3759" />
              {/* Mast & Rigging */}
              <line x1="1268" y1="80" x2="1268" y2="58" stroke="#081829" strokeWidth="1.2" />
              <line x1="1250" y1="79" x2="1268" y2="58" stroke="#475569" strokeWidth="0.7" opacity="0.6" />
              <line x1="1288" y1="78" x2="1268" y2="58" stroke="#475569" strokeWidth="0.7" opacity="0.6" />
              {/* Angled Billowing Sail */}
              <path d="M 1268 60 Q 1282 66 1284 76 L 1268 76 Z" fill="#f8fafc" opacity="0.85" />
              <path d="M 1267 62 Q 1256 68 1252 76 L 1267 76 Z" fill="#e2e8f0" opacity="0.75" />
            </g>

            {/* ── Lush Tamil Nadu Flora: Iconic Palmyra Palms & Coconut Groves ── */}
            {/* Leftmost iconic Palmyra palm cluster (State tree of Tamil Nadu) */}
            <g className="heritage-flora heritage-palms--left" fill="#0a1d33">
              {/* Tall Palmyra Palm 1 */}
              <path d="M 16 82 Q 18 52 20 22 L 22 22 Q 20 52 18 82 Z" />
              <g transform="translate(20, 22) scale(0.62)">
                <path d="M 0 0 Q -16 -12 -24 -6 Q -12 4 0 0 Z" />
                <path d="M 0 0 Q -20 -22 -16 -20 Q -4 2 0 0 Z" />
                <path d="M 0 0 Q 0 -28 2 -26 Q 2 -2 0 0 Z" />
                <path d="M 0 0 Q 20 -22 16 -20 Q 4 2 0 0 Z" />
                <path d="M 0 0 Q 24 -12 28 -6 Q 14 4 0 0 Z" />
                <path d="M 0 0 Q 22 12 26 18 Q 12 12 0 0 Z" />
                <path d="M 0 0 Q -22 12 -26 18 Q -12 12 0 0 Z" />
              </g>
              {/* Palmyra Palm 2 */}
              <path d="M 38 82 Q 40 56 42 32 L 44 32 Q 42 56 40 82 Z" />
              <g transform="translate(42, 32) scale(0.52)">
                <path d="M 0 0 Q -15 -10 -22 -5 Q -10 3 0 0 Z" />
                <path d="M 0 0 Q -18 -18 -14 -16 Q -3 2 0 0 Z" />
                <path d="M 0 0 Q 0 -24 2 -22 Q 2 -2 0 0 Z" />
                <path d="M 0 0 Q 18 -18 14 -16 Q 3 2 0 0 Z" />
                <path d="M 0 0 Q 22 -10 26 -5 Q 12 3 0 0 Z" />
              </g>
              {/* Coastal Bush / Shrub Silhouette */}
              <path d="M 0 82 C 10 75 25 76 35 80 C 45 74 60 75 72 82 Z" fill="#081829" />
            </g>

            {/* Interspersed Palms across the Trail */}
            <g className="heritage-flora heritage-palms--trail" fill="#0f2640" opacity="0.9">
              {/* Near Main Gopuram */}
              <path d="M 152 82 Q 154 62 156 44 L 157.5 44 Q 155.5 62 153.5 82 Z" />
              <circle cx="156" cy="44" r="8" opacity="0.75" />
              {/* Between Gopurams */}
              <path d="M 275 82 Q 276 66 277 52 L 278.5 52 Q 277.5 66 276.5 82 Z" />
              <circle cx="277" cy="52" r="7" opacity="0.7" />
              {/* Center Palms */}
              <path d="M 440 82 Q 441 68 442 56 L 443.5 56 Q 442.5 68 441.5 82 Z" />
              <circle cx="442" cy="56" r="6.5" opacity="0.65" />
              <path d="M 515 82 Q 516 68 517 54 L 518.5 54 Q 517.5 68 516.5 82 Z" />
              <circle cx="517" cy="54" r="6" opacity="0.65" />
              <path d="M 680 82 Q 681 70 682 58 L 683.5 58 Q 682.5 70 681.5 82 Z" />
              <circle cx="682" cy="58" r="6" opacity="0.65" />
              {/* Near Mandapam */}
              <path d="M 925 82 Q 926 70 927 58 L 928.5 58 Q 927.5 70 926.5 82 Z" />
              <circle cx="927" cy="58" r="6.5" opacity="0.65" />
            </g>

            {/* Right Headland Palms */}
            <g className="heritage-flora heritage-palms--right" fill="#081829">
              <path d="M 1410 82 Q 1408 54 1406 28 L 1408 28 Q 1410 54 1412 82 Z" />
              <g transform="translate(1407, 28) scale(0.55)">
                <path d="M 0 0 Q -18 -12 -24 -6 Q -12 4 0 0 Z" />
                <path d="M 0 0 Q -18 -22 -14 -18 Q -3 2 0 0 Z" />
                <path d="M 0 0 Q 0 -26 2 -24 Q 2 -2 0 0 Z" />
                <path d="M 0 0 Q 18 -22 14 -18 Q 3 2 0 0 Z" />
                <path d="M 0 0 Q 22 -12 26 -6 Q 12 4 0 0 Z" />
              </g>
              <path d="M 1432 82 Q 1430 58 1428 36 L 1430 36 Q 1432 58 1434 82 Z" />
              <path d="M 1375 82 C 1390 76 1415 75 1440 79 L 1440 82 Z" fill="#0a1d33" />
            </g>
          </g>

          {/* 4. Layered Deep-Navy Foreground Waves (Layer with highest parallax) */}
          <g className="heritage-layer heritage-layer--waves">
            {/* Wave 1: Back Wave */}
            <path
              className="heritage-wave heritage-wave--back"
              d="M 0 68 C 220 80, 440 56, 700 70 C 960 84, 1200 62, 1440 74 L 1440 120 L 0 120 Z"
            />
            {/* Wave 2: Mid Wave */}
            <path
              className="heritage-wave heritage-wave--mid"
              d="M 0 78 C 260 64, 540 90, 820 74 C 1080 60, 1280 82, 1440 76 L 1440 120 L 0 120 Z"
            />
            {/* Wave 3: Front Wave (Merges seamlessly with bottom bar) */}
            <path
              className="heritage-wave heritage-wave--front"
              d="M 0 88 C 240 98, 520 78, 800 92 C 1080 102, 1300 84, 1440 90 L 1440 120 L 0 120 Z"
            />
          </g>

          {/* 5. Signature Golden Dotted Flight Path with Loop-the-Loop */}
          <g className="heritage-layer heritage-layer--flightpath">
            {/* The Golden Path */}
            <path
              id="heritageFlightPath"
              className="heritage-flight-line"
              d="M 70 89 C 220 70, 430 96, 680 82 C 900 68, 1100 88, 1220 76 C 1255 72, 1276 65, 1285 52 C 1295 36, 1280 20, 1262 25 C 1245 31, 1244 48, 1262 58 C 1280 68, 1312 66, 1345 52 L 1368 40"
              stroke="#FFBF18"
              strokeWidth="2.4"
              strokeDasharray="6 7"
              strokeLinecap="round"
            />

            {/* Glowing Golden Route Marker Pins */}
            <g className="heritage-route-pins">
              {/* Pin 1 */}
              <circle cx="70" cy="89" r="5" fill="#FFBF18" opacity="0.3" className="heritage-pin-halo" />
              <circle cx="70" cy="89" r="3" fill="#FFBF18" />
              {/* Pin 2 */}
              <circle cx="430" cy="94" r="2.4" fill="#FFBF18" />
              {/* Pin 3 */}
              <circle cx="680" cy="82" r="4.5" fill="#FFBF18" opacity="0.3" className="heritage-pin-halo" />
              <circle cx="680" cy="82" r="2.8" fill="#FFBF18" />
              {/* Pin 4 */}
              <circle cx="980" cy="74" r="2.4" fill="#FFBF18" />
              {/* Pin 5 */}
              <circle cx="1220" cy="76" r="4.5" fill="#FFBF18" opacity="0.3" className="heritage-pin-halo" />
              <circle cx="1220" cy="76" r="2.8" fill="#FFBF18" />
            </g>
          </g>
        </svg>

        {/* 6. Authentic Official Thabaal Carrier Bird Motif perched at Path Endpoint */}
        <div className="heritage-endpoint-bird" aria-hidden="true">
          <Image
            src="/brands/thabaal/mark.png"
            alt=""
            width={28}
            height={15}
            className="heritage-mini-bird"
            priority
          />
        </div>
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
