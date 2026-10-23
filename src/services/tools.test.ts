import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "@/types";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { TOOL_PURPOSE, TOOL_REGISTRY, runTool, summarizeOutput } from "./tools";
import { makeContext, makeRecords } from "@/test/fixtures";

describe("bounded tool registry", () => {
  it("exposes exactly the six documented tools", () => {
    expect(TOOL_NAMES).toHaveLength(6);
    for (const name of TOOL_NAMES) {
      expect(TOOL_REGISTRY[name]).toBeDefined();
      expect(TOOL_PURPOSE[name]).toBeTruthy();
    }
  });

  it("runs the consumption summary against the active dataset", () => {
    const result = runTool("get_consumption_summary", {}, makeContext());
    expect(result.ok).toBe(true);
    const output = result.output as { recordCount: number; totalElectricityKwh: number };
    expect(output.recordCount).toBe(20);
    expect(output.totalElectricityKwh).toBeGreaterThan(0);
  });

  it("refuses to run any tool when no dataset is loaded", () => {
    const result = runTool(
      "get_consumption_summary",
      {},
      makeContext({ datasetId: null, records: [] }),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBeUndefined();
    expect(result.error).toMatch(/no dataset/i);
  });

  it("refuses an unknown datasetId rather than analysing another dataset", () => {
    const result = runTool(
      "get_consumption_summary",
      { datasetId: "some-other-dataset" },
      makeContext(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown dataset/i);
  });

  it("rejects out-of-range numeric arguments before execution", () => {
    const tooHigh = runTool("simulate_reduction", { reductionPercent: 250 }, makeContext());
    expect(tooHigh.ok).toBe(false);
    expect(tooHigh.output).toBeUndefined();

    const wrongType = runTool("simulate_reduction", { reductionPercent: "15" }, makeContext());
    expect(wrongType.ok).toBe(false);

    const badK = runTool("detect_consumption_anomalies", { k: 99 }, makeContext());
    expect(badK.ok).toBe(false);
  });

  it("ignores unrecognised arguments instead of acting on them", () => {
    const result = runTool(
      "get_consumption_summary",
      { dropTable: true, datasetId: "test-dataset" },
      makeContext(),
    );
    expect(result.ok).toBe(true);
  });

  it("flags the fixture outlier through the anomaly tool", () => {
    const result = runTool("detect_consumption_anomalies", {}, makeContext());
    expect(result.ok).toBe(true);
    const output = result.output as { examined: boolean; anomalyCount: number };
    expect(output.examined).toBe(true);
    expect(output.anomalyCount).toBeGreaterThanOrEqual(1);
  });

  it("returns available:false for emissions when no factor is configured", () => {
    const noFactor: AppSettings = { ...DEFAULT_SETTINGS, emissionsFactorKgPerKwh: 0 };
    const result = runTool("estimate_emissions", {}, makeContext({}, noFactor));
    expect(result.ok).toBe(true);
    expect((result.output as { available: boolean }).available).toBe(false);
  });

  it("produces a ranked optimization plan with evidence on every item", () => {
    const result = runTool("create_optimization_plan", {}, makeContext());
    expect(result.ok).toBe(true);
    const output = result.output as {
      count: number;
      recommendations: Array<{ title: string; evidence: string[]; verification: string }>;
    };
    expect(output.count).toBe(output.recommendations.length);
    for (const rec of output.recommendations) {
      expect(rec.title).toBeTruthy();
      expect(rec.evidence.length).toBeGreaterThan(0);
      expect(rec.verification).toBeTruthy();
    }
  });

  it("summarises every tool output for the execution timeline", () => {
    const ctx = makeContext();
    const contexts: Array<[string, Record<string, unknown>]> = [
      ["get_consumption_summary", {}],
      ["detect_consumption_anomalies", {}],
      ["estimate_electricity_cost", {}],
      ["estimate_emissions", {}],
      ["simulate_reduction", { reductionPercent: 15 }],
      ["create_optimization_plan", {}],
    ];
    for (const [tool, args] of contexts) {
      const result = runTool(tool as (typeof TOOL_NAMES)[number], args, ctx);
      expect(result.ok).toBe(true);
      const lines = summarizeOutput(tool as (typeof TOOL_NAMES)[number], result.output);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((line) => typeof line === "string" && line.length > 0)).toBe(true);
    }
  });

  it("returns a safe placeholder for a non-object output", () => {
    expect(summarizeOutput("get_consumption_summary", null)).toEqual(["No output returned."]);
    expect(summarizeOutput("get_consumption_summary", 42)).toEqual(["No output returned."]);
  });

  it("writes fixture records through the engine without mutating the input array", () => {
    const records = makeRecords(12);
    const snapshot = JSON.stringify(records);
    runTool("get_consumption_summary", {}, makeContext({ records }));
    expect(JSON.stringify(records)).toBe(snapshot);
  });
});
