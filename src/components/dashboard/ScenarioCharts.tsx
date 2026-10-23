import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, ChartCard, ChartTooltip, axisProps } from "@/components/charts/ChartFrame";

export function BaselineVsSimulatedChart({
  baselineKwh,
  simulatedKwh,
  reductionPercent,
  height,
  caption,
  className,
}: {
  baselineKwh: number;
  simulatedKwh: number;
  reductionPercent: number;
  height?: number;
  caption?: string;
  className?: string;
}) {
  const data = [
    { name: "Baseline", kwh: Math.round(baselineKwh * 100) / 100, simulated: false },
    { name: `−${reductionPercent}% scenario`, kwh: Math.round(simulatedKwh * 100) / 100, simulated: true },
  ];

  return (
    <ChartCard
      title="Baseline versus simulated consumption"
      caption={
        caption ??
        "The simulated bar applies the hypothetical reduction uniformly across every day in the window."
      }
      height={height}
      className={className}
      isEmpty={baselineKwh <= 0}
      emptyTitle="No baseline to compare"
      emptyDescription="A baseline dataset is required before a scenario can be modelled."
      legend={[
        { label: "Measured baseline", color: CHART.brand },
        { label: "Hypothetical scenario", color: CHART.amber },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} width={58} unit=" kWh" />
          <Tooltip
            content={<ChartTooltip unit="kWh" />}
            cursor={{ fill: "rgb(var(--c-hairline) / 0.06)" }}
          />
          <Bar dataKey="kwh" name="Electricity" radius={[3, 3, 0, 0]} maxBarSize={92}>
            <LabelList
              dataKey="kwh"
              position="top"
              fill={CHART.axis}
              fontSize={11}
              formatter={(value: number) => value.toLocaleString("en-IN")}
            />
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.simulated ? CHART.amber : CHART.brand}
                fillOpacity={entry.simulated ? 0.75 : 0.9}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
