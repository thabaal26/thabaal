/* eslint-disable @typescript-eslint/no-explicit-any -- rewrites loosely typed ECharts options */

/*
 * The portal's chart style (lib/appearance.ts → Charts): line curves, the fill under lines,
 * gridlines, bar ends and motion. Every chart is written once as an ECharts option; this rewrites
 * that option before any library draws it, so all three libraries follow the same style. The
 * colours come from the --color-chart-* tokens (appearance.css swaps them per palette), which
 * readChartTheme reads from the chart's own element.
 */

import { readChartTheme, type ChartTheme } from "@/lib/chart-theme";

export type ChartStyle = {
  curve: "smooth" | "straight";
  fill: "gradient" | "flat" | "none";
  grid: "on" | "off";
  bars: "round" | "square";
  motion: "on" | "off";
};

/** The attributes a chart listens to (a preview box or the portal changing its look). */
export const CHART_ATTRS = ["data-chart", "data-chart-palette", "data-chart-curve", "data-chart-fill", "data-chart-grid", "data-chart-bars", "data-chart-motion", "data-font"];

const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** The style on the nearest box that carries one (falls back to <html>, then the defaults). */
export function readChartStyle(host: HTMLElement | null): ChartStyle {
  const d = host?.dataset ?? {};
  const r = typeof document !== "undefined" ? document.documentElement.dataset : {};
  return {
    curve: pick(d.chartCurve ?? r.chartCurve, ["smooth", "straight"] as const, "smooth"),
    fill: pick(d.chartFill ?? r.chartFill, ["gradient", "flat", "none"] as const, "gradient"),
    grid: pick(d.chartGrid ?? r.chartGrid, ["on", "off"] as const, "on"),
    bars: pick(d.chartBars ?? r.chartBars, ["round", "square"] as const, "round"),
    motion: pick(d.chartMotion ?? r.chartMotion, ["on", "off"] as const, "on"),
  };
}

const flatColor = (c: any) => (c && Array.isArray(c.colorStops) && c.colorStops.length ? c.colorStops[0].color : c);

function squareItem(item: any) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (!item.itemStyle || item.itemStyle.borderRadius === undefined) return item;
  return { ...item, itemStyle: { ...item.itemStyle, borderRadius: 0 } };
}

/** The option with the style applied. The defaults leave a chart exactly as it was written. */
export function styleOption(o: any, s: ChartStyle): any {
  if (!o || typeof o !== "object") return o;
  const out: any = { ...o };
  const list = Array.isArray(o.series) ? o.series : o.series ? [o.series] : [];
  out.series = list.map((x: any) => {
    let s2 = x;
    if (x?.type === "line") {
      if (s.curve === "straight") s2 = { ...s2, smooth: false };
      if (x.areaStyle && s.fill === "none") s2 = { ...s2, areaStyle: undefined };
      else if (x.areaStyle && s.fill === "flat") s2 = { ...s2, areaStyle: { ...x.areaStyle, color: flatColor(x.areaStyle.color) } };
    }
    if (s.bars === "square") {
      if (x?.type === "bar" || x?.type === "heatmap" || x?.type === "pie") {
        s2 = { ...s2, itemStyle: s2.itemStyle ? { ...s2.itemStyle, borderRadius: 0 } : s2.itemStyle, data: Array.isArray(s2.data) ? s2.data.map(squareItem) : s2.data };
      }
      if (x?.type === "gauge") {
        s2 = { ...s2, progress: s2.progress ? { ...s2.progress, roundCap: false } : s2.progress, axisLine: s2.axisLine ? { ...s2.axisLine, roundCap: false } : s2.axisLine };
      }
    }
    return s2;
  });
  if (s.grid === "off") {
    const noGrid = (ax: any) => (ax && typeof ax === "object" ? { ...ax, splitLine: { ...(ax.splitLine ?? {}), show: false } } : ax);
    for (const k of ["xAxis", "yAxis"]) if (o[k]) out[k] = Array.isArray(o[k]) ? o[k].map(noGrid) : noGrid(o[k]);
  }
  if (s.motion === "off") out.animation = false;
  return out;
}

/**
 * Builds the option a library draws: the theme read from the chart's element, the portal's chart
 * style applied, and motion only on the first draw (and only when the style allows it).
 */
export function drawOption(
  option: (t: ChartTheme, size: { width: number; height: number }) => Record<string, unknown>,
  node: HTMLElement,
  dark: boolean,
  animate: boolean,
): Record<string, unknown> {
  const host = (node.closest("[data-chart]") as HTMLElement | null) ?? document.documentElement;
  const style = readChartStyle(host);
  const base = readChartTheme(dark, node);
  const theme = { ...base, animate: base.animate && animate && style.motion === "on" };
  const opt = styleOption(option(theme, { width: node.clientWidth, height: node.clientHeight }), style);
  return { textStyle: { fontFamily: theme.font }, ...opt, ...(theme.animate ? {} : { animation: false }) };
}
