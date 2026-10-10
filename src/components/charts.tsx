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

/* ───────────────────────── Radial rings ───────────────────────── */

export type RadialRing = { key: string; label: string; value: number; max: number; from: string; to: string };

/** Hook: true on the frame after mount, so arcs can animate from empty to their value once. */
function useDrawn() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return drawn;
}

/** Colour between two hex colours, for ticks that run along a gradient. */
function blend(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = [16, 8, 0].map((sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t));
  return `rgb(${ch.join(",")})`;
}

/**
 * Concentric progress rings, one per measure, each a rounded gradient arc with a soft glow over a
 * faint track of its own colour, inside an outer ring of fine ticks that fills to `ticks.value`.
 * Rings of different radii aren't equal in length, so pair it with a legend stating the figures.
 */
export function RadialRings({
  rings,
  ticks,
  size = 240,
  label,
  children,
}: {
  rings: RadialRing[];
  /** The outer tick ring: share filled (0–1) and its gradient. */
  ticks?: { value: number; from: string; to: string; count?: number };
  size?: number;
  label: string;
  children?: ReactNode;
}) {
  const drawn = useDrawn();
  const uid = useId().replace(/:/g, "");
  const stroke = rings.length > 3 ? 9 : 11;
  const gap = 5;
  const outer = ticks ? 82 : 94;
  const n = ticks?.count ?? 72;
  const on = ticks ? Math.round(n * Math.min(1, Math.max(0, ticks.value))) : 0;
  return (
    <div role="img" aria-label={label} className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
        <defs>
          {rings.map((r) => (
            <linearGradient key={r.key} id={`g${uid}${r.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={r.from} />
              <stop offset="100%" stopColor={r.to} />
            </linearGradient>
          ))}
        </defs>
        {ticks &&
          Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            const lit = i < on;
            const r1 = 90;
            const r2 = i % 6 === 0 ? 99 : 97;
            return (
              <line
                key={i}
                x1={100 + r1 * Math.cos(a)}
                y1={100 + r1 * Math.sin(a)}
                x2={100 + r2 * Math.cos(a)}
                y2={100 + r2 * Math.sin(a)}
                stroke={lit ? blend(ticks.from, ticks.to, i / Math.max(1, n - 1)) : "#e2e6ec"}
                strokeWidth={2.2}
                strokeLinecap="round"
                style={{ opacity: lit && !drawn ? 0 : 1, transition: `opacity 0.3s ease ${(i / n) * 0.7}s` }}
              />
            );
          })}
        <g transform="rotate(-90 100 100)">
          {rings.map((r, i) => {
            const rad = outer - i * (stroke + gap);
            const share = r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0;
            return (
              <g key={r.key}>
                <circle cx="100" cy="100" r={rad} fill="none" stroke={r.to} strokeOpacity={0.1} strokeWidth={stroke} />
                {share > 0 && (
                  <circle
                    cx="100"
                    cy="100"
                    r={rad}
                    fill="none"
                    stroke={`url(#g${uid}${r.key})`}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={`${drawn ? Math.max(share, 0.6) : 0} 100`}
                    style={{ filter: `drop-shadow(0 3px 5px ${r.to}66)`, transition: `stroke-dasharray 1s cubic-bezier(.2,.8,.2,1) ${i * 0.12}s` }}
                    className="motion-reduce:transition-none"
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {children && <div className="relative flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}

/**
 * A ring of short segments that light up along a gradient to show a share (e.g. people messaged of
 * the daily limit), with the figure in the middle.
 */
export function TickRing({
  value,
  max,
  from,
  to,
  size = 112,
  count = 40,
  label,
  children,
}: {
  value: number;
  max: number | null;
  from: string;
  to: string;
  size?: number;
  count?: number;
  label: string;
  children?: ReactNode;
}) {
  const drawn = useDrawn();
  const share = max ? Math.min(1, Math.max(0, value / max)) : 0;
  // Any use at all lights at least one segment, so a small figure is still visible.
  const on = value > 0 ? Math.max(1, Math.round(count * share)) : 0;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {Array.from({ length: count }, (_, i) => {
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          const lit = i < on;
          return (
            <line
              key={i}
              x1={50 + 36 * Math.cos(a)}
              y1={50 + 36 * Math.sin(a)}
              x2={50 + 46 * Math.cos(a)}
              y2={50 + 46 * Math.sin(a)}
              stroke={lit ? blend(from, to, i / Math.max(1, count - 1)) : "#e2e6ec"}
              strokeWidth={4.2}
              strokeLinecap="round"
              style={{ opacity: lit && !drawn ? 0.15 : 1, transition: `opacity 0.3s ease ${(i / count) * 0.6}s` }}
            />
          );
        })}
      </svg>
      {children && <div className="relative flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}
