import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/Feedback";
import { Card, CardHeader } from "@/components/ui/Card";

export const CHART = {
  brand: "#10B981",
  brandSoft: "rgba(16, 185, 129, 0.16)",
  mint: "#6EE7B7",
  amber: "#F59E0B",
  amberSoft: "rgba(245, 158, 11, 0.16)",
  red: "#EF4444",
  neutral: "#64748B",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  tooltipBg: "rgb(var(--c-elevated))",
  tooltipBorder: "rgb(var(--c-line))",
};

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Structural subset of a Recharts tooltip payload entry that this component renders. */
export interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  stroke?: string;
  dataKey?: string | number;
}

export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  unit?: string;
  labelFormatter?: (value: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-xs"
      style={{
        background: CHART.tooltipBg,
        borderColor: CHART.tooltipBorder,
        minWidth: 158,
        boxShadow: "0 16px 40px -20px rgba(0, 0, 0, 0.75)",
      }}
    >
      <p className="mb-2 border-b border-line pb-1.5 font-display text-xs font-semibold text-ink">
        {labelFormatter ? labelFormatter(String(label)) : label}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey ?? entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="inline-block h-2 w-2 rounded-[3px]"
                style={{ background: entry.color ?? entry.stroke ?? CHART.brand }}
              />
              {entry.name}
            </span>
            <span className="num font-semibold text-ink">
              {typeof entry.value === "number" ? entry.value.toLocaleString("en-IN") : entry.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-2xs text-muted">
          <span
            className={cn("inline-block h-2 w-2 rounded-sm", item.dashed && "opacity-90")}
            style={{
              background: item.dashed ? "transparent" : item.color,
              border: `1px ${item.dashed ? "dashed" : "solid"} ${item.color}`,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  caption,
  height = 260,
  isEmpty,
  emptyTitle = "No data in this range",
  emptyDescription,
  legend,
  actions,
  children,
  className,
}: {
  title: string;
  caption?: string;
  height?: number;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  legend?: LegendItem[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title={title}
        caption={caption}
        actions={actions}
        className="border-b-0 pb-0"
      />
      {legend ? <div className="px-4 pt-2 md:px-5">{legend ? <ChartLegend items={legend} /> : null}</div> : null}
      <div className="p-4 md:p-5" style={{ minHeight: height }}>
        {isEmpty ? (
          <EmptyState
            icon={<BarChart3 size={20} />}
            title={emptyTitle}
            description={emptyDescription}
            className="h-full"
          />
        ) : (
          <div style={{ width: "100%", height }}>{children}</div>
        )}
      </div>
    </Card>
  );
}
