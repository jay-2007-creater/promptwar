import type { AppSettings, ConsumptionRecord } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { parseCsv } from "./csvParser";
import { analyze } from "./analytics";
import { electricityCost, emissionsKg, round2, simulateReduction } from "./calculations";
import { runTool, type EngineContext } from "./tools";

/**
 * Repeatable regression suite.
 *
 * These checks run the REAL engine functions against fixed fixtures — no mocks, no simulated
 * results. Durations are measured with `performance.now()` and reported as measured values.
 * A failing check reports exactly what was expected versus what the engine produced.
 */

export interface TestResult {
  id: string;
  name: string;
  expected: string;
  status: "passed" | "failed";
  durationMs: number;
  detail: string;
}

export interface TestSuiteReport {
  results: TestResult[];
  passed: number;
  failed: number;
  durationMs: number;
  at: string;
}

const VALID_CSV = [
  "date,electricity_kwh,water_liters,cost_inr",
  "2024-05-01,10.5,120,84",
  "2024-05-02,11.2,118,89.6",
  "2024-05-03,10.9,131,87.2",
].join("\n");

const INVALID_CSV = ["date,usage_kwh,water_liters", "2024-05-01,10.5,120", "not-a-date,x,9"].join("\n");

function fixtureRecords(days = 20): ConsumptionRecord[] {
  const records: ConsumptionRecord[] = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    records.push({
      date,
      electricityKwh: i === 10 ? 62 : 10 + (i % 3) * 0.4,
      waterLiters: 100 + (i % 4) * 5,
      costInr: 0,
    });
  }
  return records;
}

function fixtureContext(settings: AppSettings): EngineContext {
  return {
    datasetId: "test-fixture",
    records: fixtureRecords(),
    settings,
    isDemo: false,
  };
}

function runCase(
  id: string,
  name: string,
  expected: string,
  check: () => { ok: boolean; detail: string },
): TestResult {
  const started = performance.now();
  try {
    const outcome = check();
    return {
      id,
      name,
      expected,
      status: outcome.ok ? "passed" : "failed",
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      detail: outcome.detail,
    };
  } catch (error) {
    return {
      id,
      name,
      expected,
      status: "failed",
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      detail: `Threw ${error instanceof Error ? error.message : "an unknown error"}`,
    };
  }
}

export function runTestSuite(settings: AppSettings = DEFAULT_SETTINGS): TestSuiteReport {
  const started = performance.now();
  const ctx = fixtureContext(settings);

  const results: TestResult[] = [
    runCase(
      "valid-csv",
      "Valid CSV import",
      "3 accepted records, 0 rejected",
      () => {
        const parsed = parseCsv(VALID_CSV, "fit-valid.csv");
        return {
          ok: parsed.ok && parsed.records.length === 3 && parsed.rejected.length === 0,
          detail: `ok=${parsed.ok} · accepted=${parsed.records.length} · rejected=${parsed.rejected.length} · ${Math.round(parsed.parseDurationMs * 100) / 100} ms`,
        };
      },
    ),
    runCase(
      "invalid-csv",
      "Invalid CSV is rejected",
      "Missing required columns are reported, nothing imported",
      () => {
        const parsed = parseCsv(INVALID_CSV, "fit-invalid.csv");
        return {
          ok: !parsed.ok && parsed.records.length === 0 && parsed.missingColumns.includes("electricity_kwh"),
          detail: parsed.fatalError ?? "No fatal error was reported",
        };
      },
    ),
    runCase(
      "empty-dataset",
      "Empty dataset analysis",
      "Zero records and anomaly scan not applicable",
      () => {
        const output = analyze([]);
        return {
          ok: output.summary.recordCount === 0 && output.anomaliesExamined === false,
          detail: `records=${output.summary.recordCount} · anomaliesExamined=${output.anomaliesExamined}`,
        };
      },
    ),
    runCase(
      "cost-calculation",
      "Electricity cost calculation",
      "10 kWh × ₹8/kWh = ₹80",
      () => {
        const value = electricityCost(10, 8);
        return { ok: value === 80, detail: `electricityCost(10, 8) = ${value}` };
      },
    ),
    runCase(
      "emissions-calculation",
      "Emissions calculation",
      "10 kWh × 0.82 kg/kWh = 8.2 kg CO2e",
      () => {
        const value = round2(emissionsKg(10, 0.82));
        return { ok: value === 8.2, detail: `emissionsKg(10, 0.82) = ${value}` };
      },
    ),
    runCase(
      "anomaly-detection",
      "MAD anomaly detection",
      "A 62 kWh day in a ~10 kWh series is flagged",
      () => {
        const output = analyze(fixtureRecords());
        const flagged = output.summary.anomalies.length;
        return {
          ok: output.anomaliesExamined && flagged >= 1,
          detail: `examined=${output.anomaliesExamined} · flagged=${flagged} · k=3.5`,
        };
      },
    ),
    runCase(
      "reduction-simulation",
      "Reduction simulation",
      "100 kWh − 15% = 85 kWh, 15 kWh saved, ₹120 avoided at ₹8/kWh",
      () => {
        const sim = simulateReduction(100, 15, 8, 0.82);
        return {
          ok:
            sim.simulatedElectricityKwh === 85 &&
            sim.electricitySavedKwh === 15 &&
            sim.costSavingsInr === 120,
          detail: `simulated=${sim.simulatedElectricityKwh} kWh · saved=${sim.electricitySavedKwh} kWh · cost saved=₹${sim.costSavingsInr}`,
        };
      },
    ),
    runCase(
      "invalid-tool-arguments",
      "Invalid tool arguments are refused",
      "reductionPercent = 250 fails validation before execution",
      () => {
        const result = runTool("simulate_reduction", { reductionPercent: 250 }, ctx);
        return {
          ok: !result.ok && typeof result.error === "string" && result.output === undefined,
          detail: result.error ?? "Tool executed despite out-of-range arguments",
        };
      },
    ),
    runCase(
      "missing-dataset",
      "Tool refuses to run without a dataset",
      "get_consumption_summary returns an error instead of placeholder figures",
      () => {
        const result = runTool(
          "get_consumption_summary",
          {},
          { datasetId: null, records: [], settings, isDemo: false },
        );
        return {
          ok: !result.ok && result.output === undefined,
          detail: result.error ?? "Tool produced output with no dataset loaded",
        };
      },
    ),
  ];

  return {
    results,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    at: new Date().toISOString(),
  };
}
