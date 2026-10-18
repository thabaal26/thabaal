"use client";
import { useEffect } from "react";

/**
 * Keyboard behaviour for an overlay drawn as a plain element (not <dialog> or <Sheet>): while `open`, focus moves to
 * the first field (or the panel), Escape calls `close`, and when it closes focus goes back to whatever opened it.
 * Pair it with role="dialog", aria-modal="true" and aria-labelledby on the panel.
 */
export function useModalKeys(open: boolean, close: () => void, panelId: string) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = document.getElementById(panelId);
    const first = panel?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button");
    (first ?? panel)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // `close` is a fresh function on each render; the effect only needs to follow `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelId]);
}
