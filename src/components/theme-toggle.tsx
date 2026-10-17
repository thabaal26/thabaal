"use client";

import { Monitor, Moon, Sun } from "@/components/icons";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useTr } from "@/lib/i18n/context";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "theme";
const ORDER: ThemeMode[] = ["light", "dark", "system"];
const LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "Match device" };

const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(mode: ThemeMode, animate: boolean) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && prefersDark());
  if (animate) {
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 350);
  }
  root.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B1E2D" : "#FFF9F0");
  // Every switch on the page (top bar, page header, Settings) follows the change.
  window.dispatchEvent(new CustomEvent("themechange", { detail: mode }));
}

function saved(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked: the default */
  }
  return "light";
}

function save(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* not remembered, still applied */
  }
}

/** The chosen look on this device, kept in step across every switch on the page and the device setting. */
function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved choice once after mount
    setMode(saved());
    const on = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener("themechange", on);
    return () => window.removeEventListener("themechange", on);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system", true);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);

  const choose = (m: ThemeMode) => {
    setMode(m);
    save(m);
    apply(m, true);
  };
  return [mode, choose];
}

/**
 * Light / dark / match-device switch (one button that steps through them). The choice is remembered
 * on this device; "match device" follows the phone or computer setting live.
 */
export function ThemeToggle({ onDark, className }: { onDark?: boolean; className?: string }) {
  const [mode, choose] = useThemeMode();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const nextMode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => choose(nextMode)}
      title={`Look: ${LABEL[mode]}. Switch to ${LABEL[nextMode].toLowerCase()}`}
      aria-label={`Look: ${LABEL[mode]}. Switch to ${LABEL[nextMode].toLowerCase()}`}
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

/** Settings → Look: the three choices side by side. */
export function ThemeChoice() {
  const [mode, choose] = useThemeMode();
  const { tr } = useTr();
  const options: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { id: "system", label: "Device", Icon: Monitor },
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
  ];
  return (
    <div role="radiogroup" aria-label={tr("Look")} className="inline-flex rounded-control border-[1.5px] border-line bg-panel p-[3px]">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          onClick={() => choose(id)}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold transition sm:min-h-0",
            mode === id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
          )}
        >
          <Icon aria-hidden className="size-4" /> {tr(label)}
        </button>
      ))}
    </div>
  );
}
