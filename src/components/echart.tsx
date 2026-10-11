"use client";

import type { ECharts, EChartsCoreOption } from "echarts/core";

/** Plain ECharts options; built per theme and size. */
export type ChartOption = Record<string, unknown>;
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { readChartTheme, type ChartTheme } from "@/lib/chart-theme";

export type ChartSize = { width: number; height: number };
export type ChartEvent = { name?: string; dataIndex?: number; seriesIndex?: number; seriesName?: string; data?: unknown; componentType?: string };

type EchartsModule = typeof import("echarts/core");
let loading: Promise<EchartsModule> | null = null;
const loadEcharts = () => (loading ??= import("@/lib/echarts-core").then((m) => m.default as unknown as EchartsModule));

/**
 * The one way the portal draws a chart: Apache ECharts (SVG), themed from the live design tokens.
 * It loads the library when the chart nears the screen, redraws on resize and when light/dark
 * changes, and animates once. `option` builds the chart from the theme and current size.
 */
export function EChart({
  option,
  height,
  label,
  className,
  dark = false,
  onEvent,
  onReady,
  style,
}: {
  option: (t: ChartTheme, size: ChartSize) => ChartOption;
  height: number | string;
  /** What the chart shows, for screen readers. */
  label: string;
  className?: string;
  /** Always draw with the dark steps (charts on the dark brand card). */
  dark?: boolean;
  onEvent?: (type: "click" | "mouseover" | "mouseout" | "globalout", e: ChartEvent) => void;
  onReady?: (chart: ECharts | null) => void;
  style?: React.CSSProperties;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  /** The option last drawn, so the data effect doesn't redraw what init just drew. */
  const drawnWith = useRef<typeof option | null>(null);
  const eventRef = useRef(onEvent);
  const readyRef = useRef(onReady);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    optionRef.current = option;
    eventRef.current = onEvent;
    readyRef.current = onReady;
  });

  // Start loading when it is about to be seen.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    // Old browsers without IntersectionObserver: draw straight away.
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    const draw = (animate: boolean) => {
      const c = chart.current;
      const node = el.current;
      if (!c || !node) return;
      const theme = readChartTheme(dark);
      drawnWith.current = optionRef.current;
      const opt = optionRef.current(animate ? theme : { ...theme, animate: false }, { width: node.clientWidth, height: node.clientHeight });
      c.setOption({ textStyle: { fontFamily: theme.font }, ...opt, ...(animate && theme.animate ? {} : { animation: false }) } as EChartsCoreOption, { notMerge: true });
    };
    loadEcharts().then((echarts) => {
      const node = el.current;
      if (!alive || !node) return;
      const c = echarts.init(node, null, { renderer: "svg" });
      chart.current = c;
      for (const type of ["click", "mouseover", "mouseout", "globalout"] as const) {
        c.on(type, (e: unknown) => eventRef.current?.(type, (e ?? {}) as ChartEvent));
      }
      draw(true);
      setReady(true);
      readyRef.current?.(c);
      let w = node.clientWidth;
      ro = new ResizeObserver(() => {
        if (!chart.current || node.clientWidth === w) return;
        w = node.clientWidth;
        chart.current.resize();
        draw(false);
      });
      ro.observe(node);
      mo = new MutationObserver(() => draw(false));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    });
    return () => {
      alive = false;
      ro?.disconnect();
      mo?.disconnect();
      readyRef.current?.(null);
      chart.current?.dispose();
      chart.current = null;
    };
  }, [visible, dark]);

  // New data: redraw, animating from the old values.
  useEffect(() => {
    const c = chart.current;
    const node = el.current;
    if (!c || !node || !ready || drawnWith.current === option) return;
    drawnWith.current = option;
    const theme = readChartTheme(dark);
    c.setOption({ textStyle: { fontFamily: theme.font }, ...option(theme, { width: node.clientWidth, height: node.clientHeight }) } as EChartsCoreOption, { notMerge: true });
  }, [option, ready, dark]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={label}
      className={cn("echart relative w-full", !ready && "animate-pulse rounded-control bg-sunken/60", className)}
      style={{ height, ...style }}
    />
  );
}
