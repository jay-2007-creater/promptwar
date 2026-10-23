import type { Anomaly, ConsumptionRecord } from "@/types";
import { electricityCost } from "@/services/calculations";

export interface TrendPoint {
  date: string;
  label: string;
  electricity: number;
  water: number;
  cost: number;
  isAnomaly: boolean;
  severity: "high" | "medium" | null;
}

export function toTrendPoints(
  records: ConsumptionRecord[],
  rateInrPerKwh: number,
): TrendPoint[] {
  return records.map((record) => ({
    date: record.date,
    label: new Date(`${record.date}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
    electricity: record.electricityKwh,
    water: record.waterLiters,
    cost:
      record.costInr > 0
        ? record.costInr
        : Math.round(electricityCost(record.electricityKwh, rateInrPerKwh) * 100) / 100,
    isAnomaly: false,
    severity: null,
  }));
}

export function markAnomalies(points: TrendPoint[], anomalies: Anomaly[]): TrendPoint[] {
  if (anomalies.length === 0) return points;
  const map = new Map<string, "high" | "medium">();
  anomalies
    .filter((a) => a.metric === "electricityKwh")
    .forEach((a) => {
      const existing = map.get(a.date);
      if (existing === "high") return;
      map.set(a.date, a.severity);
    });
  return points.map((point) => {
    const severity = map.get(point.date);
    return severity
      ? { ...point, isAnomaly: true, severity }
      : point;
  });
}

export function downsampled(points: TrendPoint[], maxPoints = 120): TrendPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0);
}
