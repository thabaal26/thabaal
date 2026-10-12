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
import { MatrixController, MatrixElement } from "chartjs-chart-matrix";
import { useEffect, useRef } from "react";
import { floatingTip, heatColor, sweep, tipHTML, withAlpha, type Cartesian, type ChartModel, type GaugeModel, type HeatModel, type PieModel, type RowsModel } from "./model";
import type { EngineProps } from "./types";

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip, MatrixController, MatrixElement);

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

/** A gauge or progress ring: the value arc and the rest of the track, over the gauge's sweep. */
function gaugeConfig(m: GaugeModel): ChartConfiguration {
  const outer = (Math.min(m.w, m.h) / 2) * (m.radius / 100);
  return {
    type: "doughnut",
    data: {
      labels: ["value", "rest"],
      datasets: [
        {
          data: [m.value, Math.max(0, 100 - m.value)],
          backgroundColor: [m.color, m.track],
          borderWidth: 0,
          borderRadius: m.roundCap ? m.width / 2 : 0,
          hoverOffset: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      events: [],
      radius: `${m.radius}%`,
      cutout: Math.max(0, outer - m.width),
      rotation: 90 - m.start,
      circumference: sweep(m),
      animation: m.animate ? { duration: 900, easing: "easeOutCubic", animateRotate: true } : false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as ChartConfiguration;
}

/** A heat map: one rounded cell per value (chartjs-chart-matrix), its count printed inside. */
function heatConfig(m: HeatModel): ChartConfiguration {
  const font = (size: number) => ({ size, family: m.font });
  return {
    type: "matrix",
    data: {
      datasets: [
        {
          data: m.cells.map((c) => ({ x: m.xCats[c.x], y: m.yCats[c.y], v: c.v })),
          backgroundColor: m.cells.map((c) => heatColor(m, c)),
          borderWidth: 0,
          borderRadius: m.radius,
          width: ({ chart }: { chart: Chart }) => Math.max(1, (chart.chartArea?.width ?? 0) / Math.max(1, m.xCats.length) - m.gap),
          height: ({ chart }: { chart: Chart }) => Math.max(1, (chart.chartArea?.height ?? 0) / Math.max(1, m.yCats.length) - m.gap),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: m.animate ? { duration: 500 } : false,
      layout: { padding: m.grid },
      scales: {
        x: { type: "category", labels: m.xCats, position: "top", offset: true, grid: { display: false }, border: { display: false }, ticks: { color: m.axisColor, font: font(m.xSize), maxRotation: 0, autoSkip: false, callback: (_: unknown, i: number) => m.xLabels[i] ?? "" } },
        y: { type: "category", labels: m.yCats, reverse: m.yInverse, offset: true, grid: { display: false }, border: { display: false }, ticks: { color: m.axisColor, font: font(m.ySize) } },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as unknown as ChartConfiguration;
}

/** Counts inside heat-map cells. */
const heatLabels = (get: () => ChartModel): Plugin => ({
  id: "heatLabels",
  afterDatasetsDraw(chart) {
    const m = get();
    if (m.kind !== "heatmap") return;
    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    m.cells.forEach((c, i) => {
      const el = meta.data[i] as unknown as { x: number; y: number; width: number; height: number } | undefined;
      if (!el || !c.label) return;
      ctx.save();
      ctx.fillStyle = c.label.color;
      ctx.font = `${c.label.weight} ${c.label.size}px ${m.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.v), el.x + el.width / 2, el.y + el.height / 2);
      ctx.restore();
    });
  },
});

/** Row charts: a track per row, then stacked parts or a dumbbell, names above and figures at the right. */
function rowsConfig(m: RowsModel): ChartConfiguration {
  const labels = m.rows.map((_, i) => String(i));
  const datasets: Record<string, unknown>[] = [
    { type: "bar", data: m.rows.map(() => m.max), backgroundColor: m.track, hoverBackgroundColor: m.track, borderRadius: m.trackWidth / 2, borderSkipped: false, barThickness: m.trackWidth, grouped: false, stack: "track", order: 3 },
  ];
  for (const b of m.bars ?? []) {
    datasets.push({
      type: "bar",
      label: b.name,
      data: b.data.map((d) => d.value),
      backgroundColor: b.data.map((d) => withAlpha(d.color, d.opacity)),
      borderRadius: b.data.map((d) => corners(d.radius)),
      borderSkipped: false,
      barThickness: b.width,
      grouped: false,
      stack: "parts",
      order: 2,
    });
  }
  const db = m.dumbbell;
  if (db) {
    datasets.push({ type: "bar", data: db.from.map((f, i) => [Math.min(f, db.to[i]), Math.max(f, db.to[i])]), backgroundColor: db.joins, borderRadius: db.width / 2, borderSkipped: false, barThickness: db.width, grouped: false, order: 2 });
    datasets.push({ type: "line", data: db.from, showLine: false, pointRadius: 4.5, pointHoverRadius: 5.5, pointBackgroundColor: db.fromColor, pointBorderColor: "#fff", pointBorderWidth: 2, order: 1 });
    datasets.push({ type: "line", data: db.to, showLine: false, pointRadius: 6, pointHoverRadius: 7, pointBackgroundColor: db.toColors, pointBorderColor: "#fff", pointBorderWidth: 2, order: 0 });
  }
  return {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: m.animate ? { duration: 650, easing: "easeOutCubic" } : false,
      layout: { padding: { top: m.grid.top, bottom: m.grid.bottom, left: 0, right: 0 } },
      interaction: { mode: "index", intersect: false, axis: "y" },
      scales: {
        x: { type: "linear", min: 0, max: m.max, display: false, stacked: !!m.bars },
        y: { type: "category", display: false, offset: true, stacked: !!m.bars },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as unknown as ChartConfiguration;
}

/** Row names above each bar, figures at the right end, small notes under the bar. */
const rowLabels = (get: () => ChartModel): Plugin => ({
  id: "rowLabels",
  afterDatasetsDraw(chart) {
    const m = get();
    if (m.kind !== "rows") return;
    const meta = chart.getDatasetMeta(0);
    const { ctx, chartArea } = chart;
    const t = m.text;
    m.rows.forEach((r, i) => {
      const el = meta.data[i] as unknown as { y: number } | undefined;
      if (!el) return;
      const y = el.y - m.trackWidth / 2 - 6;
      ctx.save();
      ctx.textBaseline = "alphabetic";
      ctx.font = `${t.rightWeight} ${t.rightSize}px ${m.font}`;
      ctx.fillStyle = t.right;
      ctx.textAlign = "right";
      ctx.fillText(r.right, chartArea.right, y);
      const rightW = ctx.measureText(r.right).width;
      ctx.textAlign = "left";
      let x = chartArea.left;
      if (r.dot) {
        ctx.fillStyle = r.dot;
        ctx.beginPath();
        ctx.arc(x + 4, y - 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
        x += 13;
      }
      ctx.font = `${t.nameSize}px ${m.font}`;
      ctx.fillStyle = t.name;
      const room = chartArea.right - rightW - 12 - x;
      let name = r.name;
      while (name.length > 1 && ctx.measureText(name).width > room) name = name.slice(0, -2);
      if (name !== r.name) name = `${name.trimEnd()}…`;
      ctx.fillText(name, x, y);
      if (r.tag) {
        const nx = x + ctx.measureText(name).width + 10;
        ctx.font = `${t.tagSize}px ${m.font}`;
        ctx.fillStyle = t.tag;
        if (nx < chartArea.right - rightW - 30) ctx.fillText(r.tag, nx, y);
      }
      if (r.sub) {
        ctx.font = `11px ${m.font}`;
        ctx.fillStyle = t.sub;
        ctx.textBaseline = "top";
        ctx.fillText(r.sub, chartArea.left, el.y + m.trackWidth / 2 + 4);
      }
      ctx.restore();
    });
  },
});

const configFor = (m: ChartModel): ChartConfiguration =>
  m.kind === "pie" ? pieConfig(m) : m.kind === "gauge" ? gaugeConfig(m) : m.kind === "heatmap" ? heatConfig(m) : m.kind === "rows" ? rowsConfig(m) : cartesianConfig(m);

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
  const shape = `${model.kind}:${
    model.kind === "cartesian" ? `${model.horizontal}:${model.series.map((s) => s.type).join(",")}` : model.kind === "rows" ? `${!!model.dumbbell}:${model.bars?.length ?? 0}` : ""
  }`;
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const m = modelRef.current;
    const cfg = configFor(m);
    // The plugins read the latest model, so new data never needs them rebuilt.
    const latest = () => modelRef.current;
    if (m.kind === "cartesian") cfg.plugins = [barLabels(latest), pointer(latest)];
    if (m.kind === "heatmap") cfg.plugins = [heatLabels(latest)];
    if (m.kind === "rows") cfg.plugins = [rowLabels(latest)];
    let hovered: string | null = null;
    const describe = (els: ActiveElement[]) => {
      const e = els[0];
      if (!e) return null;
      const mm = modelRef.current;
      const seriesName = mm.kind === "cartesian" ? mm.series[e.datasetIndex]?.name : undefined;
      const name =
        mm.kind === "pie" ? mm.slices[e.index]?.name : mm.kind === "cartesian" ? mm.categories[e.index] : mm.kind === "rows" ? mm.rows[e.index]?.name : mm.kind === "heatmap" ? mm.xCats[mm.cells[e.index]?.x ?? -1] : undefined;
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
        const clickable = mm.kind === "pie" || mm.kind === "rows" ? mm.clickable : mm.kind === "cartesian" ? mm.series[d?.seriesIndex ?? -1]?.clickable : false;
        node.style.cursor = d && clickable ? "pointer" : "default";
        const ne = evt.native as MouseEvent | null;
        const tipBase = mm.kind === "gauge" ? null : mm.tip;
        if (d && tipBase && ne) tip.current.show(tipHTML(mm, d.dataIndex, d.seriesIndex), tipBase, ne.clientX, ne.clientY);
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
    const fresh = configFor(model);
    c.data = fresh.data;
    Object.assign(c.options, { scales: fresh.options?.scales, layout: fresh.options?.layout, animation: fresh.options?.animation });
    c.update();
  }, [model]);

  return <canvas ref={canvas} role="presentation" />;
}
