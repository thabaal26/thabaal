// Pure chart helpers, shared by server components and the client chart kit (components/charts.tsx).

export type Pt = [number, number];

/**
 * A smooth line through the points that never overshoots them (monotone cubic, Fritsch–Carlson),
 * so a curve between two zero days stays on the axis instead of dipping below it.
 */
export function smoothPath(pts: Pt[]) {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0;
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    d += ` C${x0 + dx[i] / 3},${y0 + (t[i] * dx[i]) / 3} ${x1 - dx[i] / 3},${y1 - (t[i + 1] * dx[i]) / 3} ${x1},${y1}`;
  }
  return d;
}

/** A clean axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above the largest value. */
export function niceMax(n: number) {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= n) ?? 10 * p;
}

export type ValueFormat = "count" | "inr" | "percent";

export function formatValue(v: number, f: ValueFormat = "count") {
  if (f === "inr") {
    const hasPaise = Math.abs(v) > 0 && Math.abs(v) < 100 && Math.round(v * 100) % 100 !== 0;
    return hasPaise
      ? `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `₹${Math.round(v).toLocaleString("en-IN")}`;
  }
  if (f === "percent") return `${Math.round(v * 10) / 10}%`;
  return Math.round(v).toLocaleString("en-IN");
}

/** Short figures for axes and bar ends: 950, 1.2k, 3.4L (lakh), 1.1Cr (crore). */
export function formatCompact(v: number, f: ValueFormat = "count") {
  if (f === "percent") return `${Math.round(v)}%`;
  const a = Math.abs(v);
  const pre = f === "inr" ? "₹" : "";
  const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  if (a >= 1e7) return `${pre}${trim(v / 1e7)}Cr`;
  if (a >= 1e5) return `${pre}${trim(v / 1e5)}L`;
  if (a >= 1e3) return `${pre}${trim(v / 1e3)}k`;
  if (f === "inr" && a > 0 && a < 10 && Math.round(v * 100) % 100 !== 0) {
    return `${pre}${v.toFixed(1).replace(/\.0$/, "")}`;
  }
  return `${pre}${Math.round(v)}`;
}
