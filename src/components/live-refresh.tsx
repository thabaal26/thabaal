"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps a page up to date by itself: every few seconds (only while the tab is visible) it asks /api/live whether
 * any order changed, and refreshes the page's data when one did, e.g. a payment that just arrived on WhatsApp.
 * What the person is typing or has open stays as it is; only the figures and cards update.
 */
export function LiveRefresh({ every = 8000 }: { every?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok || stop) return;
        const { v } = (await res.json()) as { v: string };
        if (stop) return;
        if (last.current !== null && v !== last.current) router.refresh();
        last.current = v;
      } catch {
        // offline for a moment: try again on the next tick
      }
    };
    void check();
    const timer = window.setInterval(check, every);
    // Coming back to the tab checks straight away.
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, every]);

  return null;
}
