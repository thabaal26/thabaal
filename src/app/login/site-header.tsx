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

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    closeMenu();
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.location.hash !== `#${targetId}`) {
        history.pushState(null, "", `#${targetId}`);
      }
    } else {
      // This page (sign-up) has no such section: open it on the sign-in page, which has them all.
      e.preventDefault();
      window.location.assign(`/login#${targetId}`);
    }
  };

  const handleTopClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    closeMenu();
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (window.location.hash) {
      history.pushState(null, "", window.location.pathname + window.location.search);
    }
  };

  return (
    <header className="site-header" role="banner">
      <div className="site-header-container">
        {/* Brand Logo with Carrier Bird */}
        <a
          href="#top"
          onClick={handleTopClick}
          className="site-header-brand"
          aria-label={ta ? "தபால் முகப்பு" : "Thabaal home"}
        >
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
          <a href="#features" onClick={(e) => handleNavClick(e, "features")}>
            {ta ? "தபால் ஏன்" : "Why Thabaal"}
          </a>
          <a href="#reports" onClick={(e) => handleNavClick(e, "reports")}>
            {ta ? "அறிக்கைகள்" : "Analytics"}
          </a>
          <a href="#how-it-works" onClick={(e) => handleNavClick(e, "how-it-works")}>
            {ta ? "ஆர்டர்கள்" : "Orders"}
          </a>
          <a href="#templates" onClick={(e) => handleNavClick(e, "templates")}>
            {ta ? "டெம்ப்ளேட்டுகள்" : "Templates"}
          </a>
          <a href="#pricing" onClick={(e) => handleNavClick(e, "pricing")}>
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

          {/* Book a demo CTA */}
          <a href={DEMO_URL} {...DEMO_TARGET} className="site-header-btn site-header-btn-primary">
            {ta ? "டெமோ பதிவு செய்யுங்கள்" : "Book a demo"}
          </a>

          {/* Download Brochure CTA (Dark button, placed after Book a Demo) */}
          <a
            href="/docs/Thabaal_Brochure_221026.pdf"
            download="Thabaal_Brochure_221026.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="site-header-btn site-header-btn-dark"
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
