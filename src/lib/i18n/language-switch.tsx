"use client";

import { useLanguage } from "./context";
import { cn } from "@/lib/cn";

export function LanguageSwitch({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language selection / மொழி தேர்வு"
      className={cn(
        "inline-flex items-center rounded-full border border-line bg-subtle/80 p-0.5 shadow-2xs backdrop-blur-xs select-none transition-all",
        size === "sm" ? "h-8 text-2xs" : size === "lg" ? "h-11 text-sm px-1" : "h-9 text-xs",
        className
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={lang === "en"}
        onClick={() => setLang("en")}
        className={cn(
          "relative flex items-center justify-center rounded-full font-semibold transition-all duration-200 cursor-pointer min-h-[32px]",
          size === "sm" ? "px-2 py-0.5" : size === "lg" ? "px-4 py-1.5" : "px-3 py-1",
          lang === "en"
            ? "bg-panel text-ink shadow-xs font-bold"
            : "text-muted hover:text-ink hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        )}
      >
        EN
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={lang === "ta"}
        onClick={() => setLang("ta")}
        className={cn(
          "relative flex items-center justify-center rounded-full font-medium transition-all duration-200 cursor-pointer min-h-[32px]",
          size === "sm" ? "px-2.5 py-0.5" : size === "lg" ? "px-4 py-1.5" : "px-3 py-1",
          lang === "ta"
            ? "bg-brand text-white shadow-xs font-semibold"
            : "text-muted hover:text-ink hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        )}
      >
        தமிழ்
      </button>
    </div>
  );
}

/** One button that switches to the other language: the phone top bar's version, leaving room for the business name. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  const next = lang === "en" ? "ta" : "en";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={next === "ta" ? "தமிழுக்கு மாற்று (Switch to Tamil)" : "Switch to English (ஆங்கிலத்துக்கு மாற்று)"}
      lang={next}
      className={cn(
        "inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-line bg-subtle/80 px-2.5 text-2xs font-semibold text-ink transition active:scale-95",
        className,
      )}
    >
      {next === "ta" ? "தமிழ்" : "EN"}
    </button>
  );
}
