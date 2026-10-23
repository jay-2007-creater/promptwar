import { describe, expect, it } from "vitest";
import type { AppSettings, ConsumptionRecord } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import {
  ANOMALY_K,
  MIN_OBSERVATIONS_FOR_ANOMALY,
  analyze,
  buildDerivedAnalysis,
  filterByRange,
  median,
} from "./analytics";
import { SPIKE_DAY_INDEX, makeRecords } from "@/test/fixtures";

describe("analytics", () => {
  it("returns an explicit empty analysis for zero records", () => {
    const output = analyze([]);
    expect(output.summary.recordCount).toBe(0);
    expect(output.summary.anomalies).toHaveLength(0);
    expect(output.anomaliesExamined).toBe(false);
    expect(output.anomalyNote).toMatch(/no records/i);
  });

  it(`does not run anomaly detection below ${MIN_OBSERVATIONS_FOR_ANOMALY} records`, () => {
    const output = analyze(makeRecords(MIN_OBSERVATIONS_FOR_ANOMALY - 1));
    expect(output.anomaliesExamined).toBe(false);
    expect(output.summary.anomalies).toHaveLength(0);
    expect(output.anomalyNote).toMatch(/at least/i);
  });

  it("flags the deliberate outlier with the MAD robust z-score", () => {
    const records = makeRecords();
    const output = analyze(records);
    const flagged = output.summary.anomalies.filter((a) => a.metric === "electricityKwh");
    expect(output.anomaliesExamined).toBe(true);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].date).toBe(records[SPIKE_DAY_INDEX].date);
    expect(Math.abs(flagged[0].score)).toBeGreaterThanOrEqual(ANOMALY_K);
  });

  it("does not flag anything when the series is flat and MAD is zero", () => {
    const flat: ConsumptionRecord[] = makeRecords().map((r) => ({ ...r, electricityKwh: 10 }));
    expect(analyze(flat).summary.anomalies).toHaveLength(0);
  });

  it("computes the median for odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("derives totals, averages and peak day from the series", () => {
    const records = makeRecords();
    const { summary } = analyze(records);
    expect(summary.recordCount).toBe(records.length);
    expect(summary.periodDays).toBe(records.length);
    expect(summary.peakElectricityDate).toBe(records[SPIKE_DAY_INDEX].date);
    expect(summary.maxElectricityKwh).toBe(62);
    expect(summary.avgDailyElectricityKwh).toBeCloseTo(
      summary.totalElectricityKwh / summary.periodDays,
      1,
    );
  });

  it("reports a rising trend for a steadily increasing series", () => {
    const rising: ConsumptionRecord[] = makeRecords(12).map((r, i) => ({
      ...r,
      electricityKwh: 10 + i * 2,
    }));
    expect(analyze(rising).summary.electricityTrend).toBe("rising");
  });

  it("filters records to the requested trailing window", () => {
    const records = makeRecords(30);
    const window = filterByRange(records, 7);
    expect(window).toHaveLength(7);
    expect(window[window.length - 1].date).toBe(records[records.length - 1].date);
  });

  it("labels cost as estimated when no measured cost_inr is present", () => {
    const derived = buildDerivedAnalysis(makeRecords(10), DEFAULT_SETTINGS);
    expect(derived.costSource).toBe("estimated");
    expect(derived.costInr).toBeCloseTo(
      derived.summary.totalElectricityKwh * DEFAULT_SETTINGS.electricityRateInrPerKwh,
      1,
    );
  });

  it("labels cost as measured when every record carries a cost", () => {
    const withCost = makeRecords(10).map((r) => ({ ...r, costInr: r.electricityKwh * 8 }));
    const derived = buildDerivedAnalysis(withCost, DEFAULT_SETTINGS);
    expect(derived.costSource).toBe("measured");
  });

  it("labels cost as partial when only some records carry a cost", () => {
    const mixed = makeRecords(10).map((r, i) => ({ ...r, costInr: i < 4 ? r.electricityKwh * 8 : 0 }));
    const derived = buildDerivedAnalysis(mixed, DEFAULT_SETTINGS);
    expect(derived.costSource).toBe("partial");
  });

  it("marks emissions unavailable when no factor is configured", () => {
    const noFactor: AppSettings = { ...DEFAULT_SETTINGS, emissionsFactorKgPerKwh: 0 };
    const derived = buildDerivedAnalysis(makeRecords(10), noFactor);
    expect(derived.emissionsAvailable).toBe(false);
    expect(derived.emissionsKg).toBe(0);
    expect(derived.emissionsMethod).toMatch(/no emissions factor/i);
  });
});
