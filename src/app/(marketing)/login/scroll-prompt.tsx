"use client";

import { useEffect, useState } from "react";
import "./scroll-prompt.css";

/*
 * Attention-grabbing "Scroll down to view" floating pop-up badge:
 * - Positioned at the bottom center of the sign-in viewport.
 * - Circular attention bar with theme-colored gradient (#FDB913), pulsing halo ring, and bouncing downward arrow.
 * - Bilingual: "Scroll down to view" (EN) / "கீழே உருட்டிப் பாருங்கள்" (TA).
 * - Smoothly scrolls to #explore on click.
 * - Auto-fades out when the user scrolls down, reappears when scrolled back up.
 */

export function ScrollDownPrompt({ lang }: { lang: "en" | "ta" }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let isHidden = false;

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        // Hide once user scrolls past 45px
        const past = window.scrollY > 45;
        if (past !== isHidden) {
          isHidden = past;
          setScrolled(past);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("explore");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <a
      href="#explore"
      onClick={handleClick}
      className={`thabaal-scroll-prompt ${scrolled ? "is-hidden" : ""}`}
      aria-label={lang === "ta" ? "கீழே உருட்டிப் பாருங்கள்" : "Scroll down to view"}
    >
      <span className="thabaal-scroll-label">
        <span className="thabaal-scroll-pill-text">
          {lang === "ta" ? "கீழே உருட்டிப் பாருங்கள்" : "Scroll down to view"}
        </span>
      </span>

      <span className="thabaal-scroll-circle" aria-hidden="true">
        <span className="thabaal-scroll-pulse" />
        <svg
          viewBox="0 0 20 20"
          className="thabaal-scroll-arrow"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </span>
    </a>
  );
}
