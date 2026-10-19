"use client";

import { useState } from "react";
import Image from "next/image";

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
        {/* Brand Logo */}
        <a href="#top" className="site-header-brand" aria-label={ta ? "தபால் முகப்பு" : "Thabaal home"}>
          <Image
            src="/brands/thabaal/w-day.png"
            alt="Thabaal"
            width={136}
            height={38}
            className="site-header-logo-day"
            priority
          />
          <Image
            src="/brands/thabaal/w-night.png"
            alt="Thabaal"
            width={136}
            height={38}
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
            {ta ? "தபால் என்ன செய்யும்" : "What Thabaal does"}
          </a>
          <a href="#how-it-works" onClick={closeMenu}>
            {ta ? "எப்படி செயல்படுகிறது" : "How it works"}
          </a>
          <a href="#reports" onClick={closeMenu}>
            {ta ? "அறிக்கைகள்" : "Reports"}
          </a>
          <a href="#pricing" onClick={closeMenu}>
            {ta ? "கட்டணம்" : "Pricing"}
          </a>
        </nav>

        {/* Right Actions */}
        <div className="site-header-actions">
          {/* Language Toggle Pill */}
          <button
            type="button"
            onClick={onToggleLang}
            className="site-header-lang-btn"
            aria-label={ta ? "Switch to English" : "தமிழுக்கு மாற்றவும்"}
          >
            {ta ? "English / தமிழ்" : "தமிழ் / EN"}
          </button>

          {/* Log in CTA (scrolls to top auth card) */}
          <a href="#top" className="site-header-btn site-header-btn-secondary">
            {ta ? "உள்நுழைக" : "Log in"}
          </a>

          {/* Start Free CTA */}
          <a href="#top" className="site-header-btn site-header-btn-primary">
            {ta ? "இலவசமாகத் தொடங்கு" : "Start free"}
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
