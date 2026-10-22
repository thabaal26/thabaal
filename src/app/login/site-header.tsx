"use client";

import { useState } from "react";
import Image from "next/image";
import { DEMO_TARGET, DEMO_URL } from "./demo-link";

type Lang = "en" | "ta";

interface SiteHeaderProps {
  lang: Lang;
  onToggleLang: () => void;
  onSelectLang: (lang: Lang) => void;
}

export function SiteHeader({ lang, onToggleLang, onSelectLang }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const ta = lang === "ta";

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="site-header" role="banner">
      <div className="site-header-container">
        {/* Brand Logo with Carrier Bird */}
        <a href="#top" className="site-header-brand" aria-label={ta ? "தபால் முகப்பு" : "Thabaal home"}>
          <Image
            src={ta ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
            alt="Thabaal"
            width={154}
            height={52}
            className="site-header-logo-day"
            priority
          />
          <Image
            src={ta ? "/brands/thabaal/thabaal-logo-ta-dark.png" : "/brands/thabaal/thabaal-logo-en-dark.png"}
            alt="Thabaal"
            width={154}
            height={52}
            className="site-header-logo-night"
            priority
          />
        </a>

        {/* Desktop Navigation Links */}
        <nav
          className={`site-header-nav ${mobileMenuOpen ? "open" : ""}`}
          aria-label={ta ? "தள வழிசெலுத்தல்" : "Site navigation"}
        >
          <a href="#features" onClick={closeMenu}>
            {ta ? "தபால் ஏன்" : "Why Thabaal"}
          </a>
          <a href="#reports" onClick={closeMenu}>
            {ta ? "அறிக்கைகள்" : "Analytics"}
          </a>
          <a href="#how-it-works" onClick={closeMenu}>
            {ta ? "ஆர்டர்கள்" : "Orders"}
          </a>
          <a href="#templates" onClick={closeMenu}>
            {ta ? "டெம்ப்ளேட்டுகள்" : "Templates"}
          </a>
          <a href="#pricing" onClick={closeMenu}>
            {ta ? "கட்டணம்" : "Pricing"}
          </a>
          <a
            href="/docs/Thabaal_Brochure_221026.pdf"
            download="Thabaal_Brochure_221026.pdf"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="site-header-nav-download"
          >
            {ta ? "📥 பிரோஷர் பதிவிறக்கு (PDF)" : "📥 Download brochure (PDF)"}
          </a>
        </nav>

        {/* Right Actions */}
        <div className="site-header-actions">
          {/* Language Toggle Pill */}
          <button
            type="button"
            onClick={onToggleLang}
            className="site-header-lang-btn"
            aria-label={ta ? "English / தமிழ் — Switch to English" : "தமிழ் / EN — தமிழுக்கு மாற்றவும்"}
          >
            {ta ? "English / தமிழ்" : "தமிழ் / EN"}
          </button>

          {/* Download Brochure CTA (Replaces Log In button) */}
          <a
            href="/docs/Thabaal_Brochure_221026.pdf"
            download="Thabaal_Brochure_221026.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="site-header-btn site-header-btn-secondary"
            aria-label={ta ? "பிரோஷர் பதிவிறக்குங்கள்" : "Download brochure"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ marginRight: 6 }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {ta ? "பிரோஷர் பதிவிறக்கு" : "Download brochure"}
          </a>

          {/* Book a demo CTA */}
          <a href={DEMO_URL} {...DEMO_TARGET} className="site-header-btn site-header-btn-primary">
            {ta ? "டெமோ பதிவு செய்யுங்கள்" : "Book a demo"}
          </a>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            className="site-header-menu-btn"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? (ta ? "மெனுவை மூடு" : "Close menu") : (ta ? "மெனுவைத் திற" : "Open menu")}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>
    </header>
  );
}
