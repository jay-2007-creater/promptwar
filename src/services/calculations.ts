import type { SimulationResult } from "@/types";

/**
 * Calculation layer — the single authoritative source for every derived number.
 * Pure functions only: no store access, no side effects, so every result is reproducible
 * and testable. Formulas mirror the technical architecture document exactly.
 */

export function electricityCost(kwh: number, rateInrPerKwh: number): number {
  return kwh * rateInrPerKwh;
}

export function emissionsKg(kwh: number, factorKgPerKwh: number): number {
  return kwh * factorKgPerKwh;
}

export function clampReductionPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Hypothetical scenario. Nothing here changes real-world consumption — the output is always
 * labelled `simulated` in the UI.
 */
export function simulateReduction(
  baselineElectricityKwh: number,
  reductionPercent: number,
  rateInrPerKwh: number,
  factorKgPerKwh: number,
): SimulationResult {
  const percent = clampReductionPercent(reductionPercent);
  const factor = 1 - percent / 100;

  const baselineCost = electricityCost(baselineElectricityKwh, rateInrPerKwh);
  const simulatedElectricityKwh = baselineElectricityKwh * factor;
  const simulatedCost = electricityCost(simulatedElectricityKwh, rateInrPerKwh);

  const baselineEmissions = emissionsKg(baselineElectricityKwh, factorKgPerKwh);
  const simulatedEmissions = emissionsKg(simulatedElectricityKwh, factorKgPerKwh);

  return {
    reductionPercent: percent,
    baselineElectricityKwh,
    simulatedElectricityKwh,
    baselineCostInr: baselineCost,
    simulatedCostInr: simulatedCost,
    baselineEmissionsKg: baselineEmissions,
    simulatedEmissionsKg: simulatedEmissions,
    electricitySavedKwh: baselineElectricityKwh - simulatedElectricityKwh,
    costSavingsInr: baselineCost - simulatedCost,
    emissionsReductionKg: baselineEmissions - simulatedEmissions,
  };
}

function round(value: number, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

export function round2(value: number) {
  return round(value, 2);
}

export function round0(value: number) {
  return round(value, 0);
}
