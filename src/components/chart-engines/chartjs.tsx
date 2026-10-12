"use client";

/* Draws a chart model (model.ts) with Chart.js on a canvas. Loaded only on portals that pick Chart.js. */

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ActiveElement,
  type ChartConfiguration,
  type Plugin,
} from "chart.js";
import { useEffect, useRef } from "react";
import { floatingTip, tipHTML, withAlpha, type Cartesian, type ChartModel, type PieModel } from "./model";
import type { EngineProps } from "./types";

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip);

const corners = (r: number | number[]) =>
  Array.isArray(r) ? { topLeft: r[0] ?? 0, topRight: r[1] ?? 0, bottomRight: r[2] ?? 0, bottomLeft: r[3] ?? 0 } : r;

/** Value labels at the end of bars (ECharts' label: { position: "top" }). */
const barLabels = (get: () => ChartModel): Plugin => ({
  id: "barLabels",
  afterDatasetsDraw(chart) {
    const m = get();
    if (m.kind !== "cartesian") return;
    const { ctx } = chart;
    m.series.forEach((s, si) => {
      const meta = chart.getDatasetMeta(si);
      if (meta.hidden || s.type !== "bar") return;
      s.data.forEach((d, i) => {
        const el = meta.data[i] as unknown as { x: number; y: number } | undefined;
        if (!d.label || !el) return;
        ctx.save();
        ctx.fillStyle = d.label.color;
        ctx.font = `${d.label.weight} ${d.label.size}px ${m.font}`;
        ctx.textAlign = m.horizontal ? "left" : "center";
        ctx.textBaseline = m.horizontal ? "middle" : "bottom";
        ctx.fillText(d.label.text, m.horizontal ? el.x + 4 : el.x, m.horizontal ? el.y : el.y - 4);
        ctx.restore();
      });
    });
  },
});

/** The hover guide: a line for line charts, a soft band for bars (ECharts' axisPointer). */
const pointer = (get: () => ChartModel): Plugin => ({
  id: "pointer",
  beforeDatasetsDraw(chart) {
    const m = get();
    if (m.kind !== "cartesian" || m.pointer === "none") return;
    const active = chart.getActiveElements();
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const el = active[0].element as unknown as { x: number; y: number; width?: number; height?: number };
    ctx.save();
    if (m.pointer === "line") {
      ctx.strokeStyle = m.pointerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (m.horizontal) {
        ctx.moveTo(chartArea.left, el.y);
        ctx.lineTo(chartArea.right, el.y);
      } else {
        ctx.moveTo(el.x, chartArea.top);
        ctx.lineTo(el.x, chartArea.bottom);
      }
      ctx.stroke();
    } else {
      const scale = chart.scales[m.horizontal ? "y" : "x"];
      const band = (scale.width && !m.horizontal ? scale.width : scale.height) / Math.max(1, m.categories.length);
      ctx.fillStyle = m.pointerColor;
      if (m.horizontal) ctx.fillRect(chartArea.left, el.y - band / 2, chartArea.right - chartArea.left, band);
      else ctx.fillRect(el.x - band / 2, chartArea.top, band, chartArea.bottom - chartArea.top);
    }
    ctx.restore();
  },
});

function cartesianConfig(m: Cartesian): ChartConfiguration {
  const stacked = m.series.some((s) => s.stack);
  const cat = {
    type: "category" as const,
    display: m.showCatAxis || m.showCatLine,
    reverse: m.horizontal ? !m.catInverse : m.catInverse,
    offset: m.boundaryGap,
    stacked,
    grid: { display: false, drawTicks: false },
    border: { display: m.showCatLine, color: m.gridColor },
    ticks: {
      display: m.showCatAxis,
      color: m.axisColor,
      font: { size: m.fontSize, family: m.font },
      autoSkip: m.autoSkip,
      maxRotation: 0,
      padding: 6,
      callback: (_: unknown, i: number) => m.catLabels[i] ?? "",
    },
  };
  const val = {
    type: "linear" as const,
    display: m.showValAxis || m.showGrid,
    min: m.valMin,
    max: m.valMax,
    beginAtZero: true,
    stacked,
    grid: { display: m.showGrid, color: m.gridColor, drawTicks: false },
    border: { display: false },
    ticks: {
      display: m.showValAxis,
      color: m.axisColor,
      font: { size: m.fontSize, family: m.font },
      maxTicksLimit: m.valTicks,
      precision: m.integer ? 0 : undefined,
      padding: 6,
      callback: (v: string | number) => (m.valFormat ? m.valFormat(Number(v)) : v),
    },
  };
  return {
    type: "bar",
    data: {
      labels: m.categories,
      datasets: m.series.map((s) =>
        s.type === "line"
          ? {
              type: "line" as const,
              label: s.name,
              data: s.data.map((d) => d.value),
              borderColor: s.color,
              borderWidth: s.lineWidth,
              borderDash: s.dashed ? [5, 4] : [],
              tension: s.smooth ? 0.35 : 0,
              cubicInterpolationMode: s.smooth ? ("monotone" as const) : ("default" as const),
              pointRadius: s.showSymbol ? 2.5 : 0,
              pointHoverRadius: 4.5,
              pointBackgroundColor: s.color,
              pointBorderColor: "#fff",
              pointHoverBorderWidth: 2,
              fill: s.area ? "origin" : false,
              backgroundColor: s.area
                ? (ctx: { chart: Chart }) => {
                    const { chartArea, ctx: c } = ctx.chart;
                    if (!chartArea) return s.area!.top;
                    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    g.addColorStop(0, s.area!.top);
                    g.addColorStop(1, s.area!.bottom);
                    return g;
                  }
                : s.color,
              order: 0,
            }
          : {
              type: "bar" as const,
              label: s.name,
              data: s.data.map((d) => d.value),
              backgroundColor: s.data.map((d) => withAlpha(d.color, d.opacity)),
              hoverBackgroundColor: s.data.map((d) => withAlpha(d.color, Math.min(1, d.opacity + 0.1))),
              borderColor: s.data.map((d) => d.borderColor ?? "transparent"),
              borderWidth: s.data.map((d) => (d.borderWidth ? { top: 0, left: 0, right: 0, bottom: d.borderWidth } : 0)) as never,
              borderRadius: s.data.map((d) => corners(d.radius)) as never,
              borderSkipped: false,
              stack: s.stack,
              barThickness: s.barWidth,
              maxBarThickness: s.barMax,
              categoryPercentage: 0.7,
              barPercentage: 0.9,
              order: 1,
            },
      ),
    },
    options: {
      indexAxis: m.horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      animation: m.animate ? { duration: 650, easing: "easeOutCubic" } : false,
      layout: { padding: { top: m.grid.top, right: m.grid.right, bottom: m.grid.bottom, left: m.grid.left } },
      interaction: m.tip?.trigger === "axis" ? { mode: "index", intersect: false, axis: m.horizontal ? "y" : "x" } : { mode: "nearest", intersect: true },
      scales: m.horizontal ? { y: cat, x: val } : { x: cat, y: val },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as ChartConfiguration;
}

function pieConfig(m: PieModel): ChartConfiguration {
  return {
    type: "doughnut",
    data: {
      labels: m.slices.map((s) => s.name),
      datasets: [
        {
          data: m.slices.map((s) => s.value),
          backgroundColor: m.slices.map((s) => s.color),
          borderColor: m.borderColor,
          borderWidth: m.borderWidth,
          borderRadius: m.radius,
          hoverOffset: m.slices.length > 1 ? 5 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: `${(m.inner / Math.max(1, m.outer)) * 100}%`,
      radius: `${m.outer}%`,
      rotation: 90 - m.startAngle,
      animation: m.animate ? { duration: 650, easing: "easeOutCubic", animateRotate: true } : false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as ChartConfiguration;
}

export default function ChartJsChart({ model, onEvent, onDrawn }: EngineProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  const modelRef = useRef<ChartModel>(model);
  const eventRef = useRef(onEvent);
  const tip = useRef(floatingTip());

  useEffect(() => {
    modelRef.current = model;
    eventRef.current = onEvent;
  });

  // Built once per chart shape; new data updates it in place so values animate from the old ones.
  const shape = `${model.kind}:${model.kind === "cartesian" ? `${model.horizontal}:${model.series.map((s) => s.type).join(",")}` : ""}`;
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const m = modelRef.current;
    const cfg = m.kind === "pie" ? pieConfig(m) : cartesianConfig(m);
    // The plugins read the latest model, so new data never needs them rebuilt.
    if (m.kind === "cartesian") cfg.plugins = [barLabels(() => modelRef.current), pointer(() => modelRef.current)];
    let hovered: string | null = null;
    const describe = (els: ActiveElement[]) => {
      const e = els[0];
      if (!e) return null;
      const mm = modelRef.current;
      const seriesName = mm.kind === "cartesian" ? mm.series[e.datasetIndex]?.name : undefined;
      const name = mm.kind === "pie" ? mm.slices[e.index]?.name : mm.categories[e.index];
      return { dataIndex: e.index, seriesIndex: e.datasetIndex, seriesName, name, componentType: "series" };
    };
    cfg.options = {
      ...cfg.options,
      onHover: (evt, els) => {
        const d = describe(els);
        const key = d ? `${d.seriesIndex}:${d.dataIndex}` : null;
        if (key !== hovered) {
          if (hovered) eventRef.current?.("mouseout", {});
          if (d) eventRef.current?.("mouseover", d);
          hovered = key;
        }
        const mm = modelRef.current;
        const clickable = mm.kind === "pie" ? mm.clickable : mm.series[d?.seriesIndex ?? -1]?.clickable;
        node.style.cursor = d && clickable ? "pointer" : "default";
        const ne = evt.native as MouseEvent | null;
        if (d && mm.tip && ne) tip.current.show(tipHTML(mm, d.dataIndex, d.seriesIndex), mm.tip, ne.clientX, ne.clientY);
        else tip.current.hide();
      },
      onClick: (_evt, els) => {
        const d = describe(els);
        if (d) eventRef.current?.("click", d);
      },
    };
    const c = new Chart(node, cfg);
    chart.current = c;
    onDrawn?.();
    const leave = () => {
      tip.current.hide();
      if (hovered) eventRef.current?.("mouseout", {});
      hovered = null;
      eventRef.current?.("globalout", {});
    };
    node.addEventListener("mouseleave", leave);
    const t = tip.current;
    return () => {
      node.removeEventListener("mouseleave", leave);
      t.destroy();
      c.destroy();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the chart's shape changes
  }, [shape]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const fresh = model.kind === "pie" ? pieConfig(model) : cartesianConfig(model);
    c.data = fresh.data;
    Object.assign(c.options, { scales: fresh.options?.scales, layout: fresh.options?.layout, animation: fresh.options?.animation });
    c.update();
  }, [model]);

  return <canvas ref={canvas} role="presentation" />;
}
