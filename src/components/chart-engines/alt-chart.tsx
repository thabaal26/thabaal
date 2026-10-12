"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import type { ChartTheme } from "@/lib/chart-theme";
import { toModel, type ChartModel } from "./model";
import { drawOption } from "./style";
import type { EngineEvent, EngineProps } from "./types";

export type AltEngine = "recharts" | "chartjs";

const engines: Partial<Record<AltEngine, Promise<ComponentType<EngineProps>>>> = {};
const load = (e: AltEngine) => (engines[e] ??= (e === "chartjs" ? import("./chartjs") : import("./recharts")).then((m) => m.default));

/**
 * Draws an EChart's option with Recharts or Chart.js (the portal's chart library setting). It reads
 * the option into the neutral model at the box's size and theme, and calls `onUnsupported` when the
 * chart needs ECharts after all.
 */
export function AltChart({
  engine,
  option,
  dark,
  onEvent,
  onDrawn,
  onUnsupported,
  styleTick,
}: {
  engine: AltEngine;
  option: (t: ChartTheme, size: { width: number; height: number }) => Record<string, unknown>;
  dark: boolean;
  onEvent?: (type: "click" | "mouseover" | "mouseout" | "globalout", e: EngineEvent) => void;
  onDrawn: () => void;
  onUnsupported: () => void;
  /** Changes when the portal's chart style or colours change, to redraw. */
  styleTick: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [Engine, setEngine] = useState<ComponentType<EngineProps> | null>(null);
  const [model, setModel] = useState<ChartModel | null>(null);
  const unsupported = useRef(onUnsupported);
  useEffect(() => {
    unsupported.current = onUnsupported;
  });

  useEffect(() => {
    let alive = true;
    load(engine).then((C) => alive && setEngine(() => C));
    return () => {
      alive = false;
    };
  }, [engine]);

  // The model follows the box's size, light/dark and the data (a new `option`).
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let first = true;
    let w = -1;
    const build = () => {
      const opt = drawOption(option, node, dark, first);
      first = false;
      const m = toModel(opt, { width: node.clientWidth, height: node.clientHeight });
      if (!m) unsupported.current();
      else setModel(m);
    };
    const ro = new ResizeObserver(() => {
      if (node.clientWidth === w) return;
      w = node.clientWidth;
      build();
    });
    ro.observe(node);
    const mo = new MutationObserver(build);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [option, dark, styleTick]);

  return <div ref={box} className="absolute inset-0">{Engine && model && <Engine model={model} onEvent={onEvent} onDrawn={onDrawn} />}</div>;
}
