import { ArrowLeft, Loader2 } from "@/components/icons";
import Link from "@/components/intent-link";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cssColor, type ChartColor } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { PageInfo } from "./page-info";

/* ───────────────────────── Page structure ───────────────────────── */

/** A small "← Customers" link above a detail page's title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-0.5 inline-flex min-h-9 items-center gap-1 rounded-control px-1 text-xs font-medium text-muted transition hover:text-ink sm:mb-1 sm:min-h-8 sm:gap-1.5 sm:text-sm print:hidden"
    >
      <ArrowLeft aria-hidden className="size-3.5 sm:size-4" /> {children}
    </Link>
  );
}

/**
 * The top of every page: title, a short description, actions, and optionally a back link
 * (detail pages), `meta` (facts that must always show, like a customer's phone) and `tabs`.
 * On phones the description folds behind an info button so the page's content comes first.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  back,
  tabs,
  inlineActions,
  rowActions,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  tabs?: ReactNode;
  /** Phones: keep one or two compact actions beside the title instead of a row of full-width buttons. */
  inlineActions?: boolean;
  /** Phones: all actions share one row under the title (use short labels and an OverflowMenu). */
  rowActions?: boolean;
}) {
  return (
    <header className="mb-3.5 sm:mb-6">
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className={cn("flex gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6", inlineActions ? "items-start" : "flex-col")}>
        <div className="min-w-0 flex-1 sm:min-w-48">
          <PageInfo title={title} description={description} />
          {meta && <div className="mt-1 text-xs text-muted sm:mt-1.5 sm:text-sm">{meta}</div>}
        </div>
        {actions &&
          (inlineActions ? (
            <div className="flex shrink-0 gap-1.5 sm:max-w-[70%] sm:shrink sm:flex-wrap sm:justify-end sm:gap-2 print:hidden">{actions}</div>
          ) : rowActions ? (
            <div className="flex gap-1.5 *:flex-1 sm:max-w-[70%] sm:flex-wrap sm:justify-end sm:gap-2 sm:*:flex-none print:hidden">{actions}</div>
          ) : (
            // Phones: buttons share the row and wrap two-up instead of squeezing four into one line.
            <div className="flex flex-wrap gap-1.5 *:min-w-[calc(50%-0.1875rem)] *:flex-1 sm:max-w-[70%] sm:justify-end sm:gap-2 sm:*:min-w-0 sm:*:flex-none print:hidden">
              {actions}
            </div>
          ))}
      </div>
      {tabs && <div className="mt-3 sm:mt-5">{tabs}</div>}
    </header>
  );
}

/** A titled group of cards on a page (e.g. "Order settings"), without wrapping them in another card. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5 sm:mt-10", className)}>
      <div className="mb-2.5 flex items-end justify-between gap-2.5 sm:mb-3 sm:gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink sm:text-base">{title}</h2>
          {description && <p className="mt-0.5 max-w-read text-xs text-muted sm:text-sm">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3 sm:space-y-4">{children}</div>
    </section>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("ui-card min-w-0 rounded-card border border-line bg-panel shadow-card print:shadow-none", className)} {...p} />;
}

/** Padding inside a card body; compact on mobile, roomy on desktop. */
export const cardPad = "p-3.5 sm:p-5";

/**
 * Coloured header treatments: a soft tinted band, an accent strip along the card's top edge and a
 * glossy icon tile. Each card on a busy page gets its own colour so it can be found at a glance.
 */
const headerTones = {
  brand: { band: "from-brand-soft/90", strip: "before:bg-brand", tile: "from-[#34d399] via-[#10b981] to-[#059669] shadow-[0_5px_12px_-3px_rgb(16_185_129/0.55)]" },
  violet: { band: "from-accent-bg", strip: "before:bg-accent", tile: "from-[#c084fc] via-[#9333ea] to-[#7e22ce] shadow-[0_5px_12px_-3px_rgb(147_51_234/0.55)]" },
  gold: { band: "from-gold-soft", strip: "before:bg-gold", tile: "from-[#fde047] via-[#f59e0b] to-[#d97706] shadow-[0_5px_12px_-3px_rgb(245_158_11/0.55)]" },
  info: { band: "from-info-bg", strip: "before:bg-info", tile: "from-[#38bdf8] via-[#0ea5e9] to-[#0284c7] shadow-[0_5px_12px_-3px_rgb(14_165_233/0.55)]" },
  rose: { band: "from-danger-bg", strip: "before:bg-danger-solid", tile: "from-[#fb7185] via-[#f43f5e] to-[#e11d48] shadow-[0_5px_12px_-3px_rgb(244_63_94/0.55)]" },
  amber: { band: "from-warning-bg", strip: "before:bg-warning-solid", tile: "from-[#fbbf24] via-[#f59e0b] to-[#d97706] shadow-[0_5px_12px_-3px_rgb(245_158_11/0.55)]" },
};
export type HeaderTone = keyof typeof headerTones;

export function IconCube({
  tone = "brand",
  size = "md",
  children,
  className,
}: {
  tone?: HeaderTone;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}) {
  const t = headerTones[tone] ?? headerTones.brand;
  const dims =
    size === "sm"
      ? "size-7 rounded-[8px] [&>svg]:size-4 sm:size-8 sm:rounded-[10px] sm:[&>svg]:size-[18px]"
      : size === "lg"
        ? "size-9 rounded-[11px] [&>svg]:size-5 sm:size-11 sm:rounded-[13px] sm:[&>svg]:size-6"
        : "size-8 rounded-[9px] [&>svg]:size-[17px] sm:size-9 sm:rounded-[11px] sm:[&>svg]:size-5";
  return (
    <span
      aria-hidden
      className={cn("icon-cube-3d grid shrink-0 place-items-center bg-gradient-to-br text-white ring-1 ring-inset ring-white/40", dims, t.tile, className)}
    >
      {children}
    </span>
  );
}

export function CardHeader({
  title,
  description,
  action,
  as: H = "h2",
  tone,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  /** A coloured header band and accent strip (used on the Overview's 3D cards). */
  tone?: HeaderTone;
  /** An icon in a glossy tile beside the title; shown when `tone` is set. */
  icon?: ReactNode;
}) {
  const t = tone ? headerTones[tone] : null;
  return (
    <div
      className={cn(
        "relative flex flex-wrap items-start justify-between gap-x-2.5 gap-y-1.5 border-b border-line px-3.5 py-2.5 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-4",
        t && ["rounded-t-[inherit] bg-gradient-to-r to-transparent to-75%", t.band, "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-[inherit]", t.strip],
      )}
    >
      <div className="flex min-w-0 flex-1 basis-36 items-start gap-2.5 sm:basis-40 sm:gap-3">
        {t && icon && <IconCube tone={tone} size="md">{icon}</IconCube>}
        {/* flex-1: the title's box doesn't change size when a description streams in later. */}
        <div className="min-w-0 flex-1">
          <H className="text-[0.875rem] font-semibold leading-5 text-ink sm:text-[0.9375rem] sm:leading-6">{title}</H>
          {description && <p className="mt-0.5 text-[11.5px] leading-snug text-muted sm:text-sm sm:leading-relaxed">{description}</p>}
        </div>
      </div>
      {action && <div className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 self-center sm:gap-2">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Buttons ───────────────────────── */

const variants = {
  primary: "bg-brand text-white shadow-xs hover:bg-brand-deep active:bg-brand-deep",
  secondary: "border border-line-2 bg-panel text-ink-2 shadow-xs hover:bg-subtle hover:text-ink active:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken",
  danger: "border border-danger-border bg-panel text-danger shadow-xs hover:bg-danger-bg active:bg-danger-bg",
  dangerSolid: "bg-danger-solid text-white shadow-xs hover:brightness-95 active:brightness-90",
  /** Text-only action inside a sentence or card header. */
  link: "text-brand-deep underline-offset-4 hover:underline",
  /** For the dark sidebar and phone header. */
  onDark: "text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15",
};
export type ButtonVariant = keyof typeof variants;
export type ButtonSize = "sm" | "md";

/**
 * Button styling, also used on links. Compact and balanced on phones while preserving desktop sizes.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", icon = false) {
  return cn(
    "ui-btn relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition active:scale-[0.98] sm:gap-2 [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    icon
      ? size === "sm"
        ? "size-8 sm:size-8"
        : "size-9 sm:size-10"
      : size === "sm"
        ? "h-8 px-2.5 text-xs sm:h-8 sm:px-3 sm:text-[0.8125rem]"
        : "h-9 px-3 text-[0.8125rem] sm:h-10 sm:px-3.5 sm:text-sm",
    variants[variant],
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn("size-4 animate-spin", className)} />;
}

/**
 * The portal's button. `loading` keeps the label in place (so the width doesn't jump),
 * overlays a spinner and blocks further clicks. Icon-only buttons need an aria-label.
 */
export function Button({
  variant,
  size,
  icon,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...p
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(buttonClass(variant, size, icon), className)} {...p}>
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner />
            <span className="sr-only">Working…</span>
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/* ───────────────────────── Forms ───────────────────────── */

export function Label({ children, hint, htmlFor, required }: { children: ReactNode; hint?: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-x-2 text-sm font-medium text-ink">
      <span className="min-w-0">
        {children}
        {required && <span aria-hidden className="ml-0.5 text-danger">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {hint && <span className="shrink-0 text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

/**
 * A labelled form row. Pass one input/select/textarea as the child: it gets the id, and
 * the hint and error are linked to it (aria-describedby, aria-invalid) so they're read out.
 */
export function Field({
  id,
  label,
  hint,
  help,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  /** Short note beside the label, e.g. "optional". */
  hint?: ReactNode;
  /** Longer help under the field. */
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const child = Children.only(children);
  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint} required={required}>
        {label}
      </Label>
      {isValidElement(child)
        ? cloneElement(child, { id, required, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
        : child}
      {help && (
        <p id={`${id}-help`} className="mt-1.5 text-xs text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A checkbox or switch-like toggle with its label beside it, as one big tap target. */
export function CheckRow({
  label,
  description,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-control py-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60", className)}>
      <input type="checkbox" className="check mt-0.5" {...input} />
      <span className="min-w-0">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

/* ───────────────────────── Status ───────────────────────── */

const tones = {
  green: "bg-success-bg text-success ring-success-border",
  blue: "bg-info-bg text-info ring-info-border",
  amber: "bg-warning-bg text-warning ring-warning-border",
  red: "bg-danger-bg text-danger ring-danger-border",
  gray: "bg-neutral-bg text-neutral ring-neutral-border",
  violet: "bg-accent-bg text-accent ring-accent-border",
  brand: "bg-brand-soft text-brand-deep ring-brand/20",
  gold: "bg-gold-soft text-gold-deep ring-gold/40",
};
export type Tone = keyof typeof tones;

/** A short status label. Colour supports the text, never replaces it. */
export function Badge({ tone = "gray", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-px text-xs font-medium leading-5 ring-1 ring-inset", tones[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      <span className="truncate [&>svg]:mr-1 [&>svg]:inline [&>svg]:size-3 [&>svg]:align-[-2px]">{children}</span>
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
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
  WAITING_CONNECTION: { tone: "amber", label: "Paused: connection problem" },
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

/** Order statuses have their own words ("Cancelled", not the campaign run's "Stopped"). */
const ORDER_STATUS: Record<string, { tone: Tone; label: string }> = {
  NEW: { tone: "amber", label: "New" },
  CONFIRMED: { tone: "blue", label: "Confirmed" },
  PAID: { tone: "blue", label: "Paid" },
  DISPATCHED: { tone: "violet", label: "Dispatched" },
  DELIVERED: { tone: "green", label: "Delivered" },
  CANCELLED: { tone: "gray", label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { tone: "gray" as const, label: status.toLowerCase() };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const QUALITY: Record<string, { tone: Tone; label: string }> = {
  GREEN: { tone: "green", label: "Quality: High" },
  YELLOW: { tone: "amber", label: "Quality: Medium" },
  RED: { tone: "red", label: "Quality: Low" },
};

/** Meta's quality rating for a sending number. */
export function QualityBadge({ rating }: { rating: string | null | undefined }) {
  const q = (rating && QUALITY[rating]) || { tone: "gray" as const, label: "Quality: not rated yet" };
  return <Badge tone={q.tone} dot>{q.label}</Badge>;
}

const calloutTones = {
  warning: "border-warning-border bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  info: "border-info-border bg-info-bg text-info",
  success: "border-success-border bg-success-bg text-success",
  neutral: "border-line bg-sunken text-ink-2",
};

/** A tinted notice inside the page: problems to fix, things waiting, setup hints. */
export function Callout({
  tone = "warning",
  title,
  icon,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof calloutTones;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("flex flex-col gap-2.5 rounded-card border px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3.5 sm:text-sm", calloutTones[tone], className)}>
      <div className="flex min-w-0 gap-2 sm:gap-2.5">
        {icon && <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "mt-0.5", "leading-snug sm:leading-normal [&_a]:font-medium [&_a]:underline")}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Lists, tabs, tables ───────────────────────── */

/**
 * Tabs that are links (the choice lives in the URL), with optional counts.
 * Wraps cleanly on mobile and desktop so all filters are visible without horizontal swiping.
 */
export function FilterChips({ label, items, className }: { label: string; items: { href: string; label: string; count?: number | string; active: boolean }[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("w-full", className)}>
      <ul className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition active:scale-[0.97] sm:h-8 sm:gap-1.5 sm:px-3.5 sm:text-[0.8125rem]",
                t.active
                  ? "border-ink bg-ink text-panel shadow-xs"
                  : "border-line-2 bg-panel text-ink-2 shadow-2xs hover:border-line-strong hover:bg-subtle hover:text-ink",
              )}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-px text-2xs font-semibold leading-4",
                    t.active ? "bg-panel/20 text-panel" : "bg-sunken text-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Pick one of a few options in place (a radio group that looks like a switch). Use from client components. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full flex-wrap rounded-control bg-sunken p-0.5 sm:flex-nowrap sm:p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-8 flex-1 whitespace-nowrap rounded-[calc(var(--radius-control)-4px)] px-2.5 text-xs font-medium transition sm:min-h-8 sm:px-3 sm:text-sm",
              on ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-brand-soft text-brand-deep ring-brand/25",
  "bg-accent-bg text-accent ring-accent-border",
  "bg-info-bg text-info ring-info-border",
  "bg-gold-soft text-gold-deep ring-gold/40",
  "bg-warning-bg text-warning ring-warning-border",
  "bg-success-bg text-success ring-success-border",
];

/** A round initial for a person, tinted deterministically by name so lists scan at a glance. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const clean = name.trim();
  const hash = clean.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0];
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : (clean.slice(0, 1).toUpperCase() || "?");
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1 ring-inset sm:size-10", tone, className)}>
      {initials}
    </span>
  );
}

/** Table pieces: sticky header, dense rows, numbers right-aligned and tabular. */
export function Table({ className, children, ...p }: ComponentProps<"table">) {
  return (
    <div className="thin-scroll max-lg:overflow-x-auto">
      <table className={cn("ui-table w-full text-sm", className)} {...p}>
        {children}
      </table>
    </div>
  );
}

export function Th({ numeric, className, ...p }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-subtle px-4 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-muted lg:top-16",
        numeric && "text-right",
        className,
      )}
      {...p}
    />
  );
}

export function Td({ numeric, className, ...p }: ComponentProps<"td"> & { numeric?: boolean }) {
  return <td className={cn("px-4 py-3 align-top", numeric && "tabular text-right", className)} {...p} />;
}

/** Table body rows: dividers and a hover tint. */
export const rowClass = "border-b border-line last:border-0 transition-colors hover:bg-subtle/80";

/** A mobile list row that leads somewhere: the whole row is the link, with press feedback. */
export function ListRow({
  href,
  leading,
  title,
  meta,
  trailing,
  children,
  className,
}: {
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("relative flex items-start gap-2.5 px-3.5 py-2.5 sm:gap-3 sm:px-5 sm:py-3", href && "transition-colors active:bg-sunken has-[a:hover]:bg-subtle", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[0.875rem] font-medium text-ink sm:text-base">
            {href ? (
              <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--color-focus,var(--color-brand-deep))]">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          {trailing && <div className="relative z-[1] flex shrink-0 items-center gap-1.5">{trailing}</div>}
        </div>
        {meta && <div className="mt-0.5 text-[11.5px] leading-snug text-muted sm:text-xs">{meta}</div>}
        {children}
      </div>
    </li>
  );
}

/* ───────────────────────── Empty, loading, KPIs ───────────────────────── */

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-7 text-center sm:px-6 sm:py-14">
      {icon && (
        <div aria-hidden className="pedestal-3d icon-cube-3d mb-3 grid size-11 place-items-center rounded-xl text-white ring-1 ring-inset ring-white/45 [&>svg]:size-5 sm:mb-4 sm:size-14 sm:rounded-2xl sm:[&>svg]:size-7">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink sm:text-[0.9375rem]">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-xs text-muted sm:text-sm">{children}</p>}
      {action && <div className="mt-3.5 sm:mt-5">{action}</div>}
    </div>
  );
}

/** Shown to an admin in "All clients" view on pages that create something for one client. */
export function PickClientNotice({ what }: { what: string }) {
  return (
    <Card className="card-3d">
      <EmptyState title="Pick a client first">Choose a client in the sidebar switcher, then add the {what} for them.</EmptyState>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-control bg-line/60", className)} />;
}

const STAT_TONES: Record<HeaderTone, { color: string; tile: string }> = {
  brand: { color: "#167d63", tile: headerTones.brand.tile },
  violet: { color: "#6941c6", tile: headerTones.violet.tile },
  gold: { color: "#d4a514", tile: headerTones.gold.tile },
  info: { color: "#1d64a8", tile: headerTones.info.tile },
  rose: { color: "#c93636", tile: headerTones.rose.tile },
  amber: { color: "#b7791f", tile: headerTones.amber.tile },
};

/**
 * A 3D KPI tile (Tremor / Origin style): label, the figure, glossy 3D icon cube, top accent bar,
 * optional progress meter, and one line of real context.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  href,
  tone = "brand",
  meter,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  href?: string;
  tone?: HeaderTone;
  meter?: number;
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.brand;
  const surface = { background: `linear-gradient(180deg, ${t.color}12 0%, var(--color-panel) 48%, var(--color-panel-2) 100%)` };
  const body = (
    <>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.color }} />
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide sm:text-xs" style={{ color: t.color }}>
          {label}
        </p>
        {icon && <IconCube tone={tone} size="sm">{icon}</IconCube>}
      </div>
      <div className="tabular mt-1.5 text-lg font-semibold leading-tight tracking-tight text-ink sm:mt-2.5 sm:text-kpi">{value}</div>
      {meter !== undefined && <Meter raised value={meter} tone={tone === "amber" || tone === "rose" ? "warning" : "brand"} className="mt-2 sm:mt-2.5" />}
      {sub && <p className="mt-1 text-[11px] leading-snug text-muted sm:mt-1.5 sm:text-xs">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} style={surface} className="card-3d relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-card border p-3 active:bg-sunken sm:p-4">
      {body}
    </Link>
  ) : (
    <Card style={surface} className="card-3d relative flex h-full flex-col justify-between overflow-hidden p-3 sm:p-4">
      {body}
    </Card>
  );
}

/** A thin progress bar in the chart palette: emerald, or gold for "needs attention". */
export function Meter({ value, tone = "brand", label, className, raised }: { value: number; tone?: "brand" | "warning"; label?: string; className?: string; /** Slightly thicker, for KPI cards. */ raised?: boolean }) {
  return (
    <div
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(value) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={cn("overflow-hidden rounded-full bg-track", raised ? "h-2" : "h-1.5", className)}
    >
      <div className={cn("bar h-full rounded-full", tone === "warning" ? "bg-chart-gold" : "bg-chart-emerald")} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/**
 * Parts of a whole as one rounded bar with a 2px gap between parts, and a legend underneath that
 * names each part with its count and share. Colours are chart palette names (lib/chart-theme).
 */
export function DistributionBar({
  segments,
  className,
}: {
  segments: { key: string; label: string; value: number; color: ChartColor; href?: string }[];
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              title={`${s.label}: ${s.value.toLocaleString("en-IN")} (${Math.round((s.value / total) * 100)}%)`}
              className="bar h-full min-w-1.5 first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: cssColor(s.color) }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {segments.map((s) => {
          const share = Math.round((s.value / total) * 100);
          const content = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: cssColor(s.color) }} />
              <span className="font-medium text-ink-2">{s.label}</span>
              <span className="tabular font-semibold text-ink">{s.value.toLocaleString("en-IN")}</span>
              <span className="tabular text-muted">({share}%)</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className="inline-flex items-center gap-1.5 rounded-control px-1.5 py-0.5 transition hover:bg-sunken">
                  {content}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ORDER_STEPS = [
  { key: "NEW", label: "Placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PAID", label: "Paid" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

/** Visual 5-step order fulfilment tracker bar for OrderCard. */
export function OrderStepper({
  status,
  isPaid,
  unpaidLabel,
}: {
  status: string;
  isPaid: boolean;
  /** Set when the order moved past "Paid" without being paid (e.g. "COD", "Not paid"): that step shows amber with this label. */
  unpaidLabel?: string;
}) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-control border border-danger-border/60 bg-danger-bg/60 px-3 py-1.5 text-xs font-medium text-danger">
        <span aria-hidden className="size-2 rounded-full bg-danger-solid" />
        Order cancelled
      </div>
    );
  }
  const activeIdx =
    status === "DELIVERED"
      ? 4
      : status === "DISPATCHED"
        ? 3
        : status === "PAID"
          ? 2
          : status === "CONFIRMED"
            ? isPaid
              ? 2
              : 1
            : 0;

  return (
    <div aria-label={`Order progress: ${ORDER_STEPS[activeIdx]?.label}`} className="space-y-1">
      <div className="grid grid-cols-5 gap-1" aria-hidden>
        {ORDER_STEPS.map((step, idx) => {
          const done = idx <= activeIdx || (step.key === "PAID" && isPaid);
          const current = idx === activeIdx;
          const owed = unpaidLabel && step.key === "PAID" && !isPaid && idx < activeIdx;
          return (
            <div
              key={step.key}
              className={cn(
                "h-1.5 rounded-full transition-colors",
                owed ? "bg-chart-gold/70" : done ? (current ? "bg-chart-emerald" : "bg-chart-emerald/70") : "bg-track",
              )}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] font-medium text-muted" aria-hidden>
        {ORDER_STEPS.map((step, idx) => {
          const done = idx <= activeIdx || (step.key === "PAID" && isPaid);
          const current = idx === activeIdx;
          const owed = unpaidLabel && step.key === "PAID" && !isPaid && idx < activeIdx;
          return (
            <span key={step.key} className={cn(owed ? "font-semibold text-warning" : current ? "font-semibold text-brand-deep" : done ? "text-ink-2" : "text-muted/70")}>
              {owed ? unpaidLabel : step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

