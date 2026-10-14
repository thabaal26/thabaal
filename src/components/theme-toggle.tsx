"use client";

import { Monitor, Moon, Sun } from "@/components/icons";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = "light" | "dark" | "system";
const KEY = "theme";
const ORDER: Mode[] = ["light", "dark", "system"];
const LABEL: Record<Mode, string> = { light: "Light", dark: "Dark", system: "Match device" };

const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(mode: Mode, animate: boolean) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && prefersDark());
  if (animate) {
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 350);
  }
  root.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B1724" : "#FFFDF6");
}

/**
 * Light / dark / match-device switch. The choice is remembered on this device; "match device"
 * follows the phone or computer setting live.
 */
export function ThemeToggle({ onDark, className }: { onDark?: boolean; className?: string }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    let saved: Mode = "light";
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark" || v === "system") saved = v;
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved choice once after mount
    setMode(saved);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system", true);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);

  const next = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* not remembered, still applied */
    }
    apply(m, true);
  };

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const nextMode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${LABEL[mode]}. Switch to ${LABEL[nextMode].toLowerCase()}`}
      aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[nextMode].toLowerCase()}`}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-control transition active:scale-95",
        onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink-2 hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  );
}
