import type { ChartModel } from "./model";

/** What a chart engine reports, in the shape ECharts uses (EChart's onEvent). */
export type EngineEvent = { name?: string; dataIndex?: number; seriesIndex?: number; seriesName?: string; componentType?: string };

export type EngineProps = {
  model: ChartModel;
  onEvent?: (type: "click" | "mouseover" | "mouseout" | "globalout", e: EngineEvent) => void;
  /** Called once the chart is on screen (ends the loading shimmer). */
  onDrawn?: () => void;
};
