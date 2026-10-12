"use client";

/* Draws a chart model (model.ts) with Recharts (SVG). Loaded only on portals that pick Recharts. */

import { useEffect, useId, useMemo } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tipHTML, withAlpha, type Cartesian, type ChartModel, type PieModel, type Tip } from "./model";
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

export default function RechartsChart({ model, onEvent, onDrawn }: EngineProps) {
  useEffect(() => {
    onDrawn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when first drawn
  }, []);
  return model.kind === "pie" ? <PieView m={model} onEvent={onEvent} /> : <CartesianChart m={model as ChartModel & Cartesian} onEvent={onEvent} />;
}
