import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, ChartCard, ChartTooltip, axisProps } from "@/components/charts/ChartFrame";
import type { TrendPoint } from "./chartData";
import { formatInr } from "@/lib/format";

const grid = <CartesianGrid stroke={CHART.grid} vertical={false} />;

export function ElectricityChart({
  data,
  height,
  className,
}: {
  data: TrendPoint[];
  height?: number;
  className?: string;
}) {
  return (
    <ChartCard
      title="Electricity consumption over time"
      caption="Daily metered electricity in kilowatt-hours for the active date range"
      height={height}
      className={className}
      isEmpty={data.length === 0}
      emptyTitle="No electricity records in this range"
      emptyDescription="Widen the date range or import a dataset that contains an electricity_kwh column."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="elecFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.34} />
              <stop offset="100%" stopColor={CHART.brand} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey="label" {...axisProps} minTickGap={30} />
          <YAxis {...axisProps} width={52} unit=" kWh" />
          <Tooltip
            content={<ChartTooltip unit="kWh" />}
            cursor={{ stroke: CHART.brand, strokeOpacity: 0.25 }}
          />
          <Area
            type="monotone"
            dataKey="electricity"
            name="Electricity"
            stroke={CHART.brand}
            strokeWidth={1.8}
            fill="url(#elecFill)"
            dot={false}
            activeDot={{ r: 3, fill: CHART.brand, stroke: CHART.tooltipBg }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function WaterChart({
  data,
  height,
  className,
}: {
  data: TrendPoint[];
  height?: number;
  className?: string;
}) {
  return (
    <ChartCard
      title="Water consumption over time"
      caption="Daily water volume in litres. No water emissions are computed without a configured factor."
      height={height}
      className={className}
      isEmpty={data.length === 0}
      emptyTitle="No water records in this range"
      emptyDescription="Import a dataset containing a water_liters column to populate this chart."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.mint} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART.mint} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey="label" {...axisProps} minTickGap={30} />
          <YAxis {...axisProps} width={56} unit=" L" />
          <Tooltip
            content={<ChartTooltip unit="L" />}
            cursor={{ stroke: CHART.mint, strokeOpacity: 0.25 }}
          />
          <Area
            type="monotone"
            dataKey="water"
            name="Water"
            stroke={CHART.mint}
            strokeWidth={1.8}
            fill="url(#waterFill)"
            dot={false}
            activeDot={{ r: 3, fill: CHART.mint, stroke: CHART.tooltipBg }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CostChart({
  data,
  height,
  measured,
  className,
}: {
  data: TrendPoint[];
  height?: number;
  measured: boolean;
  className?: string;
}) {
  return (
    <ChartCard
      title="Estimated electricity expenditure"
      className={className}
      caption={
        measured
          ? "Daily expenditure from measured cost values in the imported file"
          : "Daily expenditure derived from the configured rate — an illustrative assumption, not a billed amount"
      }
      height={height}
      isEmpty={data.length === 0}
      emptyTitle="No cost data in this range"
      emptyDescription="Add a cost_inr column or configure an electricity rate in Settings to enable this chart."
      legend={[
        { label: measured ? "Measured spend" : "Estimated spend", color: CHART.brand },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
          {grid}
          <XAxis dataKey="label" {...axisProps} minTickGap={30} />
          <YAxis {...axisProps} width={62} tickFormatter={(v) => formatInr(Number(v))} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(v) => v} />}
            cursor={{ stroke: CHART.brand, strokeOpacity: 0.25 }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            name={measured ? "Measured spend" : "Estimated spend"}
            stroke={CHART.brand}
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, fill: CHART.brand, stroke: CHART.tooltipBg }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AnomalyChart({
  data,
  height,
  examined,
  className,
}: {
  data: TrendPoint[];
  height?: number;
  examined: boolean;
  className?: string;
}) {
  const anomalyCount = data.filter((p) => p.isAnomaly).length;

  return (
    <ChartCard
      title="Consumption anomalies, where detected"
      caption={
        examined
          ? "Bars highlighted in amber (medium) or red (high) are statistical outliers from the MAD-based scan"
          : "Anomaly detection requires at least 8 valid records — not yet satisfied"
      }
      height={height}
      className={className}
      isEmpty={data.length === 0}
      emptyTitle="No data to scan"
      emptyDescription="Import at least 8 daily records to enable anomaly detection."
      legend={[
        { label: "Within normal band", color: CHART.neutral },
        { label: "Medium outlier", color: CHART.amber },
        { label: "High outlier", color: CHART.red },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          {grid}
          <XAxis dataKey="label" {...axisProps} minTickGap={30} />
          <YAxis {...axisProps} width={52} unit=" kWh" />
          <Tooltip
            content={
              <ChartTooltip
                unit="kWh"
                labelFormatter={(value) => value}
              />
            }
            cursor={{ fill: "rgb(var(--c-hairline) / 0.06)" }}
          />
          <Bar dataKey="electricity" name="Electricity" radius={[2, 2, 0, 0]}>
            {data.map((point) => (
              <Cell
                key={point.date}
                fill={
                  point.severity === "high"
                    ? CHART.red
                    : point.severity === "medium"
                      ? CHART.amber
                      : CHART.neutral
                }
                fillOpacity={point.isAnomaly ? 0.95 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {examined && anomalyCount === 0 ? (
        <p className="-mt-1 pt-2 text-2xs text-faint">
          Scan completed across {data.length} days — no day exceeded the threshold.
        </p>
      ) : null}
    </ChartCard>
  );
}
