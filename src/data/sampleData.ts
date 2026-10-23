import type { ConsumptionRecord, Dataset } from "@/types";

/**
 * Deterministic sample dataset.
 *
 * This data is SYNTHETIC. It is always rendered with a "DEMO DATA" badge and must never
 * be described as a real-world measurement. A seeded generator keeps it stable between
 * reloads so demos and comparisons are reproducible.
 */

const SAMPLE_SEED = 20260114;

/** Mulberry32 — small deterministic PRNG so the demo dataset never shifts between runs. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const SAMPLE_DAYS = 90;

export function buildSampleRecords(days = SAMPLE_DAYS): ConsumptionRecord[] {
  const random = createRandom(SAMPLE_SEED);
  const records: ConsumptionRecord[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // Household/office baseline: higher weekday occupancy, moderate seasonal drift.
    const seasonal = 1 + 0.13 * Math.sin((offset / days) * Math.PI * 1.6);
    const base = isWeekend ? 9.4 : 13.6;
    const noise = (random() - 0.5) * 2.6;
    let electricityKwh = Math.max(2.5, (base + noise) * seasonal);

    // Water follows occupancy with a weaker daily variance.
    let waterLiters = (isWeekend ? 168 : 214) * seasonal + (random() - 0.5) * 38;

    // Two deliberate, documented events so anomaly detection has something real to find.
    const dayIndex = days - 1 - offset;
    if (dayIndex >= 22 && dayIndex <= 24) {
      electricityKwh *= 1.72; // cooling/heating fault window
    }
    if (dayIndex >= 51 && dayIndex <= 53) {
      waterLiters *= 2.35; // possible leak window
    }
    if (dayIndex === 68) {
      electricityKwh *= 1.9; // single-day spike
    }

    records.push({
      date: isoDate(date),
      electricityKwh: Math.round(electricityKwh * 100) / 100,
      waterLiters: Math.round(waterLiters),
      costInr: 0, // 0 signals "derive from configured rate" rather than an imported cost figure
    });
  }

  return records;
}

export const SAMPLE_DATASET_ID = "dataset-sample";

export function buildSampleDataset(): Dataset {
  const records = buildSampleRecords();
  return {
    id: SAMPLE_DATASET_ID,
    name: "Sample household — 90 days",
    source: "Generated sample dataset (synthetic)",
    isDemo: true,
    importedAt: new Date().toISOString(),
    records,
    rejected: [],
    warnings: [
      {
        code: "synthetic",
        message:
          "Synthetic demo dataset. Values are illustrative and do not represent any real household or organisation.",
      },
      {
        code: "no_cost_column",
        message:
          "No measured cost column in this dataset. Electricity expenditure is derived from the configured rate.",
      },
    ],
    acceptedCount: records.length,
    rejectedCount: 0,
    parseDurationMs: 0,
  };
}
