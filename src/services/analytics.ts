import type {
  Anomaly,
  AppSettings,
  ConsumptionRecord,
  DerivedAnalysis,
  TrendDirection,
} from "@/types";
import { ASSUMPTION_DISCLOSURE } from "@/types";
import { electricityCost, emissionsKg, round2 } from "./calculations";

/**
 * Analytics layer — deterministic statistics over accepted records only.
 *
 * Anomaly method: robust z-score built on the Median Absolute Deviation (MAD), which is far
 * less sensitive to outliers than a standard deviation. A record is flagged when
 * |0.6745 · (x − median) / MAD| >= k (default k = 3.5).
 *
 * IMPORTANT: an anomaly is a statistical signal that warrants investigation. It is not proof
 * of waste, a fault, or equipment failure, and the UI must say so.
 */

export const ANOMALY_K = 3.5;
export const MIN_OBSERVATIONS_FOR_ANOMALY = 8;

export const ANOMALY_METHOD_NOTE =
  `Robust z-score on median absolute deviation (MAD), threshold k = ${ANOMALY_K}. ` +
  "Flags statistical outliers only — investigate before drawing conclusions.";

export function filterByRange(
  records: ConsumptionRecord[],
  days: number,
): ConsumptionRecord[] {
  if (!days || days <= 0 || records.length === 0) return records;
  const last = records[records.length - 1].date;
  const end = new Date(`${last}T00:00:00Z`).getTime();
  const start = end - (days - 1) * 86_400_000;
  return records.filter(
    (r) => new Date(`${r.date}T00:00:00Z`).getTime() >= start,
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function trendFor(values: number[]): { direction: TrendDirection; changePercent: number } {
  if (values.length < 4) return { direction: "stable", changePercent: 0 };
  const slice = Math.min(Math.floor(values.length / 3), 10);
  const first = mean(values.slice(0, slice));
  const last = mean(values.slice(values.length - slice));
  if (first === 0) return { direction: "stable", changePercent: 0 };
  const changePercent = ((last - first) / first) * 100;
  if (changePercent > 5) return { direction: "rising", changePercent: round2(changePercent) };
  if (changePercent < -5) return { direction: "falling", changePercent: round2(changePercent) };
  return { direction: "stable", changePercent: round2(changePercent) };
}

function detectFor(
  records: ConsumptionRecord[],
  metric: "electricityKwh" | "waterLiters",
  k: number,
): Anomaly[] {
  const values = records.map((r) => r[metric]);
  if (values.length < MIN_OBSERVATIONS_FOR_ANOMALY) return [];

  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const mad = median(deviations);
  if (mad === 0) return []; // more than half the values identical — MAD undefined

  const anomalies: Anomaly[] = [];
  records.forEach((record, i) => {
    const score = (0.6745 * (values[i] - med)) / mad;
    if (Math.abs(score) >= k) {
      anomalies.push({
        date: record.date,
        metric,
        value: values[i],
        score: round2(score),
        severity: Math.abs(score) >= k * 1.4 ? "high" : "medium",
      });
    }
  });
  return anomalies;
}

export interface AnalysisOutput {
  summary: import("@/types").AnalysisSummary;
  anomaliesExamined: boolean;
  anomalyNote: string;
}

export function analyze(
  records: ConsumptionRecord[],
  k = ANOMALY_K,
): AnalysisOutput {
  if (records.length === 0) {
    return {
      summary: {
        totalElectricityKwh: 0,
        totalWaterLiters: 0,
        totalCostInr: 0,
        recordCount: 0,
        periodDays: 0,
        from: "",
        to: "",
        avgDailyElectricityKwh: 0,
        avgDailyWaterLiters: 0,
        minElectricityKwh: 0,
        maxElectricityKwh: 0,
        minWaterLiters: 0,
        maxWaterLiters: 0,
        peakElectricityDate: "",
        peakWaterDate: "",
        electricityTrend: "stable",
        waterTrend: "stable",
        electricityChangePercent: 0,
        anomalies: [],
        anomaliesExamined: false,
      },
      anomaliesExamined: false,
      anomalyNote: "No records available for analysis.",
    };
  }

  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : 1));
  const from = sorted[0].date;
  const to = sorted[sorted.length - 1].date;
  const periodDays = daysBetween(from, to);

  const electricity = sorted.map((r) => r.electricityKwh);
  const water = sorted.map((r) => r.waterLiters);

  const peakElectricity = sorted.reduce((best, r) =>
    r.electricityKwh > best.electricityKwh ? r : best,
  );
  const peakWater = sorted.reduce((best, r) =>
    r.waterLiters > best.waterLiters ? r : best,
  );

  const electricityTrend = trendFor(electricity);
  const waterTrend = trendFor(water);

  const electricityAnomalies = detectFor(sorted, "electricityKwh", k);
  const waterAnomalies = detectFor(sorted, "waterLiters", k);
  const anomalies = [...electricityAnomalies, ...waterAnomalies].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  const examined = sorted.length >= MIN_OBSERVATIONS_FOR_ANOMALY;
  const anomalyNote = examined
    ? ANOMALY_METHOD_NOTE
    : `Anomaly detection requires at least ${MIN_OBSERVATIONS_FOR_ANOMALY} valid records; ${sorted.length} available.`;

  return {
    summary: {
      totalElectricityKwh: round2(sum(electricity)),
      totalWaterLiters: round2(sum(water)),
      totalCostInr: round2(sum(sorted.map((r) => r.costInr))),
      recordCount: sorted.length,
      periodDays,
      from,
      to,
      avgDailyElectricityKwh: round2(sum(electricity) / periodDays),
      avgDailyWaterLiters: round2(sum(water) / periodDays),
      minElectricityKwh: round2(Math.min(...electricity)),
      maxElectricityKwh: round2(Math.max(...electricity)),
      minWaterLiters: round2(Math.min(...water)),
      maxWaterLiters: round2(Math.max(...water)),
      peakElectricityDate: peakElectricity.date,
      peakWaterDate: peakWater.date,
      electricityTrend: electricityTrend.direction,
      waterTrend: waterTrend.direction,
      electricityChangePercent: electricityTrend.changePercent,
      anomalies,
      anomaliesExamined: examined,
    },
    anomaliesExamined: examined,
    anomalyNote,
  };
}

/**
 * Cost and emissions for a record set.
 * - Cost is MEASURED only when every record carries a positive cost_inr value.
 * - Otherwise it is CALCULATED from the configured rate (flagged as an illustrative assumption).
 * - Emissions always require a configured factor, so they are always CALCULATED.
 */
export function buildDerivedAnalysis(
  records: ConsumptionRecord[],
  settings: AppSettings,
): DerivedAnalysis {
  const { summary } = analyze(records);
  const withCost = records.filter((r) => r.costInr > 0);
  const totalMeasuredCost = sum(withCost.map((r) => r.costInr));
  const kwhWithoutCost = sum(
    records.filter((r) => !(r.costInr > 0)).map((r) => r.electricityKwh),
  );

  let costSource: DerivedAnalysis["costSource"];
  let costInr: number;
  let costMethod: string;

  if (records.length > 0 && withCost.length === records.length) {
    costSource = "measured";
    costInr = totalMeasuredCost;
    costMethod = "Sum of measured cost_inr values from the imported file.";
  } else if (withCost.length > 0) {
    costSource = "partial";
    costInr =
      totalMeasuredCost + electricityCost(kwhWithoutCost, settings.electricityRateInrPerKwh);
    costMethod = `${withCost.length} rows use measured cost_inr; the remaining ${round2(
      kwhWithoutCost,
    )} kWh is priced at the configured rate of ₹${settings.electricityRateInrPerKwh}/kWh.`;
  } else {
    costSource = "estimated";
    costInr = electricityCost(summary.totalElectricityKwh, settings.electricityRateInrPerKwh);
    costMethod = `${round2(summary.totalElectricityKwh)} kWh × ₹${settings.electricityRateInrPerKwh}/kWh. ${ASSUMPTION_DISCLOSURE}`;
  }

  const emissionsAvailable = settings.emissionsFactorKgPerKwh > 0;
  const emissions = emissionsAvailable
    ? emissionsKg(summary.totalElectricityKwh, settings.emissionsFactorKgPerKwh)
    : 0;

  return {
    summary: { ...summary, totalCostInr: round2(costInr) },
    costInr: round2(costInr),
    costSource,
    costMethod,
    emissionsKg: round2(emissions),
    emissionsAvailable,
    emissionsMethod: emissionsAvailable
      ? `${round2(summary.totalElectricityKwh)} kWh × ${settings.emissionsFactorKgPerKwh} kg CO2e/kWh. ${ASSUMPTION_DISCLOSURE}`
      : "No emissions factor configured. Set one in Settings to enable this estimate.",
  };
}
