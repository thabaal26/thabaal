"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatValue, niceMax, smoothPath, type Pt, type ValueFormat } from "@/lib/chart-math";
import { cn } from "@/lib/cn";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/** A tiny smooth trend for a KPI tile: the line plus a soft wash beneath it. Decorative; the tile states the figures. */
export function Sparkline({ values, color, className }: { values: number[]; color: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) return <div aria-hidden className={cn("h-10", className)} />;
  const pts: Pt[] = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - (v / max) * 26]);
  const line = smoothPath(pts);
  return (
    <svg aria-hidden viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-10 w-full overflow-visible", className)}>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,32 L0,32 Z`} fill={`url(#sp${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" className="chart-draw" pathLength={1} />
    </svg>
  );
}

/* ───────────────────────── Trend chart ───────────────────────── */

export type Series = { key: string; label: string; color: string; values: number[]; area?: boolean };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Smooth lines (with soft area washes) over a shared x axis, a hover crosshair with every value,
 * and a "Peak" marker on the first series. `dark` draws it on the dark brand card.
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
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const pad = { l: 34, r: 14, t: 22, b: 26 };
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => pad.t + ih * (1 - v / max);
  const ticks = [max, max / 2, 0];
  const grid = dark ? "rgba(255,255,255,0.1)" : "#e2e6ec"; // --color-line (SVG attributes can't read CSS variables)
  const axisText = dark ? "fill-white/55" : "fill-muted";

  const first = series[0];
  const peakIdx = peak && first ? first.values.indexOf(Math.max(...first.values)) : -1;
  const showPeak = peakIdx >= 0 && first.values[peakIdx] > 0;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.l;
    setHover(Math.max(0, Math.min(n - 1, Math.round(n <= 1 ? 0 : (px / iw) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} className="block touch-pan-y select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-hidden>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`a${uid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={dark ? 0.35 : 0.16} />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={grid} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className={cn("text-[10px]", axisText)}>
                {formatValue(t, format === "percent" ? "percent" : "count")}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className={cn("text-[10px]", axisText)}>
                {l}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const pts: Pt[] = s.values.map((v, i) => [x(i), y(v)]);
            const line = smoothPath(pts);
            return (
              <g key={s.key}>
                {s.area !== false && <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#a${uid}${s.key})`} className="chart-fade" />}
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  className="chart-draw"
                  style={{ filter: `drop-shadow(0 5px 5px ${s.color}55)` }}
                />
              </g>
            );
          })}
          {showPeak && hover === null && (
            <g className="chart-fade">
              <circle cx={x(peakIdx)} cy={y(first.values[peakIdx])} r={4.5} fill={first.color} stroke={dark ? "#171b24" : "#ffffff"} strokeWidth={2} />
              <foreignObject x={Math.min(Math.max(x(peakIdx) - 44, pad.l), w - pad.r - 88)} y={Math.max(0, y(first.values[peakIdx]) - 30)} width={88} height={22}>
                <div className={cn("mx-auto w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-xs", dark ? "bg-glow text-night" : "bg-ink text-white")}>
                  Peak {formatValue(first.values[peakIdx], format)}
                </div>
              </foreignObject>
            </g>
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke={dark ? "rgba(255,255,255,0.3)" : "#d0d5dd"} strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke={dark ? "#171b24" : "#ffffff"} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-control bg-ink px-3 py-2 text-xs text-white shadow-pop"
          style={{ left: Math.min(Math.max(x(hover) + 12, 0), w - 160) }}
        >
          <p className="font-semibold">{(tooltipLabels ?? labels)[hover]}</p>
          <ul className="mt-1 space-y-0.5">
            {series.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-white/80">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular font-medium">{formatValue(s.values[hover] ?? 0, format)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Ring ───────────────────────── */

export type RingSegment = { key: string; label: string; value: number; color: string };

/**
 * A donut for a part-of-a-whole (with a surface gap between segments), or a single progress ring
 * when given one segment and a `max`. It draws itself in once.
 */
export function Ring({
  segments,
  max,
  size = 160,
  thickness = 14,
  track = "#f1f4f8",
  children,
  label,
}: {
  segments: RingSegment[];
  /** For a progress ring: the full-circle value. Defaults to the sum of the segments. */
  max?: number;
  size?: number;
  thickness?: number;
  track?: string;
  children?: ReactNode;
  label: string;
}) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const total = max ?? segments.reduce((a, s) => a + s.value, 0);
  const r = 50 - thickness / 2;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 0.8 : 0;
  let offset = 0;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s) => {
            const len = Math.max(0, (s.value / total) * 100 - gap);
            const el = (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap={segments.length === 1 ? "round" : "butt"}
                pathLength={100}
                strokeDasharray={`${drawn ? len : 0} 100`}
                strokeDashoffset={-offset}
                className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
              />
            );
            offset += (s.value / total) * 100;
            return s.value > 0 ? el : null;
          })}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/* ───────────────────────── 3D ring ───────────────────────── */

/** A colour made darker (f < 0) or lighter (f > 0), for the shaded side of the 3D ring. */
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f));
  return `rgb(${ch.join(",")})`;
}

/**
 * A donut seen from above at an angle: the top face carries the segments, a darker extruded wall
 * gives it depth, and a soft shadow grounds it. Tilt exaggerates the front segments a little, so
 * pair it with a legend that states the exact figures. Draws itself in once.
 */
export function Ring3D({
  segments,
  width = 260,
  thickness = 22,
  tilt = 0.56,
  depth = 12,
  label,
  children,
}: {
  segments: RingSegment[];
  width?: number;
  thickness?: number;
  /** How flattened the ellipse is (1 = seen from straight above). */
  tilt?: number;
  /** Height of the side wall, in viewBox units (the ring is 100 wide). */
  depth?: number;
  label: string;
  children?: ReactNode;
}) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const uid = useId().replace(/:/g, "");
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const gap = shown.length > 1 ? 0.6 : 0;
  const r = 50 - thickness / 2 - 1;
  const top = 50 * tilt; // centre of the top face
  const h = 100 * tilt + depth + 8; // room for the wall and the shadow

  const ringLayer = (dy: number, colorOf: (s: RingSegment) => string, key: string) => {
    let offset = 0;
    return (
      <g key={key} transform={`translate(0 ${dy}) scale(1 ${tilt})`}>
        <g transform="rotate(-90 50 50)">
          {total > 0 &&
            segments.map((s) => {
              const len = Math.max(0, (s.value / total) * 100 - gap);
              const el =
                s.value > 0 ? (
                  <circle
                    key={s.key}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={colorOf(s)}
                    strokeWidth={thickness}
                    pathLength={100}
                    strokeDasharray={`${drawn ? len : 0} 100`}
                    strokeDashoffset={-offset}
                    className="transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none"
                  />
                ) : null;
              offset += (s.value / total) * 100;
              return el;
            })}
        </g>
      </g>
    );
  };

  // The wall: the ring repeated downwards in darker shades, bottom first, so the top face covers it.
  const steps = Math.max(2, Math.round(depth / 1.2));
  const wall = Array.from({ length: steps }, (_, i) => {
    const dy = depth - (i * depth) / steps;
    return ringLayer(dy, (s) => shade(s.color, -0.42 + (i / steps) * 0.12), `w${i}`);
  });

  return (
    <div role="img" aria-label={label} className="relative mx-auto" style={{ width, height: (width * h) / 100 }}>
      <svg viewBox={`0 0 100 ${h}`} className="absolute inset-0 size-full overflow-visible">
        <defs>
          <radialGradient id={`sh${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#101828" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#101828" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`hl${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Floor shadow */}
        <ellipse cx="50" cy={top + depth + 3} rx="48" ry={50 * tilt * 0.9} fill={`url(#sh${uid})`} />
        {/* Empty track when there's nothing to show */}
        {total === 0 && (
          <g transform={`scale(1 ${tilt})`}>
            <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e6ec" strokeWidth={thickness} />
          </g>
        )}
        {wall}
        {ringLayer(0, (s) => s.color, "top")}
        {/* Soft light across the top face */}
        <g transform={`scale(1 ${tilt})`} pointerEvents="none">
          <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#hl${uid})`} strokeWidth={thickness} />
        </g>
      </svg>
      {children && (
        <div className="absolute inset-x-0 flex flex-col items-center justify-center text-center" style={{ top: 0, height: `${((top * 2) / h) * 100}%` }}>
          {children}
        </div>
      )}
    </div>
  );
}
