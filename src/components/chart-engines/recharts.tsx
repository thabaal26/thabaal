"use client";

/* Draws a chart model (model.ts) with Recharts (SVG). Loaded only on portals that pick Recharts. */

import { useEffect, useId, useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { heatColor, tipHTML, withAlpha, type Cartesian, type ChartModel, type GaugeModel, type HeatModel, type PieModel, type RowsModel, type Tip } from "./model";
import type { EngineProps } from "./types";

type TipProps = { active?: boolean; label?: unknown; payload?: readonly { dataKey?: unknown; payload?: { i?: number } }[] };

function TipBox({ html, tip }: { html: string; tip: Tip }) {
  if (!html) return null;
  return (
    <div
      style={{ background: tip.bg, color: tip.color, font: tip.font, padding: tip.padding, whiteSpace: "nowrap", pointerEvents: "none", ...cssText(tip.css) }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** "border-radius:12px;box-shadow:…" → a React style object. */
function cssText(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const part of css.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (key) out[key] = part.slice(i + 1).trim();
  }
  return out;
}

const corners = (r: number | number[]): [number, number, number, number] => (Array.isArray(r) ? [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0] : [r, r, r, r]);

function CartesianChart({ m, onEvent }: { m: Cartesian; onEvent: EngineProps["onEvent"] }) {
  const gid = useId().replace(/:/g, "");
  const rows = useMemo(
    () => m.categories.map((c, i) => ({ i, c, ...Object.fromEntries(m.series.map((s, si) => [`s${si}`, s.data[i]?.value ?? 0])) })),
    [m],
  );
  const event = (type: "click" | "mouseover" | "mouseout", si: number, i: number) =>
    onEvent?.(type, { dataIndex: i, seriesIndex: si, seriesName: m.series[si]?.name, name: m.categories[i], componentType: "series" });

  const CatTick = ({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { index?: number } }) => {
    const raw = m.catLabels[payload?.index ?? -1] ?? "";
    const lines = Array.isArray(raw) ? raw : [raw];
    if (!lines.join("")) return null;
    return (
      <text x={x} y={y} fill={m.axisColor} fontSize={m.fontSize} fontFamily={m.font} textAnchor={m.horizontal ? "end" : "middle"} dominantBaseline={m.horizontal ? "middle" : undefined}>
        {lines.map((l, k) => (
          <tspan key={k} x={x} dy={m.horizontal ? (k ? "1.2em" : 0) : k ? "1.2em" : "0.9em"}>
            {l}
          </tspan>
        ))}
      </text>
    );
  };

  const catAxis = {
    type: "category" as const,
    dataKey: "c",
    hide: !m.showCatAxis && !m.showCatLine,
    tick: m.showCatAxis ? CatTick : false,
    tickLine: false,
    axisLine: m.showCatLine ? { stroke: m.gridColor } : false,
    interval: m.autoSkip ? ("preserveStartEnd" as const) : 0,
    reversed: m.horizontal ? !m.catInverse : m.catInverse,
    tickMargin: 6,
  };
  const valAxis = {
    type: "number" as const,
    hide: !m.showValAxis,
    domain: [m.valMin ?? 0, m.valMax ?? "auto"] as [number, number | "auto"],
    allowDecimals: !m.integer,
    tickCount: m.valTicks,
    tick: { fill: m.axisColor, fontSize: m.fontSize, fontFamily: m.font },
    tickLine: false,
    axisLine: false,
    tickFormatter: (v: number) => (m.valFormat ? m.valFormat(v) : String(v)),
    width: m.showValAxis ? undefined : 0,
  };
  const cursor = m.pointer === "line" ? { stroke: m.pointerColor, strokeWidth: 1 } : m.pointer === "shadow" ? { fill: m.pointerColor } : false;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        layout={m.horizontal ? "vertical" : "horizontal"}
        margin={m.grid}
        barCategoryGap="22%"
        onMouseLeave={() => onEvent?.("globalout", {})}
        style={{ fontFamily: m.font }}
      >
        <defs>
          {m.series.map((s, si) =>
            s.area ? (
              <linearGradient key={si} id={`${gid}-a${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.area.top} />
                <stop offset="100%" stopColor={s.area.bottom} />
              </linearGradient>
            ) : null,
          )}
        </defs>
        {m.showGrid && <CartesianGrid stroke={m.gridColor} vertical={m.horizontal} horizontal={!m.horizontal} />}
        {m.horizontal ? <YAxis {...catAxis} /> : <XAxis {...catAxis} scale={m.boundaryGap ? "auto" : "point"} padding={m.boundaryGap ? undefined : { left: 0, right: 0 }} />}
        {m.horizontal ? <XAxis {...valAxis} /> : <YAxis {...valAxis} />}
        {m.tip && (
          <Tooltip
            cursor={cursor}
            shared={m.tip.trigger === "axis"}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 30, outline: "none" }}
            content={(p: TipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const i = p.payload[0]?.payload?.i ?? -1;
              const si = Number(String(p.payload[0]?.dataKey ?? "s0").slice(1)) || 0;
              return <TipBox html={tipHTML(m, i, si)} tip={m.tip!} />;
            }}
          />
        )}
        {m.series.map((s, si) => {
          const key = `s${si}`;
          if (s.type === "line" && s.area)
            return (
              <Area
                key={key}
                dataKey={key}
                name={s.name}
                type={s.smooth ? "monotone" : "linear"}
                stroke={s.color}
                strokeWidth={s.lineWidth}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                fill={`url(#${gid}-a${si})`}
                fillOpacity={1}
                dot={s.showSymbol ? { r: 2.5, fill: s.color, strokeWidth: 0 } : false}
                activeDot={{ r: 4.5, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={m.animate}
                animationDuration={650}
              />
            );
          if (s.type === "line")
            return (
              <Line
                key={key}
                dataKey={key}
                name={s.name}
                type={s.smooth ? "monotone" : "linear"}
                stroke={s.color}
                strokeWidth={s.lineWidth}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={s.showSymbol ? { r: 2.5, fill: s.color, strokeWidth: 0 } : false}
                activeDot={{ r: 4.5, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={m.animate}
                animationDuration={650}
              />
            );
          return (
            <Bar
              key={key}
              dataKey={key}
              name={s.name}
              stackId={s.stack}
              barSize={s.barWidth}
              maxBarSize={s.barMax}
              isAnimationActive={m.animate}
              animationDuration={650}
              cursor={s.clickable ? "pointer" : "default"}
              onClick={(d: { payload?: { i?: number } }, i: number) => event("click", si, d?.payload?.i ?? i)}
              onMouseEnter={(d: { payload?: { i?: number } }, i: number) => event("mouseover", si, d?.payload?.i ?? i)}
              onMouseLeave={(d: { payload?: { i?: number } }, i: number) => event("mouseout", si, d?.payload?.i ?? i)}
            >
              {s.data.map((d, i) => (
                <Cell key={i} fill={withAlpha(d.color, d.opacity)} stroke={d.borderWidth ? d.borderColor : undefined} strokeWidth={d.borderWidth} radius={corners(d.radius) as never} />
              ))}
              {s.data.some((d) => d.label) && (
                <LabelList
                  // Entries skip empty bars, so find the point by its row, not the entry's position.
                  valueAccessor={(entry: { payload?: { i?: number } }) => s.data[entry.payload?.i ?? -1]?.label?.text ?? ""}
                  position={m.horizontal ? "right" : "top"}
                  offset={4}
                  fill={s.data.find((d) => d.label)?.label?.color}
                  fontSize={s.data.find((d) => d.label)?.label?.size}
                  fontWeight={s.data.find((d) => d.label)?.label?.weight}
                  fontFamily={m.font}
                />
              )}
            </Bar>
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PieView({ m, onEvent }: { m: PieModel; onEvent: EngineProps["onEvent"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart onMouseLeave={() => onEvent?.("globalout", {})}>
        <Pie
          data={m.slices}
          dataKey="value"
          nameKey="name"
          innerRadius={`${m.inner}%`}
          outerRadius={`${m.outer}%`}
          startAngle={m.startAngle}
          endAngle={m.startAngle - 360}
          stroke={m.borderColor}
          strokeWidth={m.borderWidth}
          cornerRadius={m.radius}
          isAnimationActive={m.animate}
          animationDuration={650}
          cursor={m.clickable ? "pointer" : "default"}
          onClick={(_: unknown, i: number) => onEvent?.("click", { dataIndex: i, seriesIndex: 0, name: m.slices[i]?.name })}
          onMouseEnter={(_: unknown, i: number) => onEvent?.("mouseover", { dataIndex: i, seriesIndex: 0, name: m.slices[i]?.name })}
          onMouseLeave={() => onEvent?.("mouseout", {})}
        >
          {m.slices.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
        {m.tip && (
          <Tooltip
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 30, outline: "none" }}
            content={(p: TipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const name = (p.payload[0] as { name?: string }).name;
              const i = m.slices.findIndex((s) => s.name === name);
              return <TipBox html={tipHTML(m, i)} tip={m.tip!} />;
            }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}

/** A gauge or progress ring: a radial bar over its track, across the gauge's sweep. */
function GaugeView({ m }: { m: GaugeModel }) {
  const outer = (Math.min(m.w, m.h) / 2) * (m.radius / 100);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart data={[{ v: m.value }]} innerRadius={Math.max(0, outer - m.width)} outerRadius={outer} startAngle={m.start} endAngle={m.end} barSize={m.width}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar dataKey="v" fill={m.color} background={{ fill: m.track }} cornerRadius={m.roundCap ? m.width / 2 : 0} isAnimationActive={m.animate} animationDuration={900} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

/** A heat map: a scatter of rounded cells on index axes, each with its count. */
function HeatView({ m, onEvent }: { m: HeatModel; onEvent: EngineProps["onEvent"] }) {
  const yLabelW = Math.min(64, Math.max(...m.yCats.map((c) => c.length), 1) * (m.ySize * 0.62) + 10);
  const top = m.grid.top + m.xSize + 8;
  const cw = Math.max(1, (m.w - m.grid.left - yLabelW - m.grid.right) / Math.max(1, m.xCats.length));
  const ch = Math.max(1, (m.h - top - m.grid.bottom) / Math.max(1, m.yCats.length));
  const data = m.cells.map((c, i) => ({ x: c.x, y: c.y, i }));
  const tick = (size: number) => ({ fill: m.axisColor, fontSize: size, fontFamily: m.font });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: m.grid.top, right: m.grid.right, bottom: m.grid.bottom, left: m.grid.left }} onMouseLeave={() => onEvent?.("globalout", {})}>
        <XAxis type="number" dataKey="x" orientation="top" domain={[-0.5, m.xCats.length - 0.5]} ticks={m.xCats.map((_, i) => i)} tickFormatter={(v: number) => m.xLabels[v] ?? ""} interval={0} axisLine={false} tickLine={false} tick={tick(m.xSize)} height={m.xSize + 8} />
        <YAxis type="number" dataKey="y" reversed={m.yInverse} domain={[-0.5, m.yCats.length - 0.5]} ticks={m.yCats.map((_, i) => i)} tickFormatter={(v: number) => m.yCats[v] ?? ""} interval={0} axisLine={false} tickLine={false} tick={tick(m.ySize)} width={yLabelW} />
        {m.tip && (
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 30, outline: "none" }}
            content={(p: TipProps) => (p.active && p.payload?.length ? <TipBox html={tipHTML(m, p.payload[0]?.payload?.i ?? -1)} tip={m.tip!} /> : null)}
          />
        )}
        <Scatter
          data={data}
          isAnimationActive={m.animate}
          animationDuration={500}
          onMouseEnter={(d: { payload?: { i?: number } }) => onEvent?.("mouseover", { dataIndex: d?.payload?.i, seriesIndex: 0 })}
          shape={(p: { cx?: number; cy?: number; payload?: { i?: number } }) => {
            const c = m.cells[p.payload?.i ?? -1];
            if (!c || p.cx === undefined || p.cy === undefined) return <g />;
            return (
              <g>
                <rect x={p.cx - cw / 2 + m.gap / 2} y={p.cy - ch / 2 + m.gap / 2} width={Math.max(1, cw - m.gap)} height={Math.max(1, ch - m.gap)} rx={m.radius} fill={heatColor(m, c)} />
                {c.label && (
                  <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fill={c.label.color} fontSize={c.label.size} fontWeight={c.label.weight} fontFamily={m.font}>
                    {c.v}
                  </text>
                )}
              </g>
            );
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

type Box = { x?: number | string; y?: number | string; width?: number | string; height?: number | string };

/** Row charts: names above each bar and the figure at its right end, over a full-width track. */
function RowsView({ m, onEvent }: { m: RowsModel; onEvent: EngineProps["onEvent"] }) {
  const db = m.dumbbell;
  const tiny = m.max * 1e-6;
  const rows = m.rows.map((r, i) => ({
    i,
    carrier: tiny,
    ...Object.fromEntries((m.bars ?? []).map((b, bi) => [`p${bi}`, b.data[i]?.value ?? 0])),
    ...(db ? { range: [Math.min(db.from[i], db.to[i]), Math.max(db.from[i], db.to[i])] } : {}),
  }));
  const t = m.text;
  // Typed loosely by Recharts (cartesian or polar boxes); these labels only ever sit on bars.
  const RowText = (props: unknown) => {
    const p = props as { viewBox?: Box; parentViewBox?: Box; value?: unknown };
    const r = m.rows[Number(p.value)];
    if (!r) return null;
    const left = Number(p.parentViewBox?.x ?? 0);
    const right = left + Number(p.parentViewBox?.width ?? m.w);
    const y = Number(p.viewBox?.y ?? 0) - 6;
    const h = Number(p.viewBox?.height ?? m.trackWidth);
    return (
      <g style={{ fontFamily: m.font }} pointerEvents="none">
        {r.dot && <circle cx={left + 4} cy={y - 4} r={3.5} fill={r.dot} />}
        <text x={left + (r.dot ? 13 : 0)} y={y} fill={t.name} fontSize={t.nameSize}>
          {r.name.length > 42 ? `${r.name.slice(0, 41)}…` : r.name}
          {r.tag && (
            <tspan fill={t.tag} fontSize={t.tagSize} dx={10}>
              {r.tag}
            </tspan>
          )}
        </text>
        <text x={right} y={y} fill={t.right} fontSize={t.rightSize} fontWeight={t.rightWeight} textAnchor="end">
          {r.right}
        </text>
        {r.sub && (
          <text x={left} y={y + 6 + h + 4} fill={t.sub} fontSize={11} dominantBaseline="hanging">
            {r.sub}
          </text>
        )}
      </g>
    );
  };
  const click = (d: { payload?: { i?: number } }) => {
    const i = d?.payload?.i;
    if (i !== undefined) onEvent?.("click", { dataIndex: i, seriesIndex: 0, name: m.rows[i]?.name });
  };
  const labels = <LabelList valueAccessor={(e: { payload?: { i?: number } }) => e.payload?.i ?? -1} content={RowText} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={rows} margin={{ top: m.grid.top, bottom: m.grid.bottom, left: 0, right: 0 }} barCategoryGap={0} onMouseLeave={() => onEvent?.("globalout", {})}>
        <XAxis type="number" domain={[0, m.max]} hide allowDataOverflow />
        <YAxis type="category" dataKey="i" hide />
        {m.tip && (
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 30, outline: "none" }}
            content={(p: TipProps) => (p.active && p.payload?.length ? <TipBox html={tipHTML(m, p.payload[0]?.payload?.i ?? -1)} tip={m.tip!} /> : null)}
          />
        )}
        {db ? (
          <Bar
            dataKey="range"
            barSize={db.width}
            background={{ fill: m.track, radius: db.width / 2 }}
            isAnimationActive={m.animate}
            animationDuration={650}
            cursor={m.clickable ? "pointer" : "default"}
            onClick={click}
            shape={(p: Box & { payload?: { i?: number } }) => {
              const i = p.payload?.i ?? -1;
              const x = Number(p.x ?? 0);
              const w = Number(p.width ?? 0);
              const y = Number(p.y ?? 0);
              const h = Number(p.height ?? 0);
              const fromLeft = db.from[i] <= db.to[i];
              const cy = y + h / 2;
              return (
                <g>
                  <rect x={x} y={y} width={Math.max(0, w)} height={h} rx={h / 2} fill={db.joins[i]} />
                  <circle cx={fromLeft ? x : x + w} cy={cy} r={4.5} fill={db.fromColor} stroke="#fff" strokeWidth={2} />
                  <circle cx={fromLeft ? x + w : x} cy={cy} r={6} fill={db.toColors[i]} stroke="#fff" strokeWidth={2} />
                </g>
              );
            }}
          >
            {labels}
          </Bar>
        ) : (
          <Bar dataKey="carrier" stackId="p" barSize={m.bars?.[0]?.width ?? m.trackWidth} fill="transparent" background={{ fill: m.track, radius: m.trackWidth / 2 }} isAnimationActive={false} onClick={click}>
            {labels}
          </Bar>
        )}
        {!db &&
          (m.bars ?? []).map((b, bi) => (
            <Bar
              key={bi}
              dataKey={`p${bi}`}
              name={b.name}
              stackId="p"
              barSize={b.width}
              isAnimationActive={m.animate}
              animationDuration={650}
              cursor={m.clickable ? "pointer" : "default"}
              onClick={click}
            >
              {b.data.map((d, i) => (
                <Cell key={i} fill={withAlpha(d.color, d.opacity)} radius={(Array.isArray(d.radius) ? [d.radius[0] ?? 0, d.radius[1] ?? 0, d.radius[2] ?? 0, d.radius[3] ?? 0] : [d.radius, d.radius, d.radius, d.radius]) as never} />
              ))}
            </Bar>
          ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function RechartsChart({ model, onEvent, onDrawn }: EngineProps) {
  useEffect(() => {
    onDrawn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when first drawn
  }, []);
  if (model.kind === "pie") return <PieView m={model} onEvent={onEvent} />;
  if (model.kind === "gauge") return <GaugeView m={model} />;
  if (model.kind === "heatmap") return <HeatView m={model} onEvent={onEvent} />;
  if (model.kind === "rows") return <RowsView m={model} onEvent={onEvent} />;
  return <CartesianChart m={model as ChartModel & Cartesian} onEvent={onEvent} />;
}
