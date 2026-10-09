import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageInfo } from "./page-info";

/* ───────────────────────── Page structure ───────────────────────── */

/** A small "← Customers" link above a detail page's title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-muted transition hover:text-ink sm:min-h-8 print:hidden"
    >
      <ArrowLeft aria-hidden className="size-4" /> {children}
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
    <header className="mb-4 sm:mb-6">
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className={cn("flex gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6", inlineActions ? "items-start" : "flex-col")}>
        <div className="min-w-0 flex-1 sm:min-w-48">
          <PageInfo title={title} description={description} />
          {meta && <div className="mt-1 text-sm text-muted">{meta}</div>}
        </div>
        {actions &&
          (inlineActions ? (
            <div className="flex shrink-0 gap-2 sm:max-w-[70%] sm:shrink sm:flex-wrap sm:justify-end print:hidden">{actions}</div>
          ) : rowActions ? (
            <div className="flex gap-2 *:flex-1 sm:max-w-[70%] sm:flex-wrap sm:justify-end sm:*:flex-none print:hidden">{actions}</div>
          ) : (
            // Phones: buttons share the row and wrap two-up instead of squeezing four into one line.
            <div className="flex flex-wrap gap-2 *:min-w-[calc(50%-0.25rem)] *:flex-1 sm:max-w-[70%] sm:justify-end sm:*:min-w-0 sm:*:flex-none print:hidden">
              {actions}
            </div>
          ))}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
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
    <section className={cn("mt-8 sm:mt-10", className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 max-w-read text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-card border border-line bg-panel shadow-card print:shadow-none", className)} {...p} />;
}

/** Padding inside a card body; the same everywhere. */
export const cardPad = "p-4 sm:p-5";

export function CardHeader({
  title,
  description,
  action,
  as: H = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-3.5">
      <div className="min-w-0 flex-1 basis-40">
        <H className="text-sm font-semibold leading-6 text-ink sm:text-base">{title}</H>
        {description && <p className="mt-0.5 text-xs text-muted sm:text-sm">{description}</p>}
      </div>
      {action && <div className="flex min-w-0 max-w-full shrink-0 items-center gap-2 self-center">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Buttons ───────────────────────── */

const variants = {
  primary: "bg-brand text-white hover:bg-brand-deep active:bg-brand-deep",
  secondary: "border border-line-strong/60 bg-panel text-ink hover:border-line-strong hover:bg-canvas active:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken",
  danger: "border border-danger-border bg-panel text-danger hover:bg-danger-bg active:bg-danger-bg",
  dangerSolid: "bg-danger-solid text-white hover:brightness-95 active:brightness-90",
  /** For the dark sidebar and phone header. */
  onDark: "text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15",
};
export type ButtonVariant = keyof typeof variants;
export type ButtonSize = "sm" | "md";

/**
 * Button styling, also used on links. Phones and touch screens get 44px targets; computers
 * with a mouse get the denser desktop sizes.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", icon = false) {
  return cn(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    icon
      ? size === "sm"
        ? "size-11 sm:size-8 sm:pointer-coarse:size-11"
        : "size-11 sm:size-10 sm:pointer-coarse:size-11"
      : size === "sm"
        ? "h-11 px-3.5 text-md sm:h-8 sm:px-3 sm:text-xs sm:pointer-coarse:h-11 sm:pointer-coarse:text-sm"
        : "h-11 px-4 text-md sm:h-10 sm:text-sm sm:pointer-coarse:h-11",
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
    <label htmlFor={htmlFor} className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-medium text-ink-2">
      <span>
        {children}
        {required && <span aria-hidden className="ml-0.5 text-danger">*</span>}
      </span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
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
  brand: "bg-brand-soft text-brand-deep ring-brand/25",
};
export type Tone = keyof typeof tones;

/** A short status label. Colour supports the text, never replaces it. */
export function Badge({ tone = "gray", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      <span className="truncate">{children}</span>
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
    <div role={role} className={cn("flex flex-col gap-3 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", calloutTones[tone], className)}>
      <div className="flex min-w-0 gap-2.5">
        {icon && <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "mt-0.5", "[&_a]:font-medium [&_a]:underline")}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Lists, tabs, tables ───────────────────────── */

/**
 * Tabs that are links (the choice lives in the URL), with optional counts. Scrolls sideways
 * on phones instead of wrapping onto a second line.
 */
export function FilterChips({ label, items }: { label: string; items: { href: string; label: string; count?: number | string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.97] sm:h-8 sm:px-3 sm:pointer-coarse:h-11",
                t.active ? "border-ink bg-ink text-white" : "border-line-strong/50 bg-panel text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className={cn("tabular text-xs", t.active ? "text-white/75" : "text-muted")}>{t.count}</span>}
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
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full rounded-control bg-sunken p-1", className)}>
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
              "min-h-11 flex-1 whitespace-nowrap rounded-[calc(var(--radius-control)-4px)] px-4 text-sm font-medium transition sm:min-h-8 sm:px-3 sm:pointer-coarse:min-h-11",
              on ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A round initial for a person. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep", className)}>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** Table pieces: sticky header, dense rows, numbers right-aligned and tabular. */
export function Table({ className, children, ...p }: ComponentProps<"table">) {
  return (
    <div className="max-lg:overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...p}>
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
        "sticky top-0 z-[1] border-b border-line bg-panel px-4 py-2.5 text-left text-xs font-medium text-muted lg:top-0",
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
export const rowClass = "border-b border-line last:border-0 transition-colors hover:bg-canvas/70";

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
    <li className={cn("relative flex items-start gap-3 px-4 py-3 sm:px-5", href && "transition-colors active:bg-sunken has-[a:hover]:bg-canvas/70", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-medium text-ink">
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
        {meta && <div className="mt-0.5 text-xs text-muted">{meta}</div>}
        {children}
      </div>
    </li>
  );
}

/* ───────────────────────── Empty, loading, KPIs ───────────────────────── */

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
      {icon && <div aria-hidden className="mb-3 grid size-11 place-items-center rounded-card bg-brand-soft text-brand-deep">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Shown to an admin in "All clients" view on pages that create something for one client. */
export function PickClientNotice({ what }: { what: string }) {
  return (
    <Card>
      <EmptyState title="Pick a client first">Choose a client in the sidebar switcher, then add the {what} for them.</EmptyState>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-control bg-line/70", className)} />;
}

export function Stat({ label, value, sub, icon, href }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
        {icon && <span aria-hidden className="hidden size-8 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-deep sm:grid">{icon}</span>}
      </div>
      <p className="tabular mt-1 text-2xl font-semibold leading-tight tracking-tight text-ink sm:mt-2 sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="lift block min-w-0 rounded-card border border-line bg-panel p-3.5 shadow-card active:bg-sunken sm:p-5">
      {body}
    </Link>
  ) : (
    <Card className="p-3.5 sm:p-5">{body}</Card>
  );
}

/** A thin progress or share bar. */
export function Meter({ value, tone = "brand", label, className }: { value: number; tone?: "brand" | "warning"; label?: string; className?: string }) {
  return (
    <div
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(value) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={cn("h-2 overflow-hidden rounded-full bg-sunken", className)}
    >
      <div className={cn("bar h-full rounded-full", tone === "warning" ? "bg-warning-solid" : "bg-brand")} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
