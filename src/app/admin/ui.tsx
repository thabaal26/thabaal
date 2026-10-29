// Admin panel building blocks in the approved admin design: page head, KPI cards and small SVG charts.
// Plain server components (no state), so every page renders its numbers on the server.

import type { ReactNode } from "react";
import type { Tone } from "@/lib/admin-data";

export const R = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const K = (n: number) =>
  n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}cr` : n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : R(n);
export const N = (n: number) => Math.round(n).toLocaleString("en-IN");
export const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export function PageHead({ title, sub, tools }: { title: string; sub: string; tools?: ReactNode }) {
  return (
    <header className="atop">
      <div>
        <h1>{title}</h1>
        <p className="sub">{sub}</p>
      </div>
      {tools && <div className="tools">{tools}</div>}
    </header>
  );
}

export function Pill({ tone = "mute", children }: { tone?: Tone | "plain"; children: ReactNode }) {
  return <span className={`pill${tone === "plain" ? "" : ` ${tone}`}`}>{children}</span>;
}

export type KpiItem = { label: string; value: string; note: string; tone?: "up" | "dn" | "mute"; spark?: number[]; sparkColor?: string };

export function Kpis({ items, className = "" }: { items: KpiItem[]; className?: string }) {
  return (
    <div className={`kpi ${className}`}>
      {items.map((k) => (
        <div key={k.label} className="card">
          <div className="l">{k.label}</div>
          <div className="v">{k.value}</div>
          <div className={`d ${k.tone ?? "mute"}`}>{k.note}</div>
          {k.spark && k.spark.length > 1 && (
            <div className="sp">
              <Spark vals={k.spark} color={k.sparkColor} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Spark({ vals, color = "#FFC329" }: { vals: number[]; color?: string }) {
  const w = 160;
  const h = 34;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / Math.max(1, max - min)) * (h - 6);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 34 }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** One series over months: line with a soft area and the value on each point. */
// Colours go in style, not attributes, so "var(--bar)" works: it is navy by day and cream at night.
export function LineChart({ labels, vals, color = "var(--bar)", fmt = K, h = 220, label }: { labels: string[]; vals: number[]; color?: string; fmt?: (n: number) => string; h?: number; label: string }) {
  const w = 600;
  const pad = { l: 12, r: 12, t: 22, b: 26 };
  const max = Math.max(...vals, 1);
  const x = (i: number) => pad.l + (i / Math.max(1, vals.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(vals.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path d={area} style={{ fill: color }} opacity={0.08} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth={2.5} strokeLinejoin="round" />
      {vals.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={3.5} style={{ fill: color }} />
          <text className="vlab" x={x(i)} y={y(v) - 9} textAnchor="middle">
            {fmt(v)}
          </text>
          <text x={x(i)} y={h - 6} textAnchor="middle">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Grouped bars over months, with the value above each bar. */
export function BarChart({
  labels,
  series,
  fmt = (n: number) => N(n),
  h = 200,
  label,
}: {
  labels: string[];
  series: { name: string; vals: number[]; color: string }[];
  fmt?: (n: number) => string;
  h?: number;
  label: string;
}) {
  const w = 600;
  const pad = { l: 8, r: 8, t: 20, b: 26 };
  const max = Math.max(1, ...series.flatMap((s) => s.vals));
  const slot = (w - pad.l - pad.r) / labels.length;
  const bw = Math.min(34, (slot * 0.7) / series.length);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {labels.map((lab, i) => {
        const x0 = pad.l + i * slot + (slot - bw * series.length) / 2;
        return (
          <g key={lab + i}>
            {series.map((s, j) => {
              const v = s.vals[i] ?? 0;
              const bh = (v / max) * (h - pad.t - pad.b);
              const x = x0 + j * bw;
              return (
                <g key={s.name}>
                  <rect x={x + 1} y={h - pad.b - bh} width={bw - 2} height={Math.max(bh, v ? 2 : 0)} rx={4} style={{ fill: s.color }} />
                  {v > 0 && (
                    <text className="vlab" x={x + bw / 2} y={h - pad.b - bh - 5} textAnchor="middle">
                      {fmt(v)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={pad.l + i * slot + slot / 2} y={h - 6} textAnchor="middle">
              {lab}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type Part = [label: string, value: number, color: string];

export function Donut({ parts, mid, sub, fmt = (n: number) => N(n), label }: { parts: Part[]; mid: string; sub: string; fmt?: (n: number) => string; label: string }) {
  const total = parts.reduce((s, p) => s + p[1], 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let at = 0;
  return (
    <div className="don">
      <svg viewBox="0 0 120 120" width={128} height={128} role="img" aria-label={label}>
        <circle cx={60} cy={60} r={r} fill="none" style={{ stroke: "var(--soft)" }} strokeWidth={16} />
        {total > 0 &&
          parts.map(([name, v, color]) => {
            const len = (v / total) * c;
            const el = (
              <circle
                key={name}
                cx={60}
                cy={60}
                r={r}
                fill="none"
                style={{ stroke: color }}
                strokeWidth={16}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-at}
                transform="rotate(-90 60 60)"
              />
            );
            at += len;
            return el;
          })}
        <text x={60} y={58} textAnchor="middle" style={{ font: "600 22px var(--display)", fill: "var(--fg)" }}>
          {mid}
        </text>
        <text x={60} y={76} textAnchor="middle" style={{ font: "12px var(--ui)", fill: "var(--muted)" }}>
          {sub}
        </text>
      </svg>
      <div className="lg">
        {parts.map(([name, v, color]) => (
          <div key={name}>
            <i style={{ background: color }} />
            <span>{name}</span>
            <b>{fmt(v)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ rows, fmt = (n: number) => N(n), empty = "Nothing to show yet." }: { rows: Part[]; fmt?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="hb">
      {rows.map(([name, v, color]) => (
        <div key={name} className="r">
          <span title={name}>{name}</span>
          <span className="t">
            <i style={{ width: `${Math.max(3, (v / max) * 100)}%`, background: color }} />
          </span>
          <b>{fmt(v)}</b>
        </div>
      ))}
    </div>
  );
}

/** A plain note that part of the approved design is waiting on phase 2, and why. */
export function ComingNext({ title, children, items }: { title: string; children: ReactNode; items?: string[] }) {
  return (
    <div className="next">
      <h3>{title}</h3>
      <p className="muted small">{children}</p>
      {items && (
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Who({ name, sub, href }: { name: string; sub?: string; href?: string }) {
  const inner = (
    <>
      <span className="av">{initials(name)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="n" style={{ display: "block" }}>
          {name}
        </span>
        {sub && <span className="s">{sub}</span>}
      </span>
    </>
  );
  return href ? (
    <a className="who" href={href}>
      {inner}
    </a>
  ) : (
    <span className="who">{inner}</span>
  );
}
