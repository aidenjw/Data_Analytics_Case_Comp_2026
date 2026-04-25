import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

import { formatMoney } from "../../lib/formatters";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export default function TrendChart({ data }: { data: Array<{ year: string; amount: number }> }) {
  const years = useMemo(() => data.map((item) => item.year), [data]);
  const values = useMemo(() => data.map((item) => Number(item.amount ?? 0)), [data]);
  const option = useMemo(
    () => ({
      color: ["#35d6a4"],
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ axisValue: string; data: number }>) => {
          const point = params[0];
          return `${point.axisValue}<br/>${formatMoney(point.data)}`;
        },
      },
      grid: { left: 44, right: 20, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        data: years,
        axisLine: { lineStyle: { color: "#42636a" } },
        axisLabel: { color: "#d7eef2" },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#d7eef2", formatter: (value: number) => formatMoney(value) },
        splitLine: { lineStyle: { color: "rgba(182, 218, 224, 0.12)" } },
      },
      series: [
        {
          type: "line",
          smooth: true,
          data: values,
          symbolSize: 9,
          lineStyle: { width: 4 },
          areaStyle: { opacity: 0.18 },
        },
      ],
    }),
    [values, years],
  );

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: 280, width: "100%" }} notMerge lazyUpdate />;
}
