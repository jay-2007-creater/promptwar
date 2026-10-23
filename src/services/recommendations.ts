import type {
  AppSettings,
  ConsumptionRecord,
  Priority,
  Recommendation,
} from "@/types";
import { analyze, median } from "./analytics";
import { round2 } from "./calculations";
import { formatDateShort, formatInr, formatNumber } from "@/lib/format";

/**
 * Rule-based recommendation generator.
 *
 * Every recommendation is derived from the accepted records of the active dataset, and each
 * one carries the numeric evidence it was derived from. Savings are only shown when a
 * configured rate allows them to be estimated — otherwise the field is `null` rather than a
 * fabricated figure.
 */

export interface RecommendationContext {
  datasetId: string;
  records: ConsumptionRecord[];
  settings: AppSettings;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function confidenceFor(records: number): Recommendation["confidence"] {
  if (records >= 30) return "high";
  if (records >= 10) return "medium";
  return "low";
}

export function generateRecommendations(
  ctx: RecommendationContext,
): Recommendation[] {
  const { records, settings, datasetId } = ctx;
  if (records.length === 0) return [];

  const { summary } = analyze(records);
  const rate = settings.electricityRateInrPerKwh;
  const confidence = confidenceFor(records.length);
  const generatedAt = new Date().toISOString();
  const out: Recommendation[] = [];

  const electricityValues = records.map((r) => r.electricityKwh);
  const medianElectricity = round2(median(electricityValues));

  /* R1 — electricity spikes -------------------------------------------------- */
  const elecAnomalies = summary.anomalies.filter((a) => a.metric === "electricityKwh");
  if (elecAnomalies.length > 0) {
    const highSeverity = elecAnomalies.filter((a) => a.severity === "high");
    const excessKwh = round2(
      elecAnomalies.reduce(
        (total, a) => total + Math.max(0, a.value - medianElectricity),
        0,
      ),
    );
    const savings = round2(excessKwh * rate);
    out.push({
      id: `rec-elec-spikes-${datasetId}`,
      title: `Investigate ${elecAnomalies.length} electricity spike${
        elecAnomalies.length > 1 ? "s" : ""
      } above the normal band`,
      description:
        "Robust z-score analysis flagged days whose electricity use sits far outside the dataset's typical band. Bring these days back to the observed median and the excess consumption disappears. Spikes are signals — check cooling/heating faults, temporary equipment, or meter misreads before assuming waste.",
      evidence: [
        `Flagged days: ${elecAnomalies
          .map((a) => `${formatDateShort(a.date)} (${formatNumber(a.value, 1)} kWh, z=${a.score})`)
          .slice(0, 5)
          .join(", ")}`,
        `Dataset median electricity use: ${formatNumber(medianElectricity, 1)} kWh/day`,
        `Excess consumption above the median across flagged days: ${formatNumber(excessKwh, 1)} kWh`,
        highSeverity.length > 0
          ? `${highSeverity.length} of these are high-severity outliers`
          : "All flagged days are moderate outliers",
      ],
      priority: highSeverity.length >= 2 ? "critical" : "high",
      expectedImpact: `${formatNumber(excessKwh, 1)} kWh avoidable if the flagged days had matched the median`,
      estimatedSavingsInr: savings,
      difficulty: "moderate",
      timeframe: "Within 7 days",
      confidence,
      verification:
        "Re-run anomaly detection after the fix. The flagged dates should fall back inside the normal band, and daily kWh should drop toward the median.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  /* R2 — rising electricity trend ------------------------------------------- */
  if (summary.electricityTrend === "rising" && summary.electricityChangePercent > 5) {
    const slice = Math.max(1, Math.min(Math.floor(records.length / 3), 10));
    const firstMean =
      electricityValues.slice(0, slice).reduce((a, b) => a + b, 0) / slice;
    const lastMean =
      electricityValues.slice(-slice).reduce((a, b) => a + b, 0) / slice;
    const deltaPerDay = Math.max(0, lastMean - firstMean);
    const savings = round2(deltaPerDay * slice * rate);
    out.push({
      id: `rec-electricity-trend-${datasetId}`,
      title: "Reverse the rising electricity trend",
      description:
        "Average daily electricity use at the end of the period is materially higher than at the start. Identify what changed in that window — new appliances, extended operating hours, or seasonal load — rather than applying a blanket reduction.",
      evidence: [
        `Opening ${slice}-day average: ${formatNumber(firstMean, 1)} kWh/day`,
        `Closing ${slice}-day average: ${formatNumber(lastMean, 1)} kWh/day`,
        `Change: ${summary.electricityChangePercent > 0 ? "+" : ""}${summary.electricityChangePercent}%`,
      ],
      priority: summary.electricityChangePercent > 15 ? "high" : "medium",
      expectedImpact: `${formatNumber(deltaPerDay * slice, 1)} kWh per ${slice}-day block at the current drift`,
      estimatedSavingsInr: savings,
      difficulty: "moderate",
      timeframe: "Within 14 days",
      confidence,
      verification:
        "Track a 14-day rolling average daily electricity value. A successful intervention flattens or reverses the closing-window trend.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  /* R3 — water anomalies (possible leak) ------------------------------------ */
  const waterAnomalies = summary.anomalies.filter((a) => a.metric === "waterLiters");
  if (waterAnomalies.length > 0) {
    const hasHigh = waterAnomalies.some((a) => a.severity === "high");
    out.push({
      id: `rec-water-anomalies-${datasetId}`,
      title: `Inspect the water system — ${waterAnomalies.length} unusual usage day${
        waterAnomalies.length > 1 ? "s" : ""
      }`,
      description:
        "Water consumption on these days is statistically abnormal for this dataset. Consecutive abnormal days in particular are consistent with a slow leak or a stuck valve, though the data alone cannot confirm the cause.",
      evidence: [
        `Flagged days: ${waterAnomalies
          .map((a) => `${formatDateShort(a.date)} (${formatNumber(a.value)} L, z=${a.score})`)
          .slice(0, 5)
          .join(", ")}`,
        `Average daily water use: ${formatNumber(summary.avgDailyWaterLiters)} L/day`,
      ],
      priority: hasHigh ? "high" : "medium",
      expectedImpact: "Avoided water loss; no monetary estimate without a configured water tariff",
      estimatedSavingsInr: null,
      difficulty: "easy",
      timeframe: "Within 3 days",
      confidence,
      verification:
        "Check the meter over an unoccupied period. A non-zero overnight reading confirms ongoing loss.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  /* R4 — concentration of consumption in peak days --------------------------- */
  const topDays = [...records]
    .sort((a, b) => b.electricityKwh - a.electricityKwh)
    .slice(0, 5);
  const topShare =
    summary.totalElectricityKwh > 0
      ? (topDays.reduce((a, r) => a + r.electricityKwh, 0) /
          summary.totalElectricityKwh) *
        100
      : 0;
  if (records.length >= 10 && topShare >= 18) {
    const topKwh = round2(topDays.reduce((a, r) => a + r.electricityKwh, 0));
    const savings = round2(topKwh * 0.1 * rate);
    out.push({
      id: `rec-peak-concentration-${datasetId}`,
      title: "Redistribute load away from the five heaviest days",
      description:
        "A small number of days dominate total electricity use. Deferring flexible, non-time-critical activity out of those peaks lowers peak demand without reducing total service.",
      evidence: [
        `Top 5 days account for ${formatNumber(topShare, 1)}% of all electricity consumed`,
        `Top 5 days: ${formatDateShort(topDays[0].date)} to ${formatDateShort(topDays[topDays.length - 1].date)}`,
        `Combined: ${formatNumber(topKwh, 1)} kWh`,
      ],
      priority: "medium",
      expectedImpact: `${formatNumber(topKwh * 0.1, 1)} kWh if 10% of peak-day load is deferred`,
      estimatedSavingsInr: savings,
      difficulty: "involved",
      timeframe: "Within 30 days",
      confidence,
      verification:
        "Compare the peak-day share of total consumption before and after scheduling changes. Target a lower share with unchanged total output.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  /* R5 — always-on standby floor -------------------------------------------- */
  if (summary.minElectricityKwh >= 4) {
    const floor = summary.minElectricityKwh;
    const savings = round2(floor * 0.15 * records.length * rate);
    out.push({
      id: `rec-standby-floor-${datasetId}`,
      title: "Audit always-on standby load",
      description:
        "Even the lowest-consumption day still carries a substantial electricity floor, which points to equipment that never fully powers down. Auditing standby draw is low-risk and does not reduce comfort or service levels.",
      evidence: [
        `Lowest observed day: ${formatNumber(floor, 1)} kWh (${formatDateShort(
          records.reduce((m, r) => (r.electricityKwh < m.electricityKwh ? r : m)).date,
        )})`,
        `Assume a 15% reduction of that floor is achievable with no service loss (illustrative assumption)`,
        `Applied across ${records.length} days`,
      ],
      priority: floor >= 6 ? "high" : "medium",
      expectedImpact: `${formatNumber(floor * 0.15 * records.length, 1)} kWh across the analysed period`,
      estimatedSavingsInr: savings,
      difficulty: "easy",
      timeframe: "Within 7 days",
      confidence: "medium",
      verification:
        "Measure consumption during a deliberately unoccupied period before and after switching off standby equipment.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  /* R6 — water efficiency baseline ------------------------------------------ */
  if (summary.avgDailyWaterLiters >= 200) {
    out.push({
      id: `rec-water-efficiency-${datasetId}`,
      title: "Fit flow restrictors and fix detected fittings",
      description:
        "Average daily water use sits above a typical efficient household baseline. Flow restrictors on taps and showers plus prompt fixes for drips reduce consumption without behaviour change.",
      evidence: [
        `Average daily water use: ${formatNumber(summary.avgDailyWaterLiters)} L/day`,
        `Period: ${formatDateShort(summary.from)} to ${formatDateShort(summary.to)} (${summary.periodDays} days)`,
        `Total: ${formatNumber(summary.totalWaterLiters)} L`,
      ],
      priority: "low",
      expectedImpact: "Reduced water consumption; no monetary estimate without a configured water tariff",
      estimatedSavingsInr: null,
      difficulty: "easy",
      timeframe: "Within 30 days",
      confidence,
      verification:
        "Track average daily litres before and after fitting restrictors over a comparable period length.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  if (out.length === 0) {
    out.push({
      id: `rec-baseline-${datasetId}`,
      title: "Establish a longer measurement baseline",
      description:
        "No rule-based inefficiency signal crossed its threshold in this dataset. That is a positive result, but it may also reflect a short or low-variance measurement window. Extending the baseline makes future anomalies meaningful.",
      evidence: [
        `${records.length} records over ${summary.periodDays} days`,
        `Electricity trend: ${summary.electricityTrend} (${summary.electricityChangePercent}%)`,
        `Anomalies detected: ${summary.anomalies.length}`,
      ],
      priority: "low",
      expectedImpact: "Improved detection reliability rather than direct savings",
      estimatedSavingsInr: null,
      difficulty: "easy",
      timeframe: "Within 30 days",
      confidence: "low",
      verification:
        "Re-run analysis once at least 30 clean daily records are available and confirm whether any signal emerges.",
      datasetId,
      generatedAt,
      source: "analysis",
    });
  }

  return out.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return (b.estimatedSavingsInr ?? 0) - (a.estimatedSavingsInr ?? 0);
  });
}

export function totalEstimatedSavings(recs: Recommendation[]): number {
  return round2(
    recs.reduce((total, r) => total + (r.estimatedSavingsInr ?? 0), 0),
  );
}

export function describeSavings(value: number | null): string {
  return value === null ? "Not estimated" : formatInr(value);
}
