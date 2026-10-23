import { describe, expect, it } from "vitest";
import type { AgentContext, AgentEvent, AgentRequest } from "@/types";
import { classifyIntent, runAgent, runLocalAgent } from "./agentService";
import { makeContext } from "@/test/fixtures";

function makeRequest(message: string, ctx: ReturnType<typeof makeContext>): AgentRequest {
  const context: AgentContext = {
    datasetId: ctx.datasetId,
    recordCount: ctx.records.length,
    from: ctx.records[0]?.date ?? null,
    to: ctx.records[ctx.records.length - 1]?.date ?? null,
    electricityRate: ctx.settings.electricityRateInrPerKwh,
    emissionsFactor: ctx.settings.emissionsFactorKgPerKwh,
  };
  return {
    requestId: "test-request",
    message,
    datasetId: ctx.datasetId,
    context,
    history: [],
  };
}

const noop = () => {};

describe("intent classifier", () => {
  it("maps analysis objectives onto supported intents", () => {
    expect(classifyIntent("Analyze my consumption data")?.id).toBe("summary_inefficiencies");
    expect(classifyIntent("Which anomalies should I investigate first?")?.id).toBe("anomalies");
    expect(classifyIntent("Create a prioritized action plan")?.id).toBe("plan");
    expect(classifyIntent("Estimate my emissions")?.id).toBe("emissions");
    expect(classifyIntent("Review my water usage")?.id).toBe("water");
  });

  it("returns null for objectives outside the approved tool set", () => {
    expect(classifyIntent("Write me a poem about solar panels")).toBeNull();
  });
});

describe("agent orchestrator (deterministic fallback)", () => {
  it("refuses an unsupported objective instead of speculating", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("Write me a poem about solar panels", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.status).toBe("unsupported");
    expect(response.invocations).toHaveLength(0);
    expect(response.summary).toMatch(/approved analytical tools/i);
  });

  it("returns an explicit error when no dataset is loaded", async () => {
    const ctx = makeContext({ datasetId: null, records: [] });
    const response = await runLocalAgent({
      request: makeRequest("Analyze my consumption data", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.status).toBe("error");
    expect(response.invocations).toHaveLength(0);
    expect(response.summary).toMatch(/no records are loaded/i);
  });

  it("runs the full summary pipeline and labels evidence classes", async () => {
    const ctx = makeContext();
    const events: AgentEvent[] = [];
    const response = await runLocalAgent({
      request: makeRequest("Analyze my consumption data and identify the largest inefficiencies.", ctx),
      ctx,
      onEvent: (event) => events.push(event),
    });

    expect(response.mode).toBe("fallback");
    expect(response.status).toBe("ok");
    expect(response.invocations.length).toBeGreaterThan(0);
    expect(response.invocations.every((i) => i.status === "succeeded")).toBe(true);
    expect(response.measurements.length).toBeGreaterThan(0);
    expect(response.measurements.every((m) => m.evidenceClass)).toBe(true);
    expect(response.assumptions.length).toBeGreaterThan(0);
    expect(response.verification).toBeTruthy();
    expect(events.some((e) => e.type === "stage" && e.stage === "results_validated")).toBe(true);
  });

  it("reports the flagged anomaly date in the narrative", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("Which consumption anomalies should I investigate first?", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.status).toBe("ok");
    expect(response.headline).toMatch(/flagged for investigation/i);
    expect(response.summary).toMatch(/investigate in this order/i);
    expect(response.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("parses an explicit reduction percentage from the request", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("How much could I save with a 25% electricity reduction?", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.status).toBe("ok");
    expect(response.headline).toContain("25%");
  });

  it("defaults to a 15% reduction when no percentage is supplied", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("How much could I save by reducing electricity?", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.headline).toContain("15%");
  });

  it("produces a prioritised plan with per-item evidence", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("Create a prioritized seven-day sustainability action plan.", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.status).toBe("ok");
    expect(response.headline).toMatch(/action plan/i);
    expect(response.actions.length).toBeGreaterThan(0);
  });

  it("never leaves a tool invocation without a terminal status", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("Estimate my electricity cost", ctx),
      ctx,
      onEvent: noop,
    });
    for (const invocation of response.invocations) {
      expect(["succeeded", "failed", "timed_out"]).toContain(invocation.status);
    }
  });

  it("always discloses the configurable assumptions", async () => {
    const ctx = makeContext();
    const response = await runLocalAgent({
      request: makeRequest("Estimate my emissions", ctx),
      ctx,
      onEvent: noop,
    });
    expect(response.assumptions.join(" ")).toMatch(/illustrative/i);
  });

  it("falls back to local execution when no backend is configured", async () => {
    const ctx = makeContext();
    const response = await runAgent({
      request: makeRequest("Analyze my consumption data", ctx),
      ctx,
      onEvent: noop,
    });
    // VITE_AGENT_API_URL is unset in the test environment, so this must never report "backend".
    expect(response.mode).toBe("fallback");
    expect(response.status).toBe("ok");
  });
});
