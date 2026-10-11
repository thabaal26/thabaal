"use client";

/**
 * Compact, chart-first building blocks for the dashboard: donuts, bar lists, stacked rows,
 * before→after dumbbells and small rate rings. Pure SVG/CSS, no chart library, data-only props
 * (so server components can render them), and every figure is also readable as text.
 */

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatValue, type ValueFormat } from "@/lib/chart-math";
import { cn } from "@/lib/cn";

const TRACK = "#eef1f5";

function useDrawn() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return drawn;
}

const share = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/* ───────────────────────── Donut ───────────────────────── */

export type Slice = {
  key: string;
  label: string;
  value: number;
  color: string;
  href?: string;
  /** Second line in the legend, e.g. "₹1,240 in carts". */
  sub?: string;
};

/**
 * A ring split by share. Hovering (or focusing) a slice or its legend row shows that slice in the
 * centre; otherwise the centre shows the total. Zero slices are kept in the legend but not drawn.
 */
export function Donut({
  slices,
  size = 176,
  thickness = 20,
  format = "count",
  centerLabel,
  centerValue,
  active,
  onActive,
  label,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  format?: ValueFormat;
  centerLabel: string;
  /** Overrides the total shown in the centre. */
  centerValue?: string;
  active?: string | null;
  onActive?: (key: string | null) => void;
  label: string;
}) {
  const drawn = useDrawn();
  const total = slices.reduce((n, s) => n + Math.max(0, s.value), 0);
  const drawnSlices = slices.filter((s) => s.value > 0);
  const gap = drawnSlices.length > 1 ? 1.2 : 0;
  const r = 50 - thickness / 2 / (size / 100);
  const sw = thickness / (size / 100);
  const starts = drawnSlices.map((_, i) => drawnSlices.slice(0, i).reduce((n, x) => n + (x.value / total) * 100, 0));
  const hovered = slices.find((s) => s.key === active);
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <circle cx="50" cy="50" r={r} fill="none" stroke={TRACK} strokeWidth={sw} />
        {drawnSlices.map((s, i) => {
          const len = (s.value / total) * 100;
          const dash = Math.max(0.4, len - gap);
          return (
            <circle
              key={s.key}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={active === s.key ? sw + 2.5 : sw}
              pathLength={100}
              strokeDasharray={`${drawn ? dash : 0} 100`}
              strokeDashoffset={-starts[i]}
              opacity={active && active !== s.key ? 0.35 : 1}
              onMouseEnter={() => onActive?.(s.key)}
              onMouseLeave={() => onActive?.(null)}
              className="cursor-pointer transition-[stroke-dasharray,opacity,stroke-width] duration-700 ease-out motion-reduce:transition-none"
            >
              <title>{`${s.label}: ${formatValue(s.value, format)} (${share(s.value, total)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pointer-events-none relative flex max-w-[64%] flex-col items-center text-center">
        <span className="tabular text-xl font-semibold leading-tight text-ink sm:text-2xl">
          {hovered ? formatValue(hovered.value, format) : (centerValue ?? formatValue(total, format))}
        </span>
        <span className="mt-0.5 line-clamp-2 text-2xs font-medium leading-tight text-muted">
          {hovered ? `${hovered.label} · ${share(hovered.value, total)}%` : centerLabel}
        </span>
      </div>
    </div>
  );
}

/** Donut beside (or above, on phones) a legend that names every slice with its count and share. */
export function DonutPanel({
  slices,
  format = "count",
  centerLabel,
  centerValue,
  label,
  size = 176,
  selected,
  onSelect,
  className,
  legendClassName,
}: {
  slices: Slice[];
  format?: ValueFormat;
  centerLabel: string;
  centerValue?: string;
  label: string;
  size?: number;
  /** A persistently selected slice (e.g. the one whose details are open). */
  selected?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
  legendClassName?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((n, s) => n + Math.max(0, s.value), 0);
  const active = hover ?? selected ?? null;
  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6", className)}>
      <Donut slices={slices} format={format} centerLabel={centerLabel} centerValue={centerValue} label={label} size={size} active={active} onActive={setHover} />
      <ul className={cn("w-full min-w-0 flex-1 space-y-0.5 sm:max-w-md", legendClassName)}>
        {slices.map((s) => {
          const inner = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-2">{s.label}</span>
                {s.sub && <span className="block truncate text-2xs text-muted">{s.sub}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-ink">{formatValue(s.value, format)}</span>
              <span className="tabular w-9 shrink-0 text-right text-2xs text-muted">{share(s.value, total)}%</span>
            </>
          );
          const cls = cn(
            "flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition",
            (active === s.key || selected === s.key) && "bg-subtle ring-1 ring-line",
            s.value === 0 && "opacity-55",
            (s.href || onSelect) && "hover:bg-subtle",
          );
          return (
            <li key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              {onSelect ? (
                <button type="button" className={cls} onClick={() => onSelect(s.key)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)} aria-pressed={selected === s.key}>
                  {inner}
                </button>
              ) : s.href ? (
                <Link href={s.href} className={cls} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Rate ring ───────────────────────── */

/** One percentage as a small ring with the figure in the middle and a caption beneath. */
export function RateRing({ value, color, label, sub, size = 84 }: { value: number; color: string; label: string; sub?: string; size?: number }) {
  const drawn = useDrawn();
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div role="img" aria-label={`${label}: ${Math.round(v)}%`} className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke={TRACK} strokeWidth="10" />
          {v > 0 && (
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${drawn ? Math.max(1, v) : 0} 100`}
              className="transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none"
            />
          )}
        </svg>
        <span className="tabular relative text-base font-semibold text-ink">{Math.round(v)}%</span>
      </div>
      <span className="mt-1.5 text-xs font-medium leading-tight text-ink-2">{label}</span>
      {sub && <span className="text-2xs leading-tight text-muted">{sub}</span>}
    </div>
  );
}

/* ───────────────────────── Bar list ───────────────────────── */

export type BarItem = {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
  /** Small grey text under the label. */
  sub?: string;
  /** Text shown instead of the formatted value. */
  display?: string;
};

/** Ranked horizontal bars: label and figure on one line, the bar under them. */
export function BarList({
  items,
  format = "count",
  color = "#167d63",
  max,
  empty = "Nothing to show yet.",
  className,
}: {
  items: BarItem[];
  format?: ValueFormat;
  color?: string;
  max?: number;
  empty?: string;
  className?: string;
}) {
  const drawn = useDrawn();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-3 text-sm text-muted">{empty}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((it) => {
        const w = top > 0 ? Math.max(it.value > 0 ? 3 : 0, (it.value / top) * 100) : 0;
        const head = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink-2 group-hover:text-ink group-hover:underline">{it.label}</span>
              <span className="tabular shrink-0 font-semibold text-ink">{it.display ?? formatValue(it.value, format)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${drawn ? w : 0}%`, background: it.color ?? color }}
              />
            </div>
            {it.sub && <p className="mt-0.5 truncate text-2xs text-muted">{it.sub}</p>}
          </>
        );
        return (
          <li key={it.key}>
            {it.href ? (
              <Link href={it.href} className="group block rounded-control">
                {head}
              </Link>
            ) : (
              <div>{head}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── Stacked rows ───────────────────────── */

export type StackPart = { key: string; label: string; value: number; color: string };
export type StackRow = { key: string; label: string; href?: string; right?: string; parts: StackPart[]; dot?: string };

/** One stacked bar per row on a shared scale (e.g. sold / in cart / dropped per product). */
export function StackedRows({
  rows,
  format = "count",
  legend,
  className,
  onRowClick,
  activeKey,
}: {
  rows: StackRow[];
  format?: ValueFormat;
  legend?: { label: string; color: string }[];
  className?: string;
  onRowClick?: (key: string) => void;
  activeKey?: string | null;
}) {
  const drawn = useDrawn();
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
  return (
    <div className={className}>
      {legend && <Legend items={legend} className="mb-3" />}
      <ul className="space-y-2">
        {rows.map((r) => {
          const sum = r.parts.reduce((n, p) => n + p.value, 0);
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  {r.dot && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.dot }} />}
                  <span className="truncate text-ink-2 group-hover:text-ink group-hover:underline">{r.label}</span>
                </span>
                <span className="tabular shrink-0 text-xs font-semibold text-ink">{r.right ?? formatValue(sum, format)}</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
                {r.parts
                  .filter((p) => p.value > 0)
                  .map((p) => (
                    <div
                      key={p.key}
                      title={`${p.label}: ${formatValue(p.value, format)}`}
                      className="h-full border-r-2 border-panel transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full last:border-r-0 motion-reduce:transition-none"
                      style={{ width: `${drawn ? Math.max(2, (p.value / max) * 100) : 0}%`, background: p.color }}
                    />
                  ))}
              </div>
            </>
          );
          const cls = cn("group block w-full rounded-control px-1.5 py-1 text-left transition hover:bg-subtle", activeKey === r.key && "bg-subtle ring-1 ring-line");
          return (
            <li key={r.key}>
              {onRowClick ? (
                <button type="button" className={cls} onClick={() => onRowClick(r.key)} aria-expanded={activeKey === r.key}>
                  {body}
                </button>
              ) : r.href ? (
                <Link href={r.href} className={cls}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Before → after ───────────────────────── */

export type ChangeRow = { key: string; label: string; href?: string; from: number; to: number; tag?: string; tagTone?: "good" | "bad" | "neutral" };

/**
 * Dumbbells on one scale: a grey dot for the first value, a coloured dot for the latest, joined by
 * a line. Red when it fell, green when it rose. Used for "first cart → latest cart".
 */
export function ChangeDumbbells({ rows, format = "inr", fromLabel, toLabel }: { rows: ChangeRow[]; format?: ValueFormat; fromLabel: string; toLabel: string }) {
  const drawn = useDrawn();
  const max = Math.max(1, ...rows.flatMap((r) => [r.from, r.to]));
  const x = (v: number) => (v / max) * 100;
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: fromLabel, color: "#98a2b3" },
          { label: `${toLabel} (lower)`, color: "#e11d48" },
          { label: `${toLabel} (higher)`, color: "#059669" },
        ]}
      />
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const down = r.to < r.from;
          const c = r.to === r.from ? "#0ea5e9" : down ? "#e11d48" : "#059669";
          const lo = Math.min(x(r.from), x(r.to));
          const hi = Math.max(x(r.from), x(r.to));
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-ink-2 group-hover:text-ink group-hover:underline">{r.label}</span>
                  {r.tag && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-px text-2xs font-semibold",
                        r.tagTone === "good" ? "bg-success-bg text-success" : r.tagTone === "bad" ? "bg-warning-bg text-warning" : "bg-subtle text-muted",
                      )}
                    >
                      {r.tag}
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 text-xs text-muted">
                  {formatValue(r.from, format)} → <b className="font-semibold text-ink">{formatValue(r.to, format)}</b>
                </span>
              </div>
              <div className="relative mt-1.5 h-3">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: TRACK }} />
                <div
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-all duration-700 ease-out motion-reduce:transition-none"
                  style={{ left: `${drawn ? lo : x(r.from)}%`, width: `${drawn ? hi - lo : 0}%`, background: c, opacity: 0.45 }}
                />
                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-[#98a2b3]" style={{ left: `${x(r.from)}%` }} />
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel shadow-sm transition-all duration-700 ease-out motion-reduce:transition-none"
                  style={{ left: `${drawn ? x(r.to) : x(r.from)}%`, background: c }}
                />
              </div>
            </>
          );
          return <li key={r.key}>{r.href ? <Link href={r.href} className="group block">{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Small pieces ───────────────────────── */

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** A figure with a label: the compact replacement for sentence-style stat lines. */
export function StatChip({ label, value, tone = "ink", hint }: { label: string; value: ReactNode; tone?: "ink" | "good" | "bad" | "warn"; hint?: string }) {
  const color = { ink: "text-ink", good: "text-success", bad: "text-danger", warn: "text-warning" }[tone];
  return (
    <div className="min-w-0 rounded-control border border-line bg-panel px-3 py-2" title={hint}>
      <p className="truncate text-2xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("tabular mt-0.5 truncate text-base font-semibold leading-tight", color)}>{value}</p>
    </div>
  );
}

/** Collapsed detail: the chart stays in view, the names and explanations open on demand. */
export function Disclosure({ summary, children, className, defaultOpen }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cn("group/d border-t border-line", className)} open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-subtle sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition group-open/d:rotate-180" />
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

/** One recommended move: short, one line, with a link to do it. */
export function ActionLine({ children, href, cta }: { children: ReactNode; href: string; cta: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-brand/20 bg-brand-soft/40 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 text-ink-2">{children}</p>
      <Link href={href} className="shrink-0 font-semibold text-brand-deep hover:underline">
        {cta} →
      </Link>
    </div>
  );
}

/* ───────────────────────── Columns ───────────────────────── */

export type Column = { key: string; label: string; sub?: string; parts: StackPart[]; highlight?: boolean };

/**
 * Vertical stacked columns on one scale (e.g. revenue per day split by how it was paid). Each
 * column shows its total above it and names every part in its tooltip; scrolls sideways on phones.
 */
export function ColumnChart({
  columns,
  format = "count",
  legend,
  height = 160,
  minWidth = 560,
  label,
}: {
  columns: Column[];
  format?: ValueFormat;
  legend?: { label: string; color: string }[];
  height?: number;
  minWidth?: number;
  label: string;
}) {
  const drawn = useDrawn();
  const sums = columns.map((c) => c.parts.reduce((n, p) => n + p.value, 0));
  const max = Math.max(1, ...sums);
  const showTotals = columns.length <= 16;
  return (
    <div>
      {legend && <Legend items={legend} className="mb-3" />}
      <div className="thin-scroll -mx-1 overflow-x-auto px-1 pb-1">
        <div role="img" aria-label={label} className="flex items-end gap-1" style={{ minWidth, height: height + 40 }}>
          {columns.map((c, i) => {
            const sum = sums[i];
            const tip = [`${c.label}${c.sub ? ` ${c.sub}` : ""}: ${formatValue(sum, format)}`, ...c.parts.filter((p) => p.value > 0).map((p) => `${p.label}: ${formatValue(p.value, format)}`)].join("\n");
            return (
              <div key={c.key} title={tip} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                {showTotals && <span className="tabular mb-1 truncate text-[10px] font-semibold text-ink-2">{sum ? formatValue(sum, format) : ""}</span>}
                <div className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t-[4px] transition group-hover:brightness-95" style={{ height: drawn ? Math.max(sum ? 3 : 2, (sum / max) * height) : 2 }}>
                  {sum === 0 ? (
                    <span className="h-full w-full" style={{ background: TRACK }} />
                  ) : (
                    c.parts
                      .filter((p) => p.value > 0)
                      .map((p) => <span key={p.key} className="block w-full border-t border-panel first:border-t-0" style={{ height: `${(p.value / sum) * 100}%`, background: p.color }} />)
                  )}
                </div>
                <span className={cn("mt-1.5 truncate text-[10px] leading-tight", c.highlight ? "font-semibold text-ink" : "text-muted")}>{c.label}</span>
                {c.sub && <span className="truncate text-[9px] leading-tight text-muted">{c.sub}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
