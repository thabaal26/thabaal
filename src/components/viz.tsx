"use client";

/**
 * The portal's chart kit. Every chart is Apache ECharts (components/echart.tsx) in one shared look:
 * the validated palette (lib/chart-theme.ts), 4px rounded data ends, hairline grids, the same dark
 * tooltip and the same grow-in motion. Props are data only, so server pages can render them, and
 * every figure is also in the HTML (legends, lists or a screen-reader list).
 *
 *  - Columns (ColumnChart): change over time.            - Bars (BarList, StackedRows): ranking.
 *  - Donut (Donut, DonutPanel): parts of a whole.        - Rings (ProgressRings): one rate each.
 *  - Dumbbells (ChangeDumbbells): before → after.
 */

import type { ECharts } from "echarts/core";
import { ChevronDown } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EChart, type ChartEvent } from "@/components/echart";
import { formatCompact, formatValue, type ValueFormat } from "@/lib/chart-math";
import { alpha, cssColor, motion, tipHTML, tooltipBase, type ChartColor, type ChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";

export type { ChartColor } from "@/lib/chart-theme";

const share = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/** Data-only props, frozen by value so a chart redraws only when its figures change. */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  // Keyed on the serialised value on purpose.
  return useMemo(() => JSON.parse(key) as T, [key]);
}

/* ───────────────────────── Donut ───────────────────────── */

export type Slice = {
  key: string;
  label: string;
  value: number;
  color: ChartColor;
  href?: string;
  /** Second line in the legend, e.g. "₹1,240 in carts". */
  sub?: string;
};

/**
 * A ring split by share, with a 2px gap between slices. Hovering a slice (or its legend row) shows
 * it in the centre; otherwise the centre shows the total. Zero slices stay in the legend only.
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
  const data = useStable(slices);
  const chart = useRef<ECharts | null>(null);
  const total = data.reduce((n, s) => n + Math.max(0, s.value), 0);
  const drawn = useMemo(() => data.filter((s) => s.value > 0), [data]);
  const hovered = data.find((s) => s.key === active);

  const option = useCallback(
    (t: ChartTheme) => {
      const outer = 94;
      const inner = Math.max(30, outer - (thickness * 2 * 100) / size);
      return {
        ...motion(t, 60),
        tooltip: {
          ...tooltipBase(t),
          trigger: "item",
          formatter: (p: { dataIndex: number }) => {
            const s = drawn[p.dataIndex];
            return s ? tipHTML(s.label, [{ color: t.color(s.color), label: `${share(s.value, total)}% of ${formatValue(total, format)}`, value: formatValue(s.value, format) }], s.sub) : "";
          },
        },
        series: [
          {
            type: "pie",
            radius: [`${inner}%`, `${outer}%`],
            center: ["50%", "50%"],
            startAngle: 90,
            avoidLabelOverlap: false,
            silent: !drawn.length,
            label: { show: false },
            labelLine: { show: false },
            cursor: drawn.some((s) => s.href) ? "pointer" : "default",
            itemStyle: { borderColor: t.surface, borderWidth: drawn.length > 1 ? 2 : 0, borderRadius: 5 },
            emphasis: { scale: true, scaleSize: 5, focus: "self", itemStyle: { shadowBlur: 0 } },
            blur: { itemStyle: { opacity: 0.32 } },
            data: drawn.length
              ? drawn.map((s) => ({ name: s.key, value: s.value, itemStyle: { color: t.color(s.color) } }))
              : [{ name: "empty", value: 1, itemStyle: { color: t.track }, tooltip: { show: false } }],
          },
        ],
      };
    },
    [drawn, total, format, size, thickness],
  );

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const i = drawn.findIndex((s) => s.key === active);
    if (i >= 0) c.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: i });
  }, [active, drawn]);

  const router = useRouter();
  const onEvent = (type: string, e: ChartEvent) => {
    const s = e.dataIndex !== undefined ? drawn[e.dataIndex] : undefined;
    if (type === "mouseover" && s) onActive?.(s.key);
    if ((type === "mouseout" || type === "globalout") && onActive) onActive(null);
    if (type === "click" && s?.href) router.push(s.href);
  };

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <EChart option={option} height={size} label={label} onEvent={onEvent} onReady={(c) => (chart.current = c)} className="!absolute inset-0 !rounded-full" />
      <div className="pointer-events-none relative flex max-w-[60%] flex-col items-center text-center">
        <span className="tabular text-xl font-semibold leading-tight tracking-tight text-ink sm:text-2xl">
          {hovered ? formatValue(hovered.value, format) : (centerValue ?? formatValue(total, format))}
        </span>
        <span className="mt-0.5 line-clamp-2 text-2xs font-medium leading-tight text-muted">{hovered ? `${hovered.label} · ${share(hovered.value, total)}%` : centerLabel}</span>
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
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: cssColor(s.color) }} />
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

/* ───────────────────────── Progress rings ───────────────────────── */

export type ProgressRing = {
  key: string;
  label: string;
  /** Percent, 0–100 (more draws a full ring). */
  value: number;
  color: ChartColor;
  /** Replaces "62%" in the middle, e.g. "38". */
  display?: string;
  sub?: string;
};

function Ring({ ring, size, index }: { ring: ProgressRing; size: number; index: number }) {
  const r = useStable(ring);
  const option = useCallback(
    (t: ChartTheme) => {
      const c = t.color(r.color);
      const width = Math.max(7, Math.round(size / 11));
      return {
        ...(t.animate ? { animation: true, animationDuration: 900, animationEasing: "cubicOut" as const, animationDelay: index * 90 } : { animation: false }),
        series: [
          {
            type: "gauge",
            // A 348° sweep: the small gap at the top, where every ring starts, is the portal's ring.
            startAngle: 84,
            endAngle: -264,
            min: 0,
            max: 100,
            radius: "92%",
            silent: true,
            pointer: { show: false },
            progress: { show: r.value > 0, width, roundCap: true, itemStyle: { color: c } },
            axisLine: { roundCap: true, lineStyle: { width, color: [[1, alpha(c, t.dark ? 0.22 : 0.14)]] } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            title: { show: false },
            detail: { show: false },
            anchor: { show: false },
            data: [{ value: Math.max(0, Math.min(100, r.value)) }],
          },
        ],
      };
    },
    [r, size, index],
  );
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <EChart option={option} height={size} label={`${r.label}: ${r.display ?? `${Math.round(r.value)}%`}`} className="!absolute inset-0 !rounded-full" />
        <span className="tabular relative text-lg font-semibold leading-none tracking-tight text-ink">{r.display ?? `${Math.round(r.value)}%`}</span>
      </div>
      <span className="mt-2 flex items-center gap-1.5 text-xs font-medium leading-tight text-ink-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: cssColor(r.color) }} />
        {r.label}
      </span>
      {r.sub && <span className="mt-0.5 text-2xs leading-tight text-muted">{r.sub}</span>}
    </div>
  );
}

/**
 * Rates as a row of rings, one per rate, each starting from a small gap at the top with its figure
 * in the middle and its name beneath.
 */
export function ProgressRings({ rings, label, title, size = 96, className }: { rings: ProgressRing[]; label: string; title?: string; size?: number; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("min-w-0", className)}>
      {title && <p className="mb-3 text-sm font-semibold text-ink">{title}</p>}
      <div className="flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
        {rings.map((r, i) => (
          <Ring key={r.key} ring={r} size={size} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Row charts (bars, stacks, dumbbells) ───────────────────────── */

const ROW = { top: 22, bottom: 6 };
const BAR = 8;

/** The label above each bar and the figure at its right end, drawn on a full-width invisible bar. */
/** The whole row (track included) answers hover and click, so the target is bigger than the bar. */
function rowLabels(t: ChartTheme, width: number, rows: { name: string; dot?: string; right: string; tag?: string }[], max: number, clickable = false) {
  const nameW = Math.max(80, width * 0.6);
  return [
    {
      type: "bar",
      barWidth: BAR,
      barGap: "-100%",
      z: 1,
      cursor: clickable ? "pointer" : "default",
      emphasis: { disabled: true },
      itemStyle: { color: t.track, borderRadius: 4 },
      data: rows.map((r) => ({
        value: max,
        label: {
          show: true,
          position: [0, -17],
          align: "left",
          width: nameW,
          overflow: "truncate",
          formatter: `${r.dot ? "{d|●} " : ""}{n|${r.name.replace(/[{}|]/g, "")}}${r.tag ? `   {t|${r.tag.replace(/[{}|]/g, "")}}` : ""}`,
          rich: {
            n: { color: t.ink2, fontSize: 13, fontFamily: t.font },
            t: { color: t.muted, fontSize: 11, fontFamily: t.font },
            d: { color: r.dot ?? t.muted, fontSize: 10 },
          },
        },
      })),
      animation: false,
    },
    {
      type: "bar",
      silent: true,
      barWidth: BAR,
      barGap: "-100%",
      z: 1,
      itemStyle: { color: "transparent" },
      data: rows.map((r) => ({
        value: max,
        label: { show: true, position: ["100%", -17], align: "right", color: t.ink, fontWeight: 600, fontSize: 12.5, fontFamily: t.font, formatter: r.right.replace(/[{}|]/g, "") },
      })),
      animation: false,
    },
  ];
}

function rowGrid(n: number, sub = 0) {
  return { height: ROW.top + n * (34 + sub) + ROW.bottom, grid: { left: 0, right: 0, top: ROW.top, bottom: ROW.bottom + sub } };
}

export type BarItem = {
  key: string;
  label: string;
  value: number;
  color?: ChartColor;
  href?: string;
  /** Small grey text under the bar. */
  sub?: string;
  /** Text shown instead of the formatted value. */
  display?: string;
};

/** Ranked horizontal bars: name above, figure at the right, a slim rounded bar on a track. */
export function BarList({
  items,
  format = "count",
  color = "emerald",
  max,
  empty = "Nothing to show yet.",
  className,
  label,
}: {
  items: BarItem[];
  format?: ValueFormat;
  color?: ChartColor;
  max?: number;
  empty?: string;
  className?: string;
  label?: string;
}) {
  const data = useStable(items);
  const router = useRouter();
  const hasSub = data.some((i) => i.sub);
  const top = max ?? Math.max(1, ...data.map((i) => i.value));
  const { height, grid } = rowGrid(data.length, hasSub ? 18 : 0);
  const option = useCallback(
    (t: ChartTheme, size: { width: number }) => ({
      ...motion(t, 45),
      grid: { ...grid, top: ROW.top },
      xAxis: { type: "value", max: top, show: false },
      yAxis: { type: "category", inverse: true, show: false, data: data.map((d) => d.key) },
      tooltip: {
        ...tooltipBase(t),
        trigger: "item",
        formatter: (p: { dataIndex: number }) => {
          const d = data[p.dataIndex];
          return d ? tipHTML(d.label, [{ color: t.color(d.color ?? color), label: "Value", value: d.display ?? formatValue(d.value, format) }], d.sub) : "";
        },
      },
      series: [
        ...rowLabels(t, size.width, data.map((d) => ({ name: d.label, right: d.display ?? formatValue(d.value, format) })), top, data.some((d) => d.href)),
        {
          type: "bar",
          barWidth: BAR,
          barGap: "-100%",
          z: 2,
          cursor: data.some((d) => d.href) ? "pointer" : "default",
          data: data.map((d) => ({
            value: d.value > 0 ? Math.max(d.value, top * 0.012) : 0,
            itemStyle: { color: t.color(d.color ?? color), borderRadius: 4 },
            label: d.sub
              ? { show: true, position: [0, 13], align: "left", color: t.muted, fontSize: 11, fontFamily: t.font, width: size.width, overflow: "truncate", formatter: d.sub.replace(/[{}|]/g, "") }
              : { show: false },
          })),
        },
      ],
    }),
    [data, top, format, color, grid],
  );
  if (!data.length) return <p className="py-3 text-sm text-muted">{empty}</p>;
  return (
    <div className={className}>
      <EChart
        option={option}
        height={height}
        label={label ?? data.map((d) => `${d.label}: ${d.display ?? formatValue(d.value, format)}`).join("; ")}
        onEvent={(type, e) => {
          const d = e.dataIndex !== undefined ? data[e.dataIndex] : undefined;
          if (type === "click" && d?.href) router.push(d.href);
        }}
      />
      {data.some((d) => d.href) && (
        <ul className="sr-only">
          {data.map((d) => d.href && (
            <li key={d.key}>
              <Link href={d.href}>
                {d.label}: {d.display ?? formatValue(d.value, format)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type StackPart = { key: string; label: string; value: number; color: ChartColor };
export type StackRow = { key: string; label: string; href?: string; right?: string; parts: StackPart[]; dot?: ChartColor };

/** One stacked bar per row on a shared scale (e.g. sold / in cart / dropped per product). */
export function StackedRows({
  rows,
  format = "count",
  legend,
  className,
  onRowClick,
  activeKey,
  label,
}: {
  rows: StackRow[];
  format?: ValueFormat;
  legend?: { label: string; color: ChartColor }[];
  className?: string;
  onRowClick?: (key: string) => void;
  activeKey?: string | null;
  label?: string;
}) {
  const data = useStable(rows);
  const router = useRouter();
  const max = Math.max(1, ...data.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
  const partKeys = useMemo(() => {
    const seen: StackPart[] = [];
    for (const r of data) for (const p of r.parts) if (!seen.some((s) => s.key === p.key)) seen.push(p);
    return seen;
  }, [data]);
  const { height, grid } = rowGrid(data.length);
  const option = useCallback(
    (t: ChartTheme, size: { width: number }) => ({
      ...motion(t, 45),
      grid,
      xAxis: { type: "value", max, show: false },
      yAxis: { type: "category", inverse: true, show: false, data: data.map((d) => d.key) },
      tooltip: {
        ...tooltipBase(t),
        trigger: "item",
        formatter: (p: { dataIndex: number }) => {
          const r = data[p.dataIndex];
          if (!r) return "";
          const sum = r.parts.reduce((n, x) => n + x.value, 0);
          return tipHTML(r.label, [...r.parts.map((x) => ({ color: t.color(x.color), label: x.label, value: formatValue(x.value, format) })), { label: "Total", value: formatValue(sum, format) }]);
        },
      },
      series: [
        ...rowLabels(t, size.width, data.map((r) => ({ name: r.label, dot: r.dot ? t.color(r.dot) : undefined, right: r.right ?? formatValue(r.parts.reduce((n, p) => n + p.value, 0), format) })), max, Boolean(onRowClick) || data.some((d) => d.href)),
        ...partKeys.map((pk) => ({
          type: "bar",
          stack: "parts",
          barWidth: BAR + 2,
          z: 2,
          name: pk.label,
          cursor: onRowClick || data.some((d) => d.href) ? "pointer" : "default",
          data: data.map((r) => {
            const live = r.parts.filter((p) => p.value > 0);
            const part = r.parts.find((p) => p.key === pk.key);
            const v = part?.value ?? 0;
            const first = live[0]?.key === pk.key;
            const last = live[live.length - 1]?.key === pk.key;
            const dim = activeKey && activeKey !== r.key;
            return {
              value: v > 0 ? Math.max(v, max * 0.012) : 0,
              itemStyle: {
                color: t.color(part?.color ?? pk.color),
                opacity: dim ? 0.35 : 1,
                borderColor: t.surface,
                borderWidth: 1,
                borderRadius: [first ? 5 : 0, last ? 5 : 0, last ? 5 : 0, first ? 5 : 0],
              },
            };
          }),
        })),
      ],
    }),
    [data, max, partKeys, format, grid, activeKey, onRowClick],
  );
  return (
    <div className={className}>
      {legend && <Legend items={legend} className="mb-3" />}
      <EChart
        option={option}
        height={height}
        label={label ?? data.map((r) => `${r.label}: ${r.parts.map((p) => `${p.label} ${formatValue(p.value, format)}`).join(", ")}`).join("; ")}
        onEvent={(type, e) => {
          const r = e.dataIndex !== undefined ? data[e.dataIndex] : undefined;
          if (type !== "click" || !r) return;
          if (onRowClick) onRowClick(r.key);
          else if (r.href) router.push(r.href);
        }}
      />
      {(onRowClick || data.some((r) => r.href)) && (
        <ul className="sr-only">
          {data.map((r) => (
            <li key={r.key}>
              {onRowClick ? (
                <button type="button" onClick={() => onRowClick(r.key)} aria-expanded={activeKey === r.key}>
                  {r.label}
                </button>
              ) : r.href ? (
                <Link href={r.href}>{r.label}</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type ChangeRow = { key: string; label: string; href?: string; from: number; to: number; tag?: string; tagTone?: "good" | "bad" | "neutral" };

/**
 * Dumbbells on one scale: a grey dot for the first value, a coloured dot for the latest, joined by
 * a bar. Red when it fell, emerald when it rose, blue when unchanged.
 */
export function ChangeDumbbells({ rows, format = "inr", fromLabel, toLabel }: { rows: ChangeRow[]; format?: ValueFormat; fromLabel: string; toLabel: string }) {
  const data = useStable(rows);
  const router = useRouter();
  const max = Math.max(1, ...data.flatMap((r) => [r.from, r.to]));
  const { height, grid } = rowGrid(data.length);
  const tone = (r: ChangeRow) => (r.to === r.from ? "blue" : r.to < r.from ? "red" : "emerald");
  const option = useCallback(
    (t: ChartTheme, size: { width: number }) => ({
      ...motion(t, 45),
      grid,
      xAxis: { type: "value", max, show: false },
      yAxis: { type: "category", inverse: true, show: false, data: data.map((d) => d.key) },
      tooltip: {
        ...tooltipBase(t),
        trigger: "item",
        formatter: (p: { dataIndex: number }) => {
          const r = data[p.dataIndex];
          return r
            ? tipHTML(r.label, [
                { color: t.color("neutral"), label: fromLabel, value: formatValue(r.from, format) },
                { color: t.color(tone(r)), label: toLabel, value: formatValue(r.to, format) },
              ], r.tag)
            : "";
        },
      },
      series: [
        ...rowLabels(t, size.width, data.map((r) => ({ name: r.label, tag: r.tag, right: `${formatValue(r.from, format)} → ${formatValue(r.to, format)}` })), max, data.some((d) => d.href)).map((s, i) => (i === 0 ? { ...s, barWidth: 4, itemStyle: { color: t.track, borderRadius: 2 } } : { ...s, barWidth: 4 })),
        { type: "bar", stack: "d", barWidth: 4, silent: true, z: 2, itemStyle: { color: "transparent" }, data: data.map((r) => Math.min(r.from, r.to)) },
        {
          type: "bar",
          stack: "d",
          barWidth: 4,
          z: 2,
          data: data.map((r) => ({ value: Math.abs(r.to - r.from), itemStyle: { color: alpha(t.color(tone(r)), 0.45), borderRadius: 2 } })),
        },
        {
          type: "scatter",
          z: 3,
          symbolSize: 9,
          itemStyle: { color: t.color("neutral"), borderColor: t.surface, borderWidth: 2 },
          data: data.map((r, i) => [r.from, i]),
        },
        {
          type: "scatter",
          z: 4,
          symbolSize: 12,
          cursor: data.some((d) => d.href) ? "pointer" : "default",
          data: data.map((r, i) => ({ value: [r.to, i], itemStyle: { color: t.color(tone(r)), borderColor: t.surface, borderWidth: 2 } })),
        },
      ],
    }),
    [data, max, format, grid, fromLabel, toLabel],
  );
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: fromLabel, color: "neutral" },
          { label: `${toLabel} (lower)`, color: "red" },
          { label: `${toLabel} (higher)`, color: "emerald" },
        ]}
      />
      <EChart
        option={option}
        height={height}
        label={data.map((r) => `${r.label}: ${formatValue(r.from, format)} to ${formatValue(r.to, format)}`).join("; ")}
        onEvent={(type, e) => {
          const r = e.dataIndex !== undefined ? data[e.dataIndex] : undefined;
          if (type === "click" && r?.href) router.push(r.href);
        }}
      />
    </div>
  );
}

/* ───────────────────────── Columns ───────────────────────── */

export type Column = { key: string; label: string; sub?: string; parts: StackPart[]; highlight?: boolean; /** Extra line in the tooltip. */ tip?: string };

/**
 * Vertical stacked columns on one scale (e.g. sales per day split by how they were paid). The total
 * sits on each column, every part is in the tooltip, and it scrolls sideways on phones.
 */
export function ColumnChart({
  columns,
  format = "count",
  legend,
  height = 160,
  minWidth = 560,
  label,
  activeKey,
  onColumnClick,
}: {
  columns: Column[];
  format?: ValueFormat;
  legend?: { label: string; color: ChartColor }[];
  height?: number;
  minWidth?: number;
  label: string;
  /** A picked column: the others fade. */
  activeKey?: string | null;
  /** Makes columns pickable (also as buttons for keyboards and screen readers). */
  onColumnClick?: (key: string) => void;
}) {
  const data = useStable(columns);
  const sums = data.map((c) => c.parts.reduce((n, p) => n + p.value, 0));
  const showTotals = data.length <= 16;
  const allZero = sums.every((s) => s <= 0);
  const partKeys = useMemo(() => {
    const seen: StackPart[] = [];
    for (const c of data) for (const p of c.parts) if (!seen.some((s) => s.key === p.key)) seen.push(p);
    return seen;
  }, [data]);
  const option = useCallback(
    (t: ChartTheme) => {
      const top = data.map((c) => {
        const live = c.parts.filter((p) => p.value > 0);
        return live[live.length - 1]?.key;
      });
      return {
        ...motion(t, 25),
        grid: { left: 4, right: 4, top: showTotals ? 22 : 12, bottom: 4, containLabel: true },
        xAxis: {
          type: "category",
          data: data.map((c) => c.key),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: t.grid } },
          axisLabel: {
            interval: 0,
            hideOverlap: true,
            margin: 8,
            formatter: (_: string, i: number) => {
              const c = data[i];
              if (!c) return "";
              return `{${c.highlight ? "h" : "a"}|${c.label.replace(/[{}|]/g, "")}}${c.sub ? `\n{b|${c.sub.replace(/[{}|]/g, "")}}` : ""}`;
            },
            rich: {
              a: { color: t.muted, fontSize: 10, fontFamily: t.font, lineHeight: 13 },
              h: { color: t.ink, fontSize: 10, fontWeight: 700, fontFamily: t.font, lineHeight: 13 },
              b: { color: t.axis, fontSize: 9, fontFamily: t.font, lineHeight: 12 },
            },
          },
        },
        yAxis: {
          type: "value",
          splitNumber: 3,
          minInterval: format === "percent" ? undefined : 1,
          max: allZero ? 4 : undefined,
          axisLabel: { color: t.axis, fontSize: 10, formatter: (v: number) => formatCompact(v, format) },
          splitLine: { lineStyle: { color: t.grid } },
        },
        tooltip: {
          ...tooltipBase(t),
          trigger: "axis",
          axisPointer: { type: "shadow", shadowStyle: { color: alpha(t.dark ? "#ffffff" : "#101828", 0.04) } },
          formatter: (ps: { dataIndex: number }[]) => {
            const c = data[ps[0]?.dataIndex ?? -1];
            if (!c) return "";
            const sum = c.parts.reduce((n, p) => n + p.value, 0);
            const live = c.parts.filter((p) => p.value > 0);
            return tipHTML(
              `${c.label}${c.sub ? ` ${c.sub}` : ""}`,
              [
                ...live.map((p) => ({ color: t.color(p.color), label: p.label, value: formatValue(p.value, format) })),
                ...(live.length > 1 || !live.length ? [{ label: "Total", value: formatValue(sum, format) }] : []),
              ],
              c.tip,
            );
          },
        },
        series: partKeys.map((pk) => ({
          type: "bar",
          stack: "total",
          name: pk.label,
          barMaxWidth: 28,
          barCategoryGap: "32%",
          cursor: onColumnClick ? "pointer" : "default",
          data: data.map((c, i) => {
            const part = c.parts.find((p) => p.key === pk.key);
            const isTop = top[i] === pk.key;
            return {
              value: part?.value ?? 0,
              itemStyle: {
                color: t.color(part?.color ?? pk.color),
                opacity: activeKey && activeKey !== c.key ? 0.35 : 1,
                borderRadius: isTop ? [4, 4, 0, 0] : 0,
                borderColor: t.surface,
                borderWidth: c.parts.filter((p) => p.value > 0).length > 1 ? 1 : 0,
              },
              label: isTop && showTotals ? { show: true, position: "top", color: t.ink2, fontSize: 10, fontWeight: 600, fontFamily: t.font, formatter: () => formatCompact(sums[i], format) } : { show: false },
            };
          }),
        })),
      };
    },
    [data, partKeys, sums, showTotals, format, activeKey, onColumnClick, allZero],
  );
  return (
    <div>
      {legend && <Legend items={legend} className="mb-3" />}
      <div className="thin-scroll -mx-1 overflow-x-auto px-1 pb-1">
        <div className="relative" style={{ minWidth }}>
          {allZero && <p className="pointer-events-none absolute inset-x-0 top-[40%] z-10 text-center text-sm text-muted">Nothing in this period yet</p>}
          <EChart
            option={option}
            height={height + 52}
            label={label}
            onEvent={(type, e) => {
              const c = e.dataIndex !== undefined ? data[e.dataIndex] : undefined;
              if (type === "click" && c && onColumnClick) onColumnClick(c.key);
            }}
          />
        </div>
      </div>
      {onColumnClick && (
        <ul className="sr-only">
          {data.map((c, i) => (
            <li key={c.key}>
              <button type="button" onClick={() => onColumnClick(c.key)} aria-pressed={activeKey === c.key}>
                {c.label} {c.sub}: {formatValue(sums[i], format)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Small pieces ───────────────────────── */

export function Legend({ items, className }: { items: { label: string; color: ChartColor }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[3px]" style={{ background: cssColor(i.color) }} />
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
