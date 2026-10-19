"use client";

import { useEffect, useState } from "react";

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
// 60–120 FPS High-Performance Cached Parallax Engine (Zero Layout Thrashing)
// ---------------------------------------------------------------------------

type ParallaxSubscriber = {
  element: HTMLElement;
  speed: number;
  clamped: number;
  cachedDocTop: number;
  cachedHeight: number;
};

const subscribers = new Set<ParallaxSubscriber>();
let rafId: number | null = null;
let listenerAttached = false;
let isScrollTicking = false;

function refreshSubscriberMetrics() {
  if (typeof window === "undefined") return;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  subscribers.forEach((sub) => {
    const rect = sub.element.getBoundingClientRect();
    sub.cachedDocTop = rect.top + scrollY;
    sub.cachedHeight = rect.height;
  });
}

function onGlobalScroll() {
  if (isScrollTicking) return;
  isScrollTicking = true;
  rafId = requestAnimationFrame(() => {
    isScrollTicking = false;
    updateAllParallaxLayers();
  });
}

function updateAllParallaxLayers() {
  if (subscribers.size === 0 || typeof window === "undefined") return;
  const vh = window.innerHeight || 800;
  const isMobile = window.innerWidth < 768;
  const mobileScale = isMobile ? 0.45 : 1.0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  subscribers.forEach(({ element, speed, clamped, cachedDocTop, cachedHeight }) => {
    // Pure arithmetic calculation using cached document position - ZERO layout thrashing!
    const elementViewportTop = cachedDocTop - scrollY;
    // Skip calculations if well outside the viewport
    if (elementViewportTop + cachedHeight < -80 || elementViewportTop > vh + 80) return;

    // Center offset relative to viewport center
    const centerOffset = elementViewportTop + cachedHeight / 2 - vh / 2;
    const rawOffset = centerOffset * speed * mobileScale;
    const maxOffset = clamped * mobileScale;
    const safeOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

    element.style.transform = `translate3d(0, ${safeOffset.toFixed(2)}px, 0)`;
  });
}

export function registerParallaxLayer(element: HTMLElement, speed: number, clamped: number): () => void {
  const sub: ParallaxSubscriber = {
    element,
    speed,
    clamped,
    cachedDocTop: 0,
    cachedHeight: 0,
  };
  subscribers.add(sub);

  const measureAndScroll = () => {
    refreshSubscriberMetrics();
    onGlobalScroll();
  };

  if (!listenerAttached && typeof window !== "undefined") {
    window.addEventListener("scroll", onGlobalScroll, { passive: true });
    window.addEventListener("resize", measureAndScroll, { passive: true });
    listenerAttached = true;
  }

  // Measure asynchronously on next animation frame (NEVER synchronously during React mount!)
  if (typeof window !== "undefined") {
    requestAnimationFrame(() => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const rect = element.getBoundingClientRect();
      sub.cachedDocTop = rect.top + scrollY;
      sub.cachedHeight = rect.height;
      onGlobalScroll();
    });
  }

  return () => {
    subscribers.delete(sub);
    element.style.transform = "";
    if (subscribers.size === 0 && listenerAttached) {
      window.removeEventListener("scroll", onGlobalScroll);
      window.removeEventListener("resize", measureAndScroll);
      listenerAttached = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}
