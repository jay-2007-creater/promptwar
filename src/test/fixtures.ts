import type { AppSettings, ConsumptionRecord } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import type { EngineContext } from "@/services/tools";

/** Index of the deliberate outlier in the generated fixture series. */
export const SPIKE_DAY_INDEX = 10;

/**
 * Deterministic record series used across the service tests.
 * Default values sit in a narrow ~10–11 kWh band so a single large day is a genuine outlier.
 */
export function makeRecords(days = 20, spikeKwh = 62): ConsumptionRecord[] {
  const records: ConsumptionRecord[] = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < days; i += 1) {
    records.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      electricityKwh: i === SPIKE_DAY_INDEX ? spikeKwh : 10 + (i % 3) * 0.4,
      waterLiters: 100 + (i % 4) * 5,
      costInr: 0,
    });
  }
  return records;
}

/** Engine context backed by the fixture dataset, with any field overridable. */
export function makeContext(
  overrides: Partial<EngineContext> = {},
  settings: AppSettings = DEFAULT_SETTINGS,
): EngineContext {
  return {
    datasetId: "test-dataset",
    records: makeRecords(),
    settings,
    isDemo: false,
    ...overrides,
  };
}
