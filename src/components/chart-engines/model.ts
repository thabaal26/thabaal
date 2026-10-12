/* eslint-disable @typescript-eslint/no-explicit-any -- reads loosely typed ECharts options */

/*
 * One chart description, many libraries. Every portal chart is written once as an ECharts option
 * (components/charts.tsx, viz.tsx). When a portal picks Recharts or Chart.js (lib/appearance.ts),
 * the option is read into this small neutral model, which those libraries draw: lines, columns and
 * donuts; gauges and rings; heat maps; and the portal's row charts (bar lists, stacked rows and
 * dumbbells, recognised by their label rows). Anything else returns null and stays on ECharts, so
 * nothing is ever drawn wrong.
 */

export type Tip = {
  trigger: "axis" | "item";
  formatter?: (params: any) => string;
  bg: string;
  color: string;
  font: string;
  padding: string;
  css: string;
};

export type Datum = {
  value: number;
  color: string;
  opacity: number;
  /** Corner radius: one number, or [top-left, top-right, bottom-right, bottom-left]. */
  radius: number | number[];
  borderColor?: string;
  borderWidth: number;
  /** A value label drawn at the end of the bar. */
  label?: { text: string; color: string; size: number; weight: number };
};

export type MSeries = {
  name: string;
  type: "line" | "bar";
  data: Datum[];
  color: string;
  stack?: string;
  smooth: boolean;
  lineWidth: number;
  dashed: boolean;
  showSymbol: boolean;
  /** Area under a line: colour at the line and at the axis. */
  area?: { top: string; bottom: string };
  barWidth?: number;
  barMax?: number;
  clickable: boolean;
};

export type Cartesian = {
  kind: "cartesian";
  /** Categories run down the side (horizontal bars). */
  horizontal: boolean;
  categories: string[];
  /** The label under each category ("" hides it); a list is several lines. */
  catLabels: (string | string[])[];
  autoSkip: boolean;
  catInverse: boolean;
  boundaryGap: boolean;
  showCatAxis: boolean;
  showCatLine: boolean;
  showValAxis: boolean;
  showGrid: boolean;
  valMin?: number;
  valMax?: number;
  valTicks?: number;
  integer: boolean;
  valFormat?: (v: number) => string;
  grid: { top: number; right: number; bottom: number; left: number };
  axisColor: string;
  gridColor: string;
  fontSize: number;
  series: MSeries[];
  tip: Tip | null;
  pointer: "line" | "shadow" | "none";
  pointerColor: string;
  animate: boolean;
  font: string;
};

export type PieModel = {
  kind: "pie";
  slices: { name: string; value: number; color: string; tip: boolean }[];
  inner: number;
  outer: number;
  startAngle: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  tip: Tip | null;
  clickable: boolean;
  animate: boolean;
  font: string;
};

export type GaugeModel = {
  kind: "gauge";
  /** 0–100. */
  value: number;
  /** ECharts angles: degrees anticlockwise from 3 o'clock; the arc runs clockwise from start to end. */
  start: number;
  end: number;
  /** Outer radius as a percent of half the box. */
  radius: number;
  width: number;
  color: string;
  track: string;
  roundCap: boolean;
  w: number;
  h: number;
  animate: boolean;
  font: string;
};

export type HeatCell = { x: number; y: number; v: number; color?: string; label?: { color: string; size: number; weight: number } };
export type HeatModel = {
  kind: "heatmap";
  xCats: string[];
  yCats: string[];
  xLabels: string[];
  /** The first row sits at the top (ECharts' inverse y axis). */
  yInverse: boolean;
  cells: HeatCell[];
  min: number;
  max: number;
  low: string;
  high: string;
  gap: number;
  radius: number;
  surface: string;
  axisColor: string;
  xSize: number;
  ySize: number;
  grid: { top: number; right: number; bottom: number; left: number };
  tip: Tip | null;
  w: number;
  h: number;
  animate: boolean;
  font: string;
};

export type RowLabel = { name: string; tag?: string; dot?: string; right: string; sub?: string };
export type RowsModel = {
  kind: "rows";
  rows: RowLabel[];
  max: number;
  track: string;
  trackWidth: number;
  text: { name: string; tag: string; right: string; sub: string; nameSize: number; tagSize: number; rightSize: number; rightWeight: number };
  /** Stacked parts (bar lists have one). */
  bars?: { name: string; width: number; data: { value: number; color: string; opacity: number; radius: number | number[] }[] }[];
  /** First and latest value per row, joined by a bar. */
  dumbbell?: { from: number[]; to: number[]; fromColor: string; toColors: string[]; joins: string[]; width: number };
  grid: { top: number; bottom: number };
  tip: Tip | null;
  clickable: boolean;
  w: number;
  h: number;
  animate: boolean;
  font: string;
};

export type ChartModel = Cartesian | PieModel | GaugeModel | HeatModel | RowsModel;

const first = (x: any) => (Array.isArray(x) ? x[0] : x);
const num = (x: any, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const px = (x: any, d: number) => (typeof x === "number" ? x : d);
const pct = (x: any, d: number) => (typeof x === "string" && x.endsWith("%") ? parseFloat(x) : typeof x === "number" ? x : d);

/** A solid colour from an ECharts colour (string or gradient). */
function solid(c: any, fallback: string): string {
  if (typeof c === "string") return c;
  if (c && Array.isArray(c.colorStops) && c.colorStops.length) return c.colorStops[0].color;
  return fallback;
}

/** "{a|Mon}\n{b|7 Oct}" → ["Mon", "7 Oct"]: ECharts rich-text markup to plain lines. */
export function plain(s: unknown): string | string[] {
  const t = String(s ?? "").replace(/\{\w+\|([^}]*)\}/g, "$1");
  const lines = t.split("\n");
  return lines.length > 1 ? lines : t;
}

function tipOf(o: any): Tip | null {
  const t = o?.tooltip;
  if (!t || t.show === false) return null;
  const pad = Array.isArray(t.padding) ? t.padding.map((p: number) => `${p}px`).join(" ") : `${num(t.padding, 8)}px`;
  return {
    trigger: t.trigger === "axis" ? "axis" : "item",
    formatter: typeof t.formatter === "function" ? t.formatter : undefined,
    bg: t.backgroundColor ?? "#171b24",
    color: t.textStyle?.color ?? "#fff",
    font: `${t.textStyle?.fontSize ?? 12}px ${t.textStyle?.fontFamily ?? "inherit"}`,
    padding: pad,
    css: typeof t.extraCssText === "string" ? t.extraCssText : "",
  };
}

const SUPPORTED = new Set(["line", "bar", "pie"]);

function gaugeModel(o: any, s: any, size: { width: number; height: number }): GaugeModel {
  const track = Array.isArray(s.axisLine?.lineStyle?.color) ? s.axisLine.lineStyle.color[0]?.[1] : s.axisLine?.lineStyle?.color;
  const d = Array.isArray(s.data) ? s.data[0] : undefined;
  const v = num(typeof d === "object" ? d?.value : d);
  return {
    kind: "gauge",
    value: s.progress?.show === false ? 0 : Math.max(0, Math.min(100, ((v - num(s.min, 0)) / Math.max(1e-9, num(s.max, 100) - num(s.min, 0))) * 100)),
    start: num(s.startAngle, 225),
    end: num(s.endAngle, -45),
    radius: pct(s.radius, 75),
    width: num(s.progress?.width, 10),
    color: solid(s.progress?.itemStyle?.color, "#2a78d6"),
    track: solid(track, "#eef1f5"),
    roundCap: !!s.progress?.roundCap,
    w: size.width,
    h: size.height,
    animate: o.animation !== false,
    font: o.textStyle?.fontFamily ?? "inherit",
  };
}

function heatModel(o: any, s: any, size: { width: number; height: number }): HeatModel | null {
  const xa = first(o.xAxis) ?? {};
  const ya = first(o.yAxis) ?? {};
  if (xa.type !== "category" || ya.type !== "category") return null;
  const xCats = (xa.data ?? []).map(String);
  const yCats = (ya.data ?? []).map(String);
  const vm = first(o.visualMap) ?? {};
  const range = vm.inRange?.color ?? [];
  const xf = xa.axisLabel?.formatter;
  const g = o.grid ?? {};
  return {
    kind: "heatmap",
    xCats,
    yCats,
    xLabels: xCats.map((c: string, i: number) => String(plain(typeof xf === "function" ? xf(c, i) : c))),
    yInverse: !!ya.inverse,
    cells: (s.data ?? []).map((d: any) => {
      const val = Array.isArray(d) ? d : d.value;
      const lab = d?.label;
      return {
        x: num(val[0]),
        y: num(val[1]),
        v: num(val[2]),
        color: typeof d?.itemStyle?.color === "string" ? d.itemStyle.color : undefined,
        label: lab?.show ? { color: lab.color ?? "#344054", size: num(lab.fontSize, 11), weight: num(lab.fontWeight, 600) } : undefined,
      };
    }),
    min: num(vm.min, 0),
    max: num(vm.max, 1),
    low: solid(range[0], "#eef1f5"),
    high: solid(range[range.length - 1], "#12936e"),
    gap: num(s.itemStyle?.borderWidth, 2),
    radius: num(s.itemStyle?.borderRadius, 4),
    surface: solid(s.itemStyle?.borderColor, "#ffffff"),
    axisColor: solid(xa.axisLabel?.color ?? ya.axisLabel?.color, "#667085"),
    xSize: num(xa.axisLabel?.fontSize, 10),
    ySize: num(ya.axisLabel?.fontSize, 11),
    grid: { top: px(g.top, 4), right: px(g.right, 2), bottom: px(g.bottom, 2), left: px(g.left, 2) },
    tip: tipOf(o),
    w: size.width,
    h: size.height,
    animate: o.animation !== false,
    font: o.textStyle?.fontFamily ?? "inherit",
  };
}

const rich = (f: unknown, key: string) => {
  const m = String(f ?? "").match(new RegExp(`\\{${key}\\|([^}]*)\\}`));
  return m ? m[1] : undefined;
};

/** The portal's row charts (viz.tsx rowLabels): a label row of names, a row of figures, then the bars. */
function rowsModel(o: any, series: any[], size: { width: number; height: number }): RowsModel | null {
  const [names, rights, ...rest] = series;
  if (!names || !rights || !Array.isArray(names.data)) return null;
  const n0 = names.data[0]?.label ?? {};
  const r0 = rights.data?.[0]?.label ?? {};
  const rows: RowLabel[] = names.data.map((d: any, i: number) => {
    const f = d?.label?.formatter;
    return {
      name: rich(f, "n") ?? String(plain(f)),
      tag: rich(f, "t"),
      dot: rich(f, "d") ? d.label.rich?.d?.color : undefined,
      right: String(rights.data?.[i]?.label?.formatter ?? ""),
    };
  });
  const xa = first(o.xAxis) ?? {};
  const g = o.grid ?? {};
  const base = {
    kind: "rows" as const,
    rows,
    max: num(xa.max, 1),
    track: solid(names.itemStyle?.color, "#eef1f5"),
    trackWidth: num(names.barWidth, 8),
    text: {
      name: solid(n0.rich?.n?.color, "#344054"),
      tag: solid(n0.rich?.t?.color, "#667085"),
      right: solid(r0.color, "#111827"),
      sub: "#667085",
      nameSize: num(n0.rich?.n?.fontSize, 13),
      tagSize: num(n0.rich?.t?.fontSize, 11),
      rightSize: num(r0.fontSize, 12.5),
      rightWeight: num(r0.fontWeight, 600),
    },
    grid: { top: px(g.top, 22), bottom: px(g.bottom, 6) },
    tip: tipOf(o),
    clickable: names.cursor === "pointer",
    w: size.width,
    h: size.height,
    animate: o.animation !== false,
    font: o.textStyle?.fontFamily ?? "inherit",
  };
  const scatters = rest.filter((s) => s.type === "scatter");
  const bars = rest.filter((s) => s.type === "bar");
  if (scatters.length === 2) {
    const join = bars.find((b) => b.itemStyle?.color !== "transparent") ?? bars[bars.length - 1];
    return {
      ...base,
      dumbbell: {
        from: (scatters[0].data ?? []).map((d: any) => num(Array.isArray(d) ? d[0] : d?.value?.[0])),
        to: (scatters[1].data ?? []).map((d: any) => num(Array.isArray(d) ? d[0] : d?.value?.[0])),
        fromColor: solid(scatters[0].itemStyle?.color, "#98a2b3"),
        toColors: (scatters[1].data ?? []).map((d: any) => solid(d?.itemStyle?.color ?? scatters[1].itemStyle?.color, "#12936e")),
        joins: (join?.data ?? []).map((d: any) => solid(d?.itemStyle?.color ?? join?.itemStyle?.color, "#98a2b3")),
        width: num(join?.barWidth, 4),
      },
    };
  }
  if (!bars.length || scatters.length) return null;
  const subs = bars[0].data?.map((d: any) => (d?.label?.show && typeof d.label.formatter === "string" ? d.label.formatter : undefined)) ?? [];
  if (subs.some(Boolean)) {
    base.rows = rows.map((r, i) => ({ ...r, sub: subs[i] }));
    base.text.sub = solid(bars[0].data.find((d: any) => d?.label?.show)?.label?.color, "#667085");
  }
  return {
    ...base,
    bars: bars.map((b) => ({
      name: String(b.name ?? ""),
      width: num(b.barWidth, 8),
      data: (b.data ?? []).map((d: any) => {
        const obj = d !== null && typeof d === "object" ? d : null;
        const st = { ...(b.itemStyle ?? {}), ...(obj?.itemStyle ?? {}) };
        return { value: num(obj ? obj.value : d), color: solid(st.color, "#12936e"), opacity: num(st.opacity, 1), radius: Array.isArray(st.borderRadius) ? st.borderRadius : num(st.borderRadius, 0) };
      }),
    })),
  };
}

/** The neutral model of an ECharts option, or null when only ECharts can draw it well. */
export function toModel(o: any, size: { width: number; height: number } = { width: 300, height: 200 }): ChartModel | null {
  if (!o || typeof o !== "object") return null;
  const series: any[] = Array.isArray(o.series) ? o.series : o.series ? [o.series] : [];
  if (series.length === 1 && series[0]?.type === "gauge") return gaugeModel(o, series[0], size);
  if (series.length === 1 && series[0]?.type === "heatmap") return heatModel(o, series[0], size);
  if (first(o.yAxis)?.type === "category" && series[0]?.type === "bar" && series[0]?.barGap === "-100%" && Array.isArray(series[0]?.data?.[0]?.label?.position)) {
    return rowsModel(o, series, size);
  }
  if (!series.length || series.some((s) => !SUPPORTED.has(s?.type))) return null;
  if (o.polar || o.radar || o.visualMap || o.geo || o.parallel) return null;
  const font = o.textStyle?.fontFamily ?? "inherit";
  const animate = o.animation !== false;

  if (series.some((s) => s.type === "pie")) {
    if (series.length !== 1) return null;
    const s = series[0];
    const [rIn, rOut] = Array.isArray(s.radius) ? s.radius : [0, s.radius ?? "75%"];
    const data: any[] = Array.isArray(s.data) ? s.data : [];
    return {
      kind: "pie",
      slices: data.map((d, i) => ({
        name: String(d?.name ?? i),
        value: num(typeof d === "object" ? d.value : d),
        color: solid(d?.itemStyle?.color ?? s.itemStyle?.color, "#98a2b3"),
        tip: d?.tooltip?.show !== false,
      })),
      inner: pct(rIn, 0),
      outer: pct(rOut, 75),
      startAngle: num(s.startAngle, 90),
      borderColor: solid(s.itemStyle?.borderColor, "#fff"),
      borderWidth: num(s.itemStyle?.borderWidth, 0),
      radius: num(s.itemStyle?.borderRadius, 0),
      tip: tipOf(o),
      clickable: s.cursor === "pointer",
      animate,
      font,
    };
  }

  const xAxis = first(o.xAxis) ?? {};
  const yAxis = first(o.yAxis) ?? {};
  const horizontal = yAxis.type === "category";
  const cat = horizontal ? yAxis : xAxis;
  const val = horizontal ? xAxis : yAxis;
  if (cat.type !== "category" || (val.type && val.type !== "value")) return null;
  const categories: string[] = (Array.isArray(cat.data) ? cat.data : []).map((c: any) => String(typeof c === "object" ? c?.value : c));

  const out: MSeries[] = [];
  for (const [si, s] of series.entries()) {
    // Overlapping bars (barGap -100%) are track + bar or label rows: ECharts only.
    if (s.barGap === "-100%" || s.markArea || s.coordinateSystem === "polar") return null;
    const fallback = ["#167d63", "#4189e2", "#eabf26", "#8670e6"][si % 4];
    const base = solid(s.lineStyle?.color ?? s.itemStyle?.color ?? s.color, fallback);
    const rawData: any[] = Array.isArray(s.data) ? s.data : [];
    const data: Datum[] = [];
    for (const [i, d] of rawData.entries()) {
      const obj = d !== null && typeof d === "object" && !Array.isArray(d) ? d : null;
      const value = num(obj ? obj.value : d);
      const style = { ...(s.itemStyle ?? {}), ...(obj?.itemStyle ?? {}) };
      const colorFn = typeof style.color === "function" ? style.color({ dataIndex: i, value, name: categories[i], seriesIndex: si }) : style.color;
      const lab = { ...(s.label ?? {}), ...(obj?.label ?? {}) };
      let label: Datum["label"];
      if (lab.show) {
        // Only labels at the bar's end translate; placed or rich labels need ECharts.
        if (s.type !== "bar" || !["top", "right", undefined].includes(lab.position) || lab.rich) return null;
        const f = lab.formatter;
        const text = typeof f === "function" ? f({ dataIndex: i, value, name: categories[i], seriesIndex: si, seriesName: s.name }) : typeof f === "string" ? f.replace("{c}", String(value)) : String(value);
        label = { text: String(text), color: lab.color ?? "#344054", size: num(lab.fontSize, 10), weight: num(lab.fontWeight === "bold" ? 700 : lab.fontWeight, 400) };
      }
      data.push({
        value,
        color: solid(colorFn, base),
        opacity: num(style.opacity, 1),
        radius: Array.isArray(style.borderRadius) ? style.borderRadius : num(style.borderRadius, 0),
        borderColor: typeof style.borderColor === "string" ? style.borderColor : undefined,
        borderWidth: num(style.borderWidth, 0),
        label,
      });
    }
    const area = s.areaStyle
      ? (() => {
          const c = s.areaStyle.color;
          if (c && Array.isArray(c.colorStops) && c.colorStops.length) return { top: c.colorStops[0].color, bottom: c.colorStops[c.colorStops.length - 1].color };
          const one = solid(c, base);
          return { top: one, bottom: one };
        })()
      : undefined;
    out.push({
      name: String(s.name ?? `Series ${si + 1}`),
      type: s.type,
      data,
      color: base,
      stack: s.stack,
      smooth: !!s.smooth,
      lineWidth: num(s.lineStyle?.width, 2),
      dashed: s.lineStyle?.type === "dashed",
      showSymbol: s.showSymbol !== false && s.symbol !== "none",
      area,
      barWidth: typeof s.barWidth === "number" ? s.barWidth : undefined,
      barMax: typeof s.barMaxWidth === "number" ? s.barMaxWidth : undefined,
      clickable: s.cursor === "pointer",
    });
  }

  // Which category labels show: every one, every nth, or the ones a function picks.
  const al = cat.axisLabel ?? {};
  const interval = al.interval;
  const fmt = al.formatter;
  const catLabels = categories.map((c, i) => {
    const shown = typeof interval === "function" ? !!interval(i, c) : typeof interval === "number" ? i % (interval + 1) === 0 : true;
    if (!shown) return "";
    const text = typeof fmt === "function" ? fmt(c, i) : typeof fmt === "string" ? fmt.replace("{value}", c) : c;
    return plain(text);
  });

  const vf = val.axisLabel?.formatter;
  const g = o.grid ?? {};
  const t = tipOf(o);
  const ap = o.tooltip?.axisPointer;
  return {
    kind: "cartesian",
    horizontal,
    categories,
    catLabels,
    autoSkip: interval === "auto" || interval === undefined,
    catInverse: !!cat.inverse,
    boundaryGap: cat.boundaryGap !== false,
    showCatAxis: cat.show !== false && al.show !== false,
    showCatLine: cat.show !== false && cat.axisLine?.show !== false,
    showValAxis: val.show !== false && val.axisLabel?.show !== false,
    showGrid: val.show !== false && val.splitLine?.show !== false,
    valMin: typeof val.min === "number" ? val.min : undefined,
    valMax: typeof val.max === "number" ? val.max : undefined,
    valTicks: typeof val.splitNumber === "number" ? val.splitNumber + 1 : undefined,
    integer: val.minInterval === 1,
    valFormat: typeof vf === "function" ? (v: number) => String(vf(v)) : typeof vf === "string" ? (v: number) => vf.replace("{value}", String(v)) : undefined,
    grid: { top: px(g.top, 12), right: px(g.right, 8), bottom: px(g.bottom, 8), left: px(g.left, 8) },
    axisColor: solid(al.color ?? val.axisLabel?.color, "#98a2b3"),
    gridColor: solid(val.splitLine?.lineStyle?.color ?? cat.axisLine?.lineStyle?.color, "#e2e6ec"),
    fontSize: num(al.fontSize ?? val.axisLabel?.fontSize, 10),
    series: out,
    tip: t,
    pointer: ap?.type === "shadow" ? "shadow" : t?.trigger === "axis" ? "line" : "none",
    pointerColor: solid(ap?.lineStyle?.color ?? ap?.shadowStyle?.color, "rgba(16,24,40,.25)"),
    animate,
    font,
  };
}

/** A coloured dot, as ECharts passes it to tooltip formatters. */
export const marker = (color: string) =>
  `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`;

/** The tooltip HTML for the hovered point(s), using the chart's own formatter when it has one. */
export function tipHTML(m: ChartModel, index: number, seriesIndex?: number): string {
  if (m.kind === "gauge" || !m.tip) return "";
  if (m.kind === "heatmap") {
    const c = m.cells[index];
    if (!c) return "";
    const p = { dataIndex: index, value: [c.x, c.y, c.v], data: c, color: heatColor(m, c) };
    return m.tip.formatter ? m.tip.formatter(p) : `${esc(m.yCats[c.y] ?? "")} · ${esc(m.xCats[c.x] ?? "")}: <b>${c.v}</b>`;
  }
  if (m.kind === "rows") {
    const r = m.rows[index];
    if (!r) return "";
    return m.tip.formatter ? m.tip.formatter({ dataIndex: index, name: r.name }) : `${esc(r.name)}: <b>${esc(r.right)}</b>`;
  }
  if (m.kind === "pie") {
    const s = m.slices[index];
    if (!s || !s.tip) return "";
    const total = m.slices.reduce((n, x) => n + x.value, 0);
    const p = { dataIndex: index, seriesIndex: 0, name: s.name, value: s.value, color: s.color, marker: marker(s.color), percent: total ? (s.value / total) * 100 : 0, data: s };
    return m.tip.formatter ? m.tip.formatter(p) : `${marker(s.color)}${esc(s.name)}: <b>${s.value}</b>`;
  }
  const cat = m.categories[index] ?? "";
  const make = (s: MSeries, si: number) => ({
    dataIndex: index,
    seriesIndex: si,
    seriesName: s.name,
    name: cat,
    axisValue: cat,
    axisValueLabel: cat,
    value: s.data[index]?.value,
    data: s.data[index],
    color: s.data[index]?.color ?? s.color,
    marker: marker(s.data[index]?.color ?? s.color),
  });
  if (m.tip.trigger === "axis") {
    const ps = m.series.map(make);
    return m.tip.formatter ? m.tip.formatter(ps) : `<b>${esc(cat)}</b>` + ps.map((p) => `<br>${p.marker}${esc(p.seriesName)}: <b>${p.value}</b>`).join("");
  }
  const si = seriesIndex ?? 0;
  const s = m.series[si];
  if (!s) return "";
  const p = make(s, si);
  return m.tip.formatter ? m.tip.formatter(p) : `${p.marker}${esc(s.name)}: <b>${p.value}</b>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Applies an opacity to a colour (hex or rgb). */
export function withAlpha(color: string, a: number): string {
  if (a >= 1) return color;
  if (color.startsWith("#")) {
    const h = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : color;
    const n = parseInt(h.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(/[ ,/]+/);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

/** A floating tooltip on <body>, styled like the ECharts ones (shared by the other engines). */
export function floatingTip() {
  let el: HTMLDivElement | null = null;
  return {
    show(html: string, t: Tip, x: number, y: number) {
      if (!html) return this.hide();
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("role", "tooltip");
        document.body.appendChild(el);
      }
      el.style.cssText = `position:fixed;z-index:9999;pointer-events:none;left:0;top:0;background:${t.bg};color:${t.color};font:${t.font};padding:${t.padding};white-space:nowrap;${t.css}`;
      el.innerHTML = html;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
      const top = y - h - 12 < 8 ? y + 16 : y - h - 12;
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.min(top, window.innerHeight - h - 8))}px)`;
    },
    hide() {
      if (el) el.style.display = "none";
    },
    destroy() {
      el?.remove();
      el = null;
    },
  };
}

/** A colour as [r, g, b, a] (hex, rgb or rgba). */
function rgba(c: string): [number, number, number, number] {
  if (c.startsWith("#")) {
    const h = c.length === 4 ? c.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : c;
    const n = parseInt(h.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1].split(/[ ,/]+/).map(Number);
    return [r, g, b, Number.isFinite(a) ? a : 1];
  }
  return [0, 0, 0, 1];
}

/** A heat-map cell's colour: its own (empty cells), else between the low and high colours. */
export function heatColor(m: HeatModel, c: HeatCell): string {
  if (c.color) return c.color;
  const t = Math.max(0, Math.min(1, (c.v - m.min) / Math.max(1e-9, m.max - m.min)));
  const a = rgba(m.low);
  const b = rgba(m.high);
  const mix = a.map((x, i) => x + (b[i] - x) * t);
  return `rgba(${Math.round(mix[0])},${Math.round(mix[1])},${Math.round(mix[2])},${mix[3].toFixed(3)})`;
}

/** ECharts' gauge angles (anticlockwise from 3 o'clock) as the arc's sweep in degrees. */
export const sweep = (g: GaugeModel) => ((g.start - g.end) % 360 + 360) % 360 || 360;
