// The one look every chart shares: palette, ink, grid, tooltip and motion. Colours live as CSS
// tokens (globals.css, --color-chart-*) so light and dark each get their own validated steps;
// charts read the live values when they draw, and again when the theme changes.

export const CHART_COLORS = ["emerald", "blue", "gold", "violet", "coral", "cyan", "red", "neutral"] as const;
export type ChartColorKey = (typeof CHART_COLORS)[number];
/** A palette name (preferred) or, for one-offs, a hex colour. */
export type ChartColor = ChartColorKey | (string & {});

/** Categorical order: give series these in turn, never cycled past the end. */
export const SERIES_ORDER: ChartColorKey[] = ["emerald", "blue", "gold", "violet", "coral", "cyan"];

/** Older hard-coded colours, folded onto the palette so every chart matches. (The dark brand card
 *  keeps its own bright gold and mint, so those two are left out.) */
const LEGACY: Record<string, ChartColorKey> = {
  "#167d63": "emerald", "#059669": "emerald", "#16a37a": "emerald", "#10b981": "emerald", "#34d399": "emerald", "#5cc90a": "emerald", "#15803d": "emerald", "#11704c": "emerald",
  "#0ea5e9": "blue", "#0284c7": "blue", "#1d64a8": "blue", "#4f93d8": "blue", "#2a78d6": "blue",
  "#00b8d4": "cyan", "#14b8a6": "cyan",
  "#d4a514": "gold", "#d97706": "gold", "#f59e0b": "gold", "#b7791f": "gold", "#ff8a00": "gold",
  "#6941c6": "violet", "#7c3aed": "violet", "#9333ea": "violet", "#a78bfa": "violet", "#6366f1": "violet",
  "#f97316": "coral",
  "#e11d48": "red", "#c93636": "red", "#e8104a": "red", "#fb7185": "red", "#dc2626": "red",
  "#94a3b8": "neutral", "#cbd5e1": "neutral", "#98a2b3": "neutral", "#d0d5dd": "neutral", "#64748b": "neutral", "#8b95a5": "neutral",
};

const isKey = (c: string): c is ChartColorKey => (CHART_COLORS as readonly string[]).includes(c);

/** The palette key a colour stands for, if any. */
export function colorKey(c: ChartColor): ChartColorKey | null {
  if (isKey(c)) return c;
  return LEGACY[c.toLowerCase()] ?? null;
}

/** For HTML (legends, swatches): a CSS value that follows the theme. */
export function cssColor(c: ChartColor) {
  const k = colorKey(c);
  return k ? `var(--color-chart-${k})` : c;
}

export type ChartTheme = {
  dark: boolean;
  color: (c: ChartColor) => string;
  ink: string;
  ink2: string;
  muted: string;
  axis: string;
  grid: string;
  track: string;
  surface: string;
  font: string;
  animate: boolean;
};

const FALLBACK: Record<ChartColorKey, [string, string]> = {
  emerald: ["#12936e", "#1fa47c"],
  blue: ["#2a78d6", "#4189e2"],
  gold: ["#e3a008", "#b88a12"],
  violet: ["#7a5af0", "#8670e6"],
  coral: ["#e5603b", "#da6640"],
  cyan: ["#0f9fb5", "#169aae"],
  red: ["#d03b3b", "#e05656"],
  neutral: ["#b8c1cc", "#4a5465"],
};

/** Reads the live tokens. `forceDark` is for charts that always sit on the dark brand card. */
export function readChartTheme(forceDark = false): ChartTheme {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const pageDark = Boolean(root?.classList.contains("dark"));
  const dark = forceDark || pageDark;
  const css = root ? getComputedStyle(root) : null;
  const v = (name: string, fallback: string) => (css?.getPropertyValue(name).trim() || fallback);
  // A dark card on a light page can't use the page's tokens: it gets the dark steps directly.
  const useTokens = dark === pageDark;
  const palette = Object.fromEntries(
    CHART_COLORS.map((k) => [k, useTokens ? v(`--color-chart-${k}`, FALLBACK[k][dark ? 1 : 0]) : FALLBACK[k][dark ? 1 : 0]]),
  ) as Record<ChartColorKey, string>;
  const pick = (name: string, light: string, darkVal: string) => (useTokens ? v(name, dark ? darkVal : light) : dark ? darkVal : light);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    dark,
    color: (c) => {
      const k = colorKey(c);
      return k ? palette[k] : c;
    },
    ink: pick("--color-ink", "#111827", "#e8ebf1"),
    ink2: pick("--color-ink-2", "#344054", "#c4cad5"),
    muted: pick("--color-muted", "#667085", "#939cac"),
    axis: pick("--color-chart-axis", "#8b95a5", "#6b7586"),
    grid: pick("--color-chart-grid", "#edf0f4", "#1f2630"),
    track: forceDark && !pageDark ? "rgba(255,255,255,0.08)" : pick("--color-track", "#eef1f5", "#222a35"),
    surface: forceDark && !pageDark ? "#171b24" : pick("--color-panel", "#ffffff", "#131922"),
    font: (css?.fontFamily || "").trim() || "Inter, system-ui, sans-serif",
    animate: !reduce,
  };
}

/** A colour at some opacity, for tracks and washes of a series' own hue. */
export function alpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Names come from customers and products: always escape before they go into tooltip HTML. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** The shared tooltip: one dark card with a title and coloured rows, the same on every chart. */
export function tipHTML(title: string, rows: { color?: string; label: string; value: string }[], foot?: string) {
  const row = (r: (typeof rows)[number]) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px">` +
    `<span style="display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.78)">` +
    (r.color ? `<span style="width:8px;height:8px;border-radius:3px;background:${r.color};flex:none"></span>` : "") +
    `${esc(r.label)}</span><b style="font-weight:600;font-variant-numeric:tabular-nums">${esc(r.value)}</b></div>`;
  return (
    `<div style="min-width:148px;max-width:260px">` +
    (title ? `<div style="font-weight:600;color:#fff;white-space:normal">${esc(title)}</div>` : "") +
    rows.map(row).join("") +
    (foot ? `<div style="margin-top:6px;color:rgba(255,255,255,.6);font-size:11px;white-space:normal">${esc(foot)}</div>` : "") +
    `</div>`
  );
}

/** ECharts tooltip settings shared by every chart. */
export function tooltipBase(t: ChartTheme) {
  return {
    confine: true,
    appendTo: () => document.body,
    backgroundColor: "#171b24",
    borderWidth: 0,
    padding: [9, 12],
    textStyle: { color: "#fff", fontSize: 12, fontFamily: t.font },
    extraCssText: "border-radius:12px;box-shadow:0 12px 32px -8px rgba(16,24,40,.45),0 0 0 1px rgba(255,255,255,.06);",
    transitionDuration: 0.15,
  };
}

/** Grow-in motion: quick, eased, a touch of stagger. Off with reduced motion. */
export function motion(t: ChartTheme, stagger = 40) {
  return t.animate
    ? { animation: true, animationDuration: 650, animationEasing: "cubicOut" as const, animationDelay: (i: number) => i * stagger, animationDurationUpdate: 400 }
    : { animation: false };
}
