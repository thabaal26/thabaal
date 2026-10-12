"use client";

import type { ECharts, EChartsCoreOption } from "echarts/core";

/** Plain ECharts options; built per theme and size. */
export type ChartOption = Record<string, unknown>;
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ChartTheme } from "@/lib/chart-theme";
import { AltChart, type AltEngine } from "./chart-engines/alt-chart";
import { CHART_ATTRS, drawOption } from "./chart-engines/style";

type Lib = "echarts" | AltEngine;
const libOf = (v: string | undefined): Lib => (v === "recharts" || v === "chartjs" ? v : "echarts");

export type ChartSize = { width: number; height: number };
export type ChartEvent = { name?: string; dataIndex?: number; seriesIndex?: number; seriesName?: string; data?: unknown; componentType?: string };

type EchartsModule = typeof import("echarts/core");
let loading: Promise<EchartsModule> | null = null;
const loadEcharts = () => (loading ??= import("@/lib/echarts-core").then((m) => m.default as unknown as EchartsModule));

/*
 * Drawing a chart is heavy (text measuring, building the SVG, the entry animation): on a phone it takes
 * longer than a frame. Charts that appear while nothing is scrolling (the ones on screen when a page
 * opens) draw straight away; charts that scroll into view are drawn one at a time, a few frames apart,
 * once scrolling pauses, so they never compete with the scroll itself.
 */
const SCROLL_QUIET_MS = 160;
const GAP_MS = 48;
let lastScroll = 0;
let listening = false;
let pumping = false;
const queue: (() => void)[] = [];

function pump() {
  const wait = SCROLL_QUIET_MS - (performance.now() - lastScroll);
  if (wait > 0) {
    window.setTimeout(pump, wait);
    return;
  }
  const next = queue.shift();
  if (next) next();
  if (queue.length) window.setTimeout(pump, GAP_MS);
  else pumping = false;
}

/** Runs `fn` now if nothing is scrolling, else when it's this chart's turn and scrolling has paused; returns a cancel function. */
function drawSoon(fn: () => void) {
  if (!listening) {
    listening = true;
    // Capture also hears scrolling panes (scroll events don't bubble).
    window.addEventListener("scroll", () => (lastScroll = performance.now()), { passive: true, capture: true });
  }
  if (!pumping && (!lastScroll || performance.now() - lastScroll > 1000)) {
    fn();
    return () => {};
  }
  queue.push(fn);
  if (!pumping) {
    pumping = true;
    pump();
  }
  return () => {
    const i = queue.indexOf(fn);
    if (i >= 0) queue.splice(i, 1);
  };
}

/**
 * The one way the portal draws a chart, themed from the live design tokens. It loads the library
 * when the chart nears the screen, redraws on resize and when light/dark changes, and animates once.
 * `option` builds the chart (an ECharts option) from the theme and current size.
 *
 * The library is the portal's choice (Appearance → Chart library, read from the nearest
 * [data-chart]): Apache ECharts draws the option itself; Recharts or Chart.js draw it through the
 * neutral model in chart-engines/, and charts only ECharts can draw well stay on ECharts.
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
  /** ECharts' own box inside the chart, so another library can take over without touching its DOM. */
  const ecEl = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  /** The option last drawn, so the data effect doesn't redraw what init just drew. */
  const drawnWith = useRef<typeof option | null>(null);
  const redraw = useRef<() => void>(() => {});
  const eventRef = useRef(onEvent);
  const readyRef = useRef(onReady);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [lib, setLib] = useState<Lib | null>(null);
  /** This chart needs ECharts whatever the portal picked (a gauge, a heat map…). */
  const [needsEcharts, setNeedsEcharts] = useState(false);
  /** Bumped when the chart style, colours or font change around the chart, to redraw it. */
  const [styleTick, setStyleTick] = useState(0);
  const engine: Lib | null = !visible || !lib ? null : needsEcharts ? "echarts" : lib;

  useEffect(() => {
    optionRef.current = option;
    eventRef.current = onEvent;
    readyRef.current = onReady;
  });

  // Which library: the nearest [data-chart] (the dashboard, or an Appearance preview box), live.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const host = (node.closest("[data-chart]") as HTMLElement | null) ?? document.documentElement;
    const read = () => setLib(libOf(host.dataset.chart ?? document.documentElement.dataset.chart));
    queueMicrotask(read);
    const mo = new MutationObserver(() => {
      read();
      setStyleTick((n) => n + 1);
    });
    mo.observe(host, { attributes: true, attributeFilter: CHART_ATTRS });
    return () => mo.disconnect();
  }, []);

  // Start loading when it is about to be seen.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    // Old browsers without IntersectionObserver: draw straight away.
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setVisible(true));
      return;
    }
    let cancel = () => {};
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          cancel = drawSoon(() => setVisible(true));
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancel();
    };
  }, []);

  const onEcharts = engine === "echarts";
  useEffect(() => {
    if (!onEcharts) return;
    let alive = true;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    const draw = (animate: boolean) => {
      const c = chart.current;
      const node = ecEl.current;
      if (!c || !node) return;
      drawnWith.current = optionRef.current;
      c.setOption(drawOption(optionRef.current, node, dark, animate) as EChartsCoreOption, { notMerge: true });
    };
    redraw.current = () => draw(true);
    loadEcharts().then((echarts) => {
      const node = ecEl.current;
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
  }, [onEcharts, dark]);

  // New data: redraw, animating from the old values.
  useEffect(() => {
    const c = chart.current;
    const node = ecEl.current;
    if (!c || !node || !ready || drawnWith.current === option) return;
    drawnWith.current = option;
    c.setOption(drawOption(option, node, dark, true) as EChartsCoreOption, { notMerge: true });
  }, [option, ready, dark]);

  // A new chart style or palette around the chart (the portal's, or a preview's): draw it again.
  useEffect(() => {
    if (styleTick) redraw.current();
  }, [styleTick]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={label}
      className={cn("echart relative w-full", !ready && "animate-pulse rounded-control bg-sunken/60", className)}
      style={{ height, ...style }}
    >
      <div ref={ecEl} className="absolute inset-0" />
      {engine && engine !== "echarts" && (
        <AltChart
          engine={engine}
          option={option}
          dark={dark}
          onEvent={onEvent}
          onDrawn={() => {
            setReady(true);
            readyRef.current?.(null);
          }}
          onUnsupported={() => setNeedsEcharts(true)}
          styleTick={styleTick}
        />
      )}
    </div>
  );
}
