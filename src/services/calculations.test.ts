import { describe, expect, it } from "vitest";
import {
  clampReductionPercent,
  electricityCost,
  emissionsKg,
  round0,
  round2,
  simulateReduction,
} from "./calculations";

describe("calculation layer", () => {
  it("computes electricity cost as kWh × configured rate", () => {
    expect(electricityCost(10, 8)).toBe(80);
    expect(electricityCost(0, 8)).toBe(0);
    expect(electricityCost(123.5, 8)).toBeCloseTo(988, 6);
  });

  it("computes emissions as kWh × configured factor", () => {
    expect(emissionsKg(10, 0.82)).toBeCloseTo(8.2, 6);
    expect(emissionsKg(0, 0.82)).toBe(0);
  });

  it("clamps reduction percentages into 0–100 and neutralises NaN", () => {
    expect(clampReductionPercent(15)).toBe(15);
    expect(clampReductionPercent(-5)).toBe(0);
    expect(clampReductionPercent(250)).toBe(100);
    expect(clampReductionPercent(Number.NaN)).toBe(0);
  });

  it("rounds to the requested precision", () => {
    expect(round2(1.006)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
    expect(round0(2.6)).toBe(3);
  });

  it("simulates a 15% reduction end to end", () => {
    const sim = simulateReduction(100, 15, 8, 0.82);
    expect(sim.reductionPercent).toBe(15);
    expect(sim.simulatedElectricityKwh).toBeCloseTo(85, 6);
    expect(sim.electricitySavedKwh).toBeCloseTo(15, 6);
    expect(sim.costSavingsInr).toBeCloseTo(120, 6);
    expect(sim.emissionsReductionKg).toBeCloseTo(12.3, 6);
  });

  it("treats a 0% reduction as an unchanged baseline", () => {
    const sim = simulateReduction(100, 0, 8, 0.82);
    expect(sim.simulatedElectricityKwh).toBe(100);
    expect(sim.electricitySavedKwh).toBe(0);
    expect(sim.costSavingsInr).toBe(0);
  });

  it("clamps an out-of-range reduction instead of producing a negative baseline", () => {
    const sim = simulateReduction(100, 250, 8, 0.82);
    expect(sim.reductionPercent).toBe(100);
    expect(sim.simulatedElectricityKwh).toBeCloseTo(0, 6);
    expect(sim.electricitySavedKwh).toBeCloseTo(100, 6);
  });
});
