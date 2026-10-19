"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Hook to detect if the user has requested reduced motion.
 * Respects OS accessibility settings.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } else if ("addListener" in mql) {
      (mql as any).addListener(handler);
      return () => (mql as any).removeListener(handler);
    }
  }, []);

  return reducedMotion;
}

/**
 * Hook to detect mobile viewports (< 768px) for adaptive motion parameters.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

// ---------------------------------------------------------------------------
// Shared Batched rAF Scroll Engine for Parallax (Single Listener for all layers)
// ---------------------------------------------------------------------------

type ParallaxSubscriber = {
  element: HTMLElement;
  speed: number;
  clamped: number;
};

const subscribers = new Set<ParallaxSubscriber>();
let rafId: number | null = null;
let listenerAttached = false;
let isScrollTicking = false;

function onGlobalScroll() {
  if (isScrollTicking) return;
  isScrollTicking = true;
  rafId = requestAnimationFrame(() => {
    isScrollTicking = false;
    updateAllParallaxLayers();
  });
}

function updateAllParallaxLayers() {
  if (subscribers.size === 0) return;
  const vh = window.innerHeight || 800;
  const isMobile = window.innerWidth < 768;
  const mobileScale = isMobile ? 0.45 : 1.0;

  subscribers.forEach(({ element, speed, clamped }) => {
    const rect = element.getBoundingClientRect();
    // Only calculate and transform if the layer is within or near the viewport
    if (rect.bottom < -100 || rect.top > vh + 100) return;

    // Center offset relative to viewport center
    const centerOffset = rect.top + rect.height / 2 - vh / 2;
    const rawOffset = centerOffset * speed * mobileScale;
    const maxOffset = clamped * mobileScale;
    const safeOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

    element.style.transform = `translate3d(0, ${safeOffset.toFixed(2)}px, 0)`;
  });
}

export function registerParallaxLayer(element: HTMLElement, speed: number, clamped: number): () => void {
  const sub: ParallaxSubscriber = { element, speed, clamped };
  subscribers.add(sub);

  if (!listenerAttached && typeof window !== "undefined") {
    // Law 8: Use capture + passive to catch scrolls on window OR internal containers
    window.addEventListener("scroll", onGlobalScroll, { passive: true, capture: true });
    window.addEventListener("resize", onGlobalScroll, { passive: true });
    listenerAttached = true;
  }

  // Trigger initial frame
  onGlobalScroll();

  return () => {
    subscribers.delete(sub);
    element.style.transform = "";
    if (subscribers.size === 0 && listenerAttached) {
      window.removeEventListener("scroll", onGlobalScroll, { capture: true });
      window.removeEventListener("resize", onGlobalScroll);
      listenerAttached = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}
