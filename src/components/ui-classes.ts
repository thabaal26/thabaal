import { cn } from "@/lib/cn";

// Plain class-name helpers shared by server and client components. They live outside ui.tsx because that file is a
// client module ("use client"): a server component calling a function from it crashes the page in production.

/** Padding inside a card body; compact on mobile, roomy on desktop. */
export const cardPad = "p-3.5 sm:p-5";

/**
 * Clean, high-contrast header: crystal-clear typography in night and day modes,
 * zero murky color washes, and clean uncolored monochrome icons.
 */
export const headerTones = {
  brand: { strip: "" },
  violet: { strip: "" },
  gold: { strip: "" },
  info: { strip: "" },
  rose: { strip: "" },
  amber: { strip: "" },
};
export type HeaderTone = keyof typeof headerTones;

/* ───────────────────────── Buttons ───────────────────────── */

const variants = {
  primary: "bg-brand text-on-brand font-semibold border-[1.5px] border-brand hover:brightness-105 hover:shadow-md hover:shadow-brand/20 active:scale-[0.97]",
  secondary: "border-[1.5px] border-line bg-panel text-ink font-semibold shadow-xs hover:border-ink hover:shadow-sm active:scale-[0.97]",
  ghost: "text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.97]",
  danger: "border-[1.5px] border-danger-border bg-panel text-danger font-semibold shadow-xs hover:bg-danger-bg hover:shadow-sm active:bg-danger-bg active:scale-[0.97]",
  dangerSolid: "bg-danger-solid text-white font-semibold shadow-xs hover:brightness-95 hover:shadow-md hover:shadow-danger-solid/25 active:brightness-90 active:scale-[0.97]",
  /** Text-only action inside a sentence or card header. */
  link: "text-brand-deep underline-offset-4 hover:underline font-semibold",
  /** For the dark sidebar and phone header. */
  onDark: "text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15 active:scale-[0.97]",
};
export type ButtonVariant = keyof typeof variants;
export type ButtonSize = "sm" | "md";

/**
 * Button styling, also used on links. Compact and balanced on phones while preserving desktop sizes.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", icon = false) {
  return cn(
    "ui-btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap transition-all duration-200 ease-out active:scale-[0.97] [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4",
    variant !== "link" && "hover:-translate-y-px active:translate-y-0",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-50",
    icon
      ? size === "sm"
        ? "size-10 rounded-[10px] sm:size-8.5"
        : "size-10.5 rounded-[12px]"
      : size === "sm"
        ? "min-h-10 px-3 text-[13.5px] rounded-[10px] sm:min-h-[34px]"
        : "min-h-[42px] px-4 text-[14.5px] rounded-[12px]",
    variants[variant],
  );
}

/** Table body rows: dividers and a hover tint. */
export const rowClass = "border-b border-line last:border-0 transition-colors hover:bg-brand-soft/40";
