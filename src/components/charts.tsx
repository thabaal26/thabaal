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

/* ───────────────────────── Radial rings & 3D Chrono Donut ───────────────────────── */

export type RadialRing = { key: string; label: string; value: number; max: number; from: string; to: string };

export type DeliverySegment = {
  key: "read" | "delivered" | "sent" | "failed";
  label: string;
  shortLabel: string;
  value: number;
  from: string;
  to: string;
  tintBg: string;
  tintBorder: string;
};

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

/** Convert polar angle (degrees, 0 = 12 o'clock, clockwise) to SVG cartesian point. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Build an SVG circular arc path from startDeg to endDeg (clockwise, 0 = top). */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const clampedSpan = Math.min(359.85, Math.max(0.01, endDeg - startDeg));
  const actualEnd = startDeg + clampedSpan;
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, actualEnd);
  const largeArc = clampedSpan > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Option 1 Flagship Circle Graph:
 * - Outer 72-tick Precision Chrono Gauge with major/minor ticks + 3D glowing jewel endpoint
 * - Proportional 3D Bevelled Multi-Segment Donut Ring (Read, Delivered unread, In transit, Failed)
 *   with top specular highlight rims, recessed 3D groove track, and hover elevation
 * - Inner Read-of-Delivered Halo Ring with glowing tip orb
 * - 3D Floating Center Glass Medallion that dynamically morphs on arc or legend hover
 * - 2x2 Interactive 3D Tactile Legend Cards with micro progress bars
 */
export function DeliveryChronoDonut({
  read,
  delivered,
  sent,
  failed,
}: {
  read: number;
  delivered: number;
  sent: number;
  failed: number;
}) {
  const drawn = useDrawn();
  const uid = useId().replace(/:/g, "");
  const [activeKey, setActiveKey] = useState<DeliverySegment["key"] | null>(null);

  const total = read + delivered + sent + failed;
  const reached = read + delivered;
  const deliveredPct = total > 0 ? Math.round((reached / total) * 1000) / 10 : 0;
  const readOfReachedPct = reached > 0 ? Math.round((read / reached) * 1000) / 10 : 0;

  const segments: DeliverySegment[] = [
    {
      key: "read",
      label: "Read by customer",
      shortLabel: "Opened & read",
      value: read,
      from: "#a78bfa",
      to: "#6941c6",
      tintBg: "rgba(105, 65, 198, 0.06)",
      tintBorder: "rgba(105, 65, 198, 0.28)",
    },
    {
      key: "delivered",
      label: "Delivered, unread",
      shortLabel: "On phone, unread",
      value: delivered,
      from: "#34d399",
      to: "#167d63",
      tintBg: "rgba(22, 125, 99, 0.06)",
      tintBorder: "rgba(22, 125, 99, 0.28)",
    },
    {
      key: "sent",
      label: "Sending / waiting",
      shortLabel: "In transit",
      value: sent,
      from: "#94a3b8",
      to: "#475569",
      tintBg: "rgba(100, 116, 139, 0.06)",
      tintBorder: "rgba(100, 116, 139, 0.26)",
    },
    {
      key: "failed",
      label: "Failed to deliver",
      shortLabel: "Undelivered",
      value: failed,
      from: "#fb7185",
      to: "#c93636",
      tintBg: "rgba(201, 54, 54, 0.06)",
      tintBorder: "rgba(201, 54, 54, 0.28)",
    },
  ];

  const activeSeg = segments.find((s) => s.key === activeKey) ?? null;
  const activeSharePct = activeSeg && total > 0 ? Math.round((activeSeg.value / total) * 1000) / 10 : deliveredPct;

  // Build proportional arc angles for non-zero segments around the 360° main ring.
  const nonZero = segments.filter((s) => s.value > 0);
  const gapDeg = nonZero.length > 1 ? 14 : 0;
  const totalGap = gapDeg * nonZero.length;
  const availableDeg = Math.max(0, 360 - totalGap);

  // Ensure even tiny non-zero segments get at least 8° so their rounded 3D cap is clearly visible.
  const rawAngles = nonZero.map((s) => (total > 0 ? (s.value / total) * availableDeg : 0));
  const minAngle = nonZero.length > 1 ? 8 : 0;
  const boosted = rawAngles.map((a) => Math.max(a, minAngle));
  const boostSum = boosted.reduce((acc, v) => acc + v, 0);
  const normAngles = boostSum > 0 ? boosted.map((a) => (a / boostSum) * availableDeg) : [];

  let cursor = 0;
  const arcs = nonZero.map((seg, idx) => {
    const span = normAngles[idx] ?? 0;
    const startDeg = cursor + gapDeg / 2;
    const endDeg = startDeg + span;
    cursor += span + gapDeg;
    return { ...seg, startDeg, endDeg, span };
  });

  // Outer chrono ticks: 72 fine ticks around the perimeter.
  const tickCount = 72;
  const gaugeShare = activeSeg
    ? total > 0
      ? activeSeg.value / total
      : 0
    : total > 0
      ? reached / total
      : 0;
  const litTicks = total > 0 && gaugeShare > 0 ? Math.max(1, Math.round(tickCount * Math.min(1, gaugeShare))) : 0;
  const jewelAngleDeg = (litTicks / tickCount) * 360;
  const jewelPos = polarToCartesian(120, 120, 108, jewelAngleDeg);

  // Inner read-of-delivered halo ring (radius 60)
  const innerSpanDeg = reached > 0 ? Math.min(359.8, (read / reached) * 360) : 0;
  const innerTipPos = polarToCartesian(120, 120, 60, innerSpanDeg);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 3D Chrono Donut SVG + Floating Glass Medallion */}
      <div
        role="img"
        aria-label={`${deliveredPct}% of ${total} messages delivered (${read} read, ${delivered} delivered unread, ${sent} in transit, ${failed} failed)`}
        className="relative mx-auto grid place-items-center select-none"
        style={{ width: 252, height: 252 }}
      >
        <svg viewBox="0 0 240 240" className="absolute inset-0 size-full overflow-visible">
          <defs>
            {segments.map((s) => (
              <linearGradient key={s.key} id={`seg-${uid}-${s.key}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={s.from} />
                <stop offset="100%" stopColor={s.to} />
              </linearGradient>
            ))}
            <linearGradient id={`halo-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="55%" stopColor="#6941c6" />
              <stop offset="100%" stopColor="#16a37a" />
            </linearGradient>
            <radialGradient id={`well-${uid}`} cx="50%" cy="38%" r="60%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="72%" stopColor="#f8f9fc" />
              <stop offset="100%" stopColor="#edf1f7" />
            </radialGradient>
          </defs>

          {/* Outer subtle ambient bezel ring */}
          <circle cx="120" cy="120" r="115" fill="none" stroke="#e6eaf1" strokeWidth="1" strokeDasharray="2 4" />

          {/* 72 Outer Precision Chrono Ticks */}
          {Array.from({ length: tickCount }, (_, i) => {
            const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
            const isMajor = i % 6 === 0;
            const lit = i < litTicks;
            const r1 = isMajor ? 99 : 100.5;
            const r2 = isMajor ? 109.5 : 106.5;
            const tickColor = lit
              ? activeSeg
                ? blend(activeSeg.from, activeSeg.to, i / Math.max(1, litTicks - 1))
                : blend("#6941c6", "#16a37a", i / Math.max(1, tickCount - 1))
              : isMajor
                ? "#cbd5e1"
                : "#e2e8f0";
            return (
              <line
                key={i}
                x1={120 + r1 * Math.cos(a)}
                y1={120 + r1 * Math.sin(a)}
                x2={120 + r2 * Math.cos(a)}
                y2={120 + r2 * Math.sin(a)}
                stroke={tickColor}
                strokeWidth={isMajor ? 2.4 : 1.75}
                strokeLinecap="round"
                style={{
                  opacity: lit && !drawn ? 0 : 1,
                  transition: `opacity 0.25s ease ${(i / tickCount) * 0.45}s, stroke 0.25s ease`,
                }}
              />
            );
          })}

          {/* Glowing 3D Jewel Endpoint on the Outer Tick Ring */}
          {litTicks > 0 && drawn && (
            <g style={{ transition: "transform 0.35s cubic-bezier(.22,1,.36,1)" }}>
              <circle
                cx={jewelPos.x}
                cy={jewelPos.y}
                r={5.5}
                fill={activeSeg ? activeSeg.to : "#16a37a"}
                fillOpacity={0.24}
              />
              <circle
                cx={jewelPos.x}
                cy={jewelPos.y}
                r={3.2}
                fill={activeSeg ? activeSeg.to : "#16a37a"}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* 3D Recessed Groove Track for the Main Donut Ring (r = 81) */}
          <circle cx="120" cy="120" r="89.5" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          <circle cx="120" cy="120" r="81" fill="none" stroke="#eef2f6" strokeWidth="16" />
          <circle cx="120" cy="120" r="72.5" fill="none" stroke="#ffffff" strokeWidth="1.2" />

          {/* Main Proportional 3D Bevelled Donut Segments (r = 81) */}
          {arcs.map((arc, idx) => {
            const isHovered = activeKey === arc.key;
            const isDimmed = activeKey !== null && activeKey !== arc.key;
            const rMain = isHovered ? 82.5 : 81;
            const sw = isHovered ? 19 : 15.5;
            const dMain = describeArc(120, 120, rMain, arc.startDeg, drawn ? arc.endDeg : arc.startDeg + 0.1);
            const dSpecular = describeArc(
              120,
              120,
              rMain + sw * 0.28,
              arc.startDeg + 1.2,
              drawn ? Math.max(arc.startDeg + 1.5, arc.endDeg - 1.2) : arc.startDeg + 1.3,
            );
            return (
              <g
                key={arc.key}
                className="cursor-pointer"
                onMouseEnter={() => setActiveKey(arc.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() => setActiveKey((prev) => (prev === arc.key ? null : arc.key))}
                style={{
                  opacity: isDimmed ? 0.34 : 1,
                  transition: "opacity 0.22s ease, filter 0.22s ease",
                  filter: `drop-shadow(0 ${isHovered ? 6 : 3}px ${isHovered ? 10 : 6}px ${arc.to}${isHovered ? "88" : "50"})`,
                }}
              >
                {/* Main 3D Bevelled Gradient Arc */}
                <path
                  d={dMain}
                  fill="none"
                  stroke={`url(#seg-${uid}-${arc.key})`}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  style={{
                    transition: `stroke-width 0.22s cubic-bezier(.22,1,.36,1), d 0.75s cubic-bezier(.2,.8,.2,1) ${idx * 0.08}s`,
                  }}
                />
                {/* Top Specular Glass Rim along the outer curve of the 3D tube */}
                {drawn && arc.span > 6 && (
                  <path
                    d={dSpecular}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.45)"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          })}

          {/* Inner Read-of-Delivered Halo Track & Arc (r = 60) */}
          <circle cx="120" cy="120" r="60" fill="none" stroke="#f1effa" strokeWidth="5" />
          {innerSpanDeg > 0 && (
            <>
              <path
                d={describeArc(120, 120, 60, 0, drawn ? innerSpanDeg : 0.1)}
                fill="none"
                stroke={`url(#halo-${uid})`}
                strokeWidth="5"
                strokeLinecap="round"
                style={{
                  filter: "drop-shadow(0 2px 4px rgba(105, 65, 198, 0.35))",
                  transition: "d 0.9s cubic-bezier(.2,.8,.2,1) 0.15s",
                }}
              />
              {drawn && innerSpanDeg < 355 && (
                <circle
                  cx={innerTipPos.x}
                  cy={innerTipPos.y}
                  r={2.8}
                  fill="#ffffff"
                  stroke="#6941c6"
                  strokeWidth={1.6}
                />
              )}
            </>
          )}

          {/* Inner 3D Glass Medallion Pedestal Disc (r = 49) */}
          <circle
            cx="120"
            cy="120"
            r="49"
            fill={`url(#well-${uid})`}
            stroke="#e4e8f0"
            strokeWidth="1.2"
            style={{ filter: "drop-shadow(0 6px 14px rgba(16, 24, 40, 0.09))" }}
          />
          <circle cx="120" cy="120" r="47.5" fill="none" stroke="#ffffff" strokeWidth="1.5" />
        </svg>

        {/* Center Interactive Readout */}
        <div className="relative z-10 flex w-[92px] flex-col items-center text-center">
          <span
            aria-hidden
            className="icon-cube-3d mb-1 grid size-7 place-items-center rounded-[9px] text-white ring-1 ring-inset ring-white/30 transition-all duration-200"
            style={{
              background: activeSeg
                ? `linear-gradient(145deg, ${activeSeg.from}, ${activeSeg.to})`
                : "linear-gradient(145deg, #a78bfa 0%, #6941c6 55%, #167d63 100%)",
              boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -1.5px 0 rgba(0,0,0,0.22), 0 4px 10px -2px ${activeSeg ? activeSeg.to : "#6941c6"}88`,
            }}
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              {activeSeg?.key === "failed" ? (
                <path d="M10 6v4.5m0 3h.01M3.6 15.5h12.8c1.1 0 1.8-1.2 1.2-2.1L11.2 3.2c-.5-.9-1.9-.9-2.4 0L2.4 13.4c-.6.9.1 2.1 1.2 2.1Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              ) : activeSeg?.key === "sent" ? (
                <path d="M10 5.5V10l3 1.8M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="m2.5 10.5 3.2 3.2L12.5 7m-2.3 6.7 1.5 1.5 6.3-6.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </span>

          <p className="tabular text-[1.45rem] font-bold leading-none tracking-tight text-ink">
            {activeSeg ? `${activeSharePct}%` : <CountUp value={deliveredPct} format="percent" />}
          </p>

          <p className="mt-1 max-w-full truncate text-[9.5px] font-bold uppercase tracking-wider text-muted">
            {activeSeg ? activeSeg.label : "Delivered"}
          </p>

          <span
            className="tabular mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
            style={{
              background: activeSeg ? activeSeg.tintBg : "rgba(105, 65, 198, 0.08)",
              color: activeSeg ? activeSeg.to : "#6941c6",
            }}
          >
            {activeSeg ? `${activeSeg.value.toLocaleString("en-IN")} msgs` : `${readOfReachedPct}% read`}
          </span>
        </div>
      </div>

      {/* 3D Reached Summary Pill */}
      <div className="flex w-full items-center justify-between gap-2 rounded-control border border-line bg-subtle/75 px-3.5 py-2 text-xs shadow-[inset_0_1px_0_#fff]">
        <span className="text-ink-2">
          <b className="tabular font-semibold text-ink">{reached.toLocaleString("en-IN")}</b> of{" "}
          <b className="tabular font-semibold text-ink">{total.toLocaleString("en-IN")}</b> messages delivered
        </span>
        <span className="tabular rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
          {readOfReachedPct}% read
        </span>
      </div>

      {/* 2x2 Interactive 3D Tactile Legend Cards */}
      <ul className="grid w-full grid-cols-1 gap-2.5 min-[400px]:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {segments.map((s) => {
          const share = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
          const isHovered = activeKey === s.key;
          return (
            <li
              key={s.key}
              onMouseEnter={() => setActiveKey(s.key)}
              onMouseLeave={() => setActiveKey(null)}
              onClick={() => setActiveKey((prev) => (prev === s.key ? null : s.key))}
              className={cn(
                "group cursor-pointer rounded-control border px-3 py-2.5 transition-all duration-200",
                isHovered
                  ? "-translate-y-0.5 shadow-md"
                  : "border-line bg-gradient-to-b from-white to-subtle/50 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5",
              )}
              style={
                isHovered
                  ? {
                      background: `linear-gradient(180deg, #ffffff 0%, ${s.tintBg} 100%)`,
                      borderColor: s.tintBorder,
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-white/40"
                    style={{
                      background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
                      boxShadow: `0 2px 5px ${s.to}66`,
                    }}
                  />
                  <span className="truncate text-xs font-medium text-ink-2 group-hover:text-ink">{s.label}</span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-ink">{s.value.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="track-3d h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bar bar-3d h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${drawn ? (s.value > 0 ? Math.max(share, 4) : 0) : 0}%`,
                      background: `linear-gradient(90deg, ${s.from}, ${s.to})`,
                    }}
                  />
                </div>
                <span className="tabular w-10 shrink-0 text-right text-[11px] font-medium text-muted">{share}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Concentric progress rings, one per measure, each a rounded gradient arc with a soft glow over a
 * faint track of its own colour, inside an outer ring of fine ticks that fills to `ticks.value`.
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
                    cx="100" cy="100" r={rad} fill="none"
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
 * 3D Precision Chrono TickRing for daily sending limits:
 * Features an inner 3D bevelled arc + outer chrono ticks + raised 3D center glass medallion.
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
  const uid = useId().replace(/:/g, "");
  const share = max ? Math.min(1, Math.max(0, value / max)) : 0;
  // Any use at all lights at least one segment, so a small figure is still visible.
  const on = value > 0 ? Math.max(1, Math.round(count * share)) : 0;
  const arcDeg = share > 0 ? Math.max(8, share * 360) : 0;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={`tr-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {Array.from({ length: count }, (_, i) => {
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          const lit = i < on;
          const isMajor = i % 5 === 0;
          return (
            <line
              key={i}
              x1={50 + 40 * Math.cos(a)}
              y1={50 + 40 * Math.sin(a)}
              x2={50 + (isMajor ? 47.5 : 45.5) * Math.cos(a)}
              y2={50 + (isMajor ? 47.5 : 45.5) * Math.sin(a)}
              stroke={lit ? blend(from, to, i / Math.max(1, count - 1)) : "#e2e6ec"}
              strokeWidth={isMajor ? 2.6 : 2}
              strokeLinecap="round"
              style={{ opacity: lit && !drawn ? 0.15 : 1, transition: `opacity 0.3s ease ${(i / count) * 0.6}s` }}
            />
          );
        })}
        {/* Inner 3D Recessed Track & Bevelled Ring */}
        <circle cx="50" cy="50" r="33" fill="none" stroke="#eef2f6" strokeWidth="5.5" />
        {arcDeg > 0 && (
          <path
            d={describeArc(50, 50, 33, 0, drawn ? arcDeg : 0.1)}
            fill="none"
            stroke={`url(#tr-${uid})`}
            strokeWidth="5.5"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 2px 4px ${to}55)` }}
          />
        )}
        {/* Center 3D Glass Medallion */}
        <circle cx="50" cy="50" r="25.5" fill="#fbfcfe" stroke="#e4e8f0" strokeWidth="1" />
      </svg>
      {children && <div className="relative z-10 flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}
