"use client";

/**
 * Trend, sparkline, gauge, delivery donut and heatmap: the time-and-health charts, in the same
 * ECharts look as components/viz.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EChart } from "@/components/echart";
import { Donut, type Slice } from "@/components/viz";
import { formatCompact, formatValue, type ValueFormat } from "@/lib/chart-math";
import { alpha, cssColor, motion, tipHTML, tooltipBase, type ChartColor, type ChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  // Keyed on the serialised value on purpose.
  return useMemo(() => JSON.parse(key) as T, [key]);
}

/* ───────────────────────── Count-up number ───────────────────────── */

/** A figure that counts up once when the page opens (instantly with reduced motion). */
export function CountUp({ value, format = "count", className }: { value: number; format?: ValueFormat; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion() || from.current === value) return;
    const start = performance.now();
    const begin = from.current ?? 0;
    from.current = value;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setShown(begin + (value - begin) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("tabular", className)}>{formatValue(shown, format)}</span>;
}

/* ───────────────────────── Sparkline ───────────────────────── */

/** A tiny smooth trend for a KPI tile: the line and a soft wash beneath. Decorative; the tile states the figures. */
export function Sparkline({ values, color, className }: { values: number[]; color: ChartColor; className?: string }) {
  const v = useStable(values);
  const option = useCallback(
    (t: ChartTheme) => {
      const c = t.color(color);
      return {
        ...motion(t, 0),
        grid: { left: 0, right: 0, top: 4, bottom: 0 },
        xAxis: { type: "category", show: false, boundaryGap: false, data: v.map((_, i) => i) },
        yAxis: { type: "value", show: false, min: 0 },
        series: [
          {
            type: "line",
            data: v,
            smooth: true,
            smoothMonotone: "x",
            silent: true,
            showSymbol: false,
            lineStyle: { width: 2, color: c, cap: "round" },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(c, 0.2) }, { offset: 1, color: alpha(c, 0) }] } },
          },
        ],
      };
    },
    [v, color],
  );
  if (v.length < 2 || Math.max(...v, 0) === 0) return <div aria-hidden className={cn("h-10", className)} />;
  return (
    <div aria-hidden className={cn("h-10 w-full", className)}>
      <EChart option={option} height="100%" label="Trend" className="!bg-transparent" />
    </div>
  );
}

/* ───────────────────────── Trend chart ───────────────────────── */

export type Series = { key: string; label: string; color: ChartColor; values: number[]; area?: boolean };

/**
 * Smooth lines with soft washes over a shared x axis, a crosshair tooltip with every value, and a
 * "Peak" marker on the first series. `dark` draws it for the dark brand card.
 */
export function TrendChart({
  labels,
  tooltipLabels,
  series,
  height = 240,
  format = "count",
  dark = false,
  every = 1,
  peak = true,
}: {
  labels: string[];
  /** Longer labels for the tooltip (e.g. "Tue 7 Oct"); defaults to `labels`. */
  tooltipLabels?: string[];
  series: Series[];
  height?: number;
  format?: ValueFormat;
  dark?: boolean;
  /** Show every nth x label. */
  every?: number;
  peak?: boolean;
}) {
  const data = useStable({ labels, tips: tooltipLabels ?? labels, series });
  const allZero = data.series.every((s) => s.values.every((v) => v <= 0));
  const option = useCallback(
    (t: ChartTheme) => ({
      ...motion(t, 0),
      grid: { left: 4, right: 14, top: 30, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: data.labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: t.grid } },
        axisLabel: { color: t.axis, fontSize: 10, interval: (i: number) => i % every === 0 || i === data.labels.length - 1, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        splitNumber: 3,
        minInterval: format === "percent" ? undefined : 1,
        max: allZero ? 4 : undefined,
        axisLabel: { color: t.axis, fontSize: 10, formatter: (v: number) => formatCompact(v, format === "percent" ? "percent" : "count") },
        splitLine: { lineStyle: { color: t.grid } },
      },
      tooltip: {
        ...tooltipBase(t),
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.axis, width: 1 } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          return tipHTML(data.tips[i] ?? "", data.series.map((s) => ({ color: t.color(s.color), label: s.label, value: formatValue(s.values[i] ?? 0, format) })));
        },
      },
      series: data.series.map((s, si) => {
        const c = t.color(s.color);
        const top = Math.max(...s.values, 0);
        return {
          type: "line",
          name: s.label,
          data: s.values,
          smooth: true,
          smoothMonotone: "x",
          showSymbol: false,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: c, borderColor: t.surface, borderWidth: 2 },
          lineStyle: { width: 2.5, color: c, cap: "round", join: "round" },
          emphasis: { disabled: true },
          areaStyle:
            s.area === false
              ? undefined
              : { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(c, t.dark ? 0.3 : 0.16) }, { offset: 1, color: alpha(c, 0) }] } },
          markPoint:
            peak && si === 0 && top > 0
              ? {
                  symbol: "circle",
                  symbolSize: 9,
                  itemStyle: { color: c, borderColor: t.surface, borderWidth: 2 },
                  label: {
                    show: true,
                    position: "top",
                    distance: 8,
                    formatter: () => `Peak ${formatValue(top, format)}`,
                    color: t.dark ? "#171b24" : "#ffffff",
                    backgroundColor: t.dark ? "#eabf26" : "#171b24",
                    borderRadius: 10,
                    padding: [3, 8],
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: t.font,
                  },
                  data: [{ type: "max" }],
                }
              : undefined,
        };
      }),
    }),
    [data, every, format, peak, allZero],
  );
  if (allZero)
    return (
      <div className="relative">
        <p className={cn("pointer-events-none absolute inset-x-0 top-[38%] z-10 text-center text-sm", dark ? "text-white/60" : "text-muted")}>Nothing in this period yet</p>
        <EChart option={option} height={height} dark={dark} label="No activity in this period" className={dark ? "!bg-transparent" : undefined} />
      </div>
    );
  return <EChart option={option} height={height} dark={dark} label={`${data.series.map((s) => s.label).join(" and ")} over time`} className={dark ? "!bg-transparent" : undefined} />;
}

/* ───────────────────────── Delivery donut ───────────────────────── */

/** Where messages ended up: read, delivered, still sending, failed. The centre shows the delivered share. */
export function DeliveryDonut({ read, delivered, sent, failed }: { read: number; delivered: number; sent: number; failed: number }) {
  const total = read + delivered + sent + failed;
  const reached = read + delivered;
  const deliveredPct = total > 0 ? Math.round((reached / total) * 1000) / 10 : 0;
  const readPct = reached > 0 ? Math.round((read / reached) * 1000) / 10 : 0;
  const [active, setActive] = useState<string | null>(null);
  const slices: Slice[] = [
    { key: "read", label: "Read by customer", value: read, color: "violet" },
    { key: "delivered", label: "Delivered, unread", value: delivered, color: "emerald" },
    { key: "sent", label: "Sending / waiting", value: sent, color: "neutral" },
    { key: "failed", label: "Failed to deliver", value: failed, color: "red" },
  ];
  return (
    <div className="flex flex-col items-center gap-4">
      <Donut
        slices={slices}
        size={208}
        thickness={22}
        centerValue={`${deliveredPct}%`}
        centerLabel="delivered"
        active={active}
        onActive={setActive}
        label={`${deliveredPct}% of ${total} messages delivered: ${read} read, ${delivered} delivered unread, ${sent} sending, ${failed} failed`}
      />
      <div className="flex w-full items-center justify-between gap-2 rounded-control border border-line bg-subtle px-3.5 py-2 text-xs">
        <span className="text-ink-2">
          <b className="tabular font-semibold text-ink">{reached.toLocaleString("en-IN")}</b> of <b className="tabular font-semibold text-ink">{total.toLocaleString("en-IN")}</b> delivered
        </span>
        <span className="tabular rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent">{readPct}% read</span>
      </div>
      <ul className="grid w-full grid-cols-1 gap-2 min-[400px]:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {slices.map((s) => {
          const pctShare = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
          return (
            <li
              key={s.key}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              className={cn("rounded-control border px-3 py-2.5 transition", active === s.key ? "border-line-2 bg-subtle" : "border-line bg-panel")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: cssColor(s.color) }} />
                  <span className="truncate text-xs font-medium text-ink-2">{s.label}</span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-ink">{s.value.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${s.value > 0 ? Math.max(pctShare, 3) : 0}%`, background: cssColor(s.color) }} />
                </div>
                <span className="tabular w-10 shrink-0 text-right text-[11px] font-medium text-muted">{pctShare}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Usage gauge ───────────────────────── */

/**
 * How much of a limit is used: a 260° arc with fine ticks around it, the figure in the middle.
 * `full` turns it red.
 */
export function UsageGauge({
  value,
  max,
  full = false,
  size = 112,
  label,
  children,
}: {
  value: number;
  max: number | null;
  full?: boolean;
  size?: number;
  label: string;
  children?: ReactNode;
}) {
  const share = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const option = useCallback(
    (t: ChartTheme) => {
      const c = t.color(full ? "red" : "blue");
      return {
        ...(t.animate ? { animation: true, animationDuration: 900, animationEasing: "cubicOut" } : { animation: false }),
        series: [
          {
            type: "gauge",
            startAngle: 220,
            endAngle: -40,
            min: 0,
            max: 100,
            radius: "96%",
            silent: true,
            pointer: { show: false },
            progress: { show: value > 0, width: 8, roundCap: true, itemStyle: { color: c } },
            axisLine: { roundCap: true, lineStyle: { width: 8, color: [[1, t.track]] } },
            splitNumber: 5,
            axisTick: { show: true, distance: -20, length: 3, splitNumber: 4, lineStyle: { color: alpha(t.axis, 0.45), width: 1 } },
            splitLine: { show: true, distance: -21, length: 5, lineStyle: { color: t.axis, width: 1.5 } },
            axisLabel: { show: false },
            title: { show: false },
            detail: { show: false },
            anchor: { show: false },
            data: [{ value: value > 0 ? Math.max(share, 2) : 0 }],
          },
        ],
      };
    },
    [share, full, value],
  );
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <EChart option={option} height={size} label={label} className="!absolute inset-0 !rounded-full" />
      {children && <div className="relative z-10 flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}

/* ───────────────────────── Heat grid ───────────────────────── */

/** A weekday × time grid, one emerald scale: darker = more. Each cell shows its count. */
export function HeatGrid({
  rows,
  cols,
  cells,
  unit,
  label,
}: {
  rows: string[];
  cols: string[];
  /** [col, row, value] */
  cells: [number, number, number][];
  unit: string;
  label: string;
}) {
  const data = useStable({ rows, cols, cells });
  const max = Math.max(1, ...data.cells.map((c) => c[2]));
  const option = useCallback(
    (t: ChartTheme) => {
      const c = t.color("emerald");
      return {
        ...motion(t, 6),
        grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: true },
        xAxis: { type: "category", data: data.cols, position: "top", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 10, interval: 0 }, splitArea: { show: false } },
        yAxis: { type: "category", data: data.rows, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11 } },
        visualMap: { show: false, min: 0, max, inRange: { color: [alpha(c, t.dark ? 0.14 : 0.08), c] } },
        tooltip: {
          ...tooltipBase(t),
          trigger: "item",
          formatter: (p: { value: [number, number, number] }) => tipHTML(`${data.rows[p.value[1]]} · ${data.cols[p.value[0]]}`, [{ color: c, label: unit, value: formatValue(p.value[2]) }]),
        },
        series: [
          {
            type: "heatmap",
            data: data.cells.map(([x, y, v]) => ({
              value: [x, y, v],
              label: { show: v > 0, color: v / max > 0.55 ? "#ffffff" : t.ink2, fontSize: 11, fontWeight: 600, fontFamily: t.font },
              itemStyle: v > 0 ? undefined : { color: t.track },
            })),
            itemStyle: { borderColor: t.surface, borderWidth: 3, borderRadius: 6 },
            emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
          },
        ],
      };
    },
    [data, max, unit],
  );
  return (
    <div className="thin-scroll overflow-x-auto">
      <div className="min-w-[30rem]">
        <EChart option={option} height={data.rows.length * 36 + 30} label={label} />
      </div>
    </div>
  );
}
