import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-[1.6rem] font-semibold leading-tight tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {/* Phones: buttons share the row and wrap two-up instead of squeezing four into one line. */}
      {actions && <div className="flex flex-wrap gap-2 *:min-w-[calc(50%-0.25rem)] *:flex-1 sm:items-center sm:*:min-w-0 sm:*:flex-none">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-2xl border border-line bg-panel shadow-card", className)} {...p} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3.5 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1 basis-40">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="min-w-0 max-w-full shrink-0 self-start">{action}</div>}
    </div>
  );
}

const variants = {
  primary: "bg-brand text-white hover:bg-brand-deep shadow-sm shadow-brand/20",
  secondary: "border border-line bg-white text-ink hover:bg-canvas",
  ghost: "text-ink-2 hover:bg-canvas hover:text-ink",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

export function buttonClass(variant: keyof typeof variants = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition sm:rounded-lg active:scale-[0.97] [@media(hover:hover)]:hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
    // Phones get 40–44px targets; desktop keeps the denser sizes.
    size === "sm" ? "h-10 px-3.5 text-sm sm:h-8 sm:px-3 sm:text-xs" : "h-11 px-4 text-[15px] sm:h-10 sm:text-sm",
    variants[variant],
  );
}

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: keyof typeof variants; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...p} />;
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2">
      <span>{children}</span>
      {hint && <span className="font-normal text-muted">{hint}</span>}
    </label>
  );
}

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/15",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
};

export function Badge({ tone = "gray", children, dot }: { tone?: keyof typeof tones; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: keyof typeof tones; label: string }> = {
  QUEUED: { tone: "gray", label: "Queued" },
  SENT: { tone: "blue", label: "Sent" },
  DELIVERED: { tone: "green", label: "Delivered" },
  READ: { tone: "violet", label: "Read" },
  FAILED: { tone: "red", label: "Failed" },
  SKIPPED: { tone: "amber", label: "Skipped" },
  DRAFT: { tone: "gray", label: "Draft" },
  PENDING: { tone: "amber", label: "In review" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
  PAUSED: { tone: "amber", label: "Paused by Meta" },
  DISABLED: { tone: "red", label: "Disabled" },
  RUNNING: { tone: "blue", label: "Sending" },
  WAITING_TEMPLATE: { tone: "amber", label: "Waiting for approval" },
  WAITING_CONNECTION: { tone: "amber", label: "Phone disconnected" },
  WAITING_LIMIT: { tone: "amber", label: "Daily limit reached" },
  WAITING_QUALITY: { tone: "red", label: "Paused: low quality" },
  WAITING_QUIET: { tone: "gray", label: "Waiting: quiet hours" },
  META: { tone: "blue", label: "Meta API" },
  LOCAL: { tone: "violet", label: "Local session" },
  COMPLETED: { tone: "green", label: "Completed" },
  CANCELLED: { tone: "gray", label: "Stopped" },
  MARKETING: { tone: "violet", label: "Marketing" },
  UTILITY: { tone: "blue", label: "Utility" },
  AUTHENTICATION: { tone: "amber", label: "Authentication" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "gray" as const, label: status };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-deep">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const QUALITY: Record<string, { tone: keyof typeof tones; label: string }> = {
  GREEN: { tone: "green", label: "Quality: High" },
  YELLOW: { tone: "amber", label: "Quality: Medium" },
  RED: { tone: "red", label: "Quality: Low" },
};

/** Meta's quality rating for a sending number. */
export function QualityBadge({ rating }: { rating: string | null | undefined }) {
  const q = (rating && QUALITY[rating]) || { tone: "gray" as const, label: "Quality: not rated yet" };
  return <Badge tone={q.tone} dot>{q.label}</Badge>;
}

/** Shown to an admin in "All clients" view on pages that create something for one client. */
export function PickClientNotice({ what }: { what: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <h3 className="text-sm font-semibold text-ink">Pick a client first</h3>
        <p className="mt-1 max-w-sm text-sm text-muted">Choose a client in the sidebar switcher, then add the {what} for them.</p>
      </div>
    </Card>
  );
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; accent?: string }) {
  return (
    <Card className="lift p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-snug text-muted sm:text-xs">{label}</p>
        <span className={cn("hidden size-8 shrink-0 place-items-center rounded-lg sm:grid", accent ?? "bg-brand-soft text-brand-deep")}>{icon}</span>
      </div>
      <p className="tabular mt-1.5 text-[1.6rem] font-semibold leading-none tracking-tight sm:mt-3 sm:text-3xl">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-muted sm:text-xs">{sub}</p>}
    </Card>
  );
}
