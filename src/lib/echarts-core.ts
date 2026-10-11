// Only the parts of Apache ECharts the portal draws with, so the download stays small. Loaded on
// demand by components/echart.tsx the first time a chart scrolls into view.

import * as echarts from "echarts/core";
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkPointComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, ScatterChart, GridComponent, MarkPointComponent, TooltipComponent, VisualMapComponent, LabelLayout, SVGRenderer]);

export default echarts;
