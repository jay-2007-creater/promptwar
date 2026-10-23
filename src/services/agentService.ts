import type {
  AgentEvent,
  AgentEvidence,
  AgentMeasurement,
  AgentRequest,
  AgentResponse,
  AgentStage,
  EvidenceClass,
  SimulationResult,
  ToolInvocation,
  ToolName,
} from "@/types";
import { ASSUMPTION_DISCLOSURE } from "@/types";
import { callBackendAgent, isBackendConfigured } from "./api";
import {
  runTool,
  summarizeOutput,
  TOOL_PURPOSE,
  type EngineContext,
  type ToolOutputs,
} from "./tools";
import { formatDateShort, formatInr, formatNumber } from "@/lib/format";

/** The orchestrator only ever stores tool results it has validated. */
type ToolOutputMap = Map<ToolName, unknown>;

/** Typed accessor so each composed section sees the exact tool output shape it expects. */
function outputOf<K extends ToolName>(
  outputs: ToolOutputMap,
  tool: K,
): ToolOutputs[K] | undefined {
  return outputs.get(tool) as ToolOutputs[K] | undefined;
}

/**
 * Agent orchestrator.
 *
 * Two execution modes, both explicit:
 *  - `backend`  — a secure backend performed Gemini reasoning and returned validated tool output.
 *  - `fallback` — the request was planned and executed locally by the deterministic intent
 *                 planner and the bounded tool registry. No model is involved, and the UI says so.
 *
 * The agent can never invoke anything outside the registry. Unsupported objectives are refused
 * with a clear explanation rather than answered speculatively.
 */

export const SUGGESTED_PROMPTS = [
  "Analyze my consumption data and identify the largest inefficiencies.",
  "Which consumption anomalies should I investigate first?",
  "How much could I save with a hypothetical 15% electricity reduction?",
  "Create a prioritized seven-day sustainability action plan.",
  "Explain the evidence behind the most important recommendation.",
  "Compare the baseline with my latest simulated scenario.",
];

export const SUPPORTED_OBJECTIVES = [
  "Summarise consumption and surface the largest inefficiencies",
  "Rank detected anomalies for investigation",
  "Estimate electricity cost or carbon emissions",
  "Simulate a hypothetical electricity reduction (0–100%)",
  "Produce a prioritised optimization plan",
  "Explain the evidence behind a recommendation",
  "Compare baseline consumption with a simulated scenario",
  "Review water consumption and unusual water usage days",
];

type IntentId =
  | "summary_inefficiencies"
  | "anomalies"
  | "simulate"
  | "plan"
  | "evidence"
  | "compare"
  | "cost"
  | "emissions"
  | "water";

interface Intent {
  id: IntentId;
  objective: string;
  tools: ToolName[];
  reductionPercent?: number;
}

const RULES: Array<{ id: IntentId; objective: string; test: RegExp; needsPercent?: RegExp }> = [
  {
    id: "compare",
    objective: "Compare baseline consumption against a simulated scenario.",
    test: /(compare|versus|\bvs\b|side by side).*(baseline|simulat|scenario)|baseline.*(simulat|scenario)/,
  },
  {
    id: "simulate",
    objective: "Model a hypothetical electricity reduction and quantify the impact.",
    test: /(how much|save|saving|reduce|reduction|cut|lower|off)/,
    needsPercent: /(%|percent|per cent|reduction|cut|lower|save)/,
  },
  {
    id: "plan",
    objective: "Build a prioritised sustainability action plan from measured findings.",
    test: /(action plan|plan|roadmap|priorit|checklist|next steps)/,
  },
  {
    id: "evidence",
    objective: "Explain the evidence behind the leading recommendation.",
    test: /(explain|evidence|why|justify|reason|backing|support)/,
  },
  {
    id: "anomalies",
    objective: "Identify and rank statistical consumption anomalies for investigation.",
    test: /(anomal|outlier|unusual|abnormal|spike|strange|weird|investigate)/,
  },
  {
    id: "cost",
    objective: "Estimate electricity expenditure from the active dataset.",
    test: /(cost|bill|expenditure|price|tariff|money|inr|rupee|spend)/,
  },
  {
    id: "emissions",
    objective: "Estimate carbon emissions attributable to electricity consumption.",
    test: /(emission|carbon|co2|footprint|greenhouse)/,
  },
  {
    id: "water",
    objective: "Review water consumption patterns and unusual usage days.",
    test: /(water|leak|litre|liter|flow)/,
  },
  {
    id: "summary_inefficiencies",
    objective: "Summarise consumption and surface the largest inefficiencies.",
    test: /(analy|summar|inefficien|overview|consumption|usage|pattern|largest|biggest|biggest)/,
  },
];

const TOOLS_BY_INTENT: Record<IntentId, ToolName[]> = {
  summary_inefficiencies: [
    "get_consumption_summary",
    "detect_consumption_anomalies",
    "estimate_electricity_cost",
    "create_optimization_plan",
  ],
  anomalies: ["detect_consumption_anomalies", "get_consumption_summary"],
  simulate: ["simulate_reduction", "get_consumption_summary"],
  plan: ["get_consumption_summary", "detect_consumption_anomalies", "create_optimization_plan"],
  evidence: ["create_optimization_plan", "get_consumption_summary"],
  compare: ["simulate_reduction", "get_consumption_summary"],
  cost: ["estimate_electricity_cost", "get_consumption_summary"],
  emissions: ["estimate_emissions", "get_consumption_summary"],
  water: ["get_consumption_summary", "detect_consumption_anomalies"],
};

export function extractReductionPercent(message: string): number | null {
  const match = message.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

export function classifyIntent(message: string): Intent | null {
  const text = message.toLowerCase();
  for (const rule of RULES) {
    if (!rule.test.test(text)) continue;
    if (rule.needsPercent && !rule.needsPercent.test(text)) continue;
    return {
      id: rule.id,
      objective: rule.objective,
      tools: TOOLS_BY_INTENT[rule.id],
      reductionPercent: extractReductionPercent(message) ?? undefined,
    };
  }
  return null;
}

function evidenceClassFor(ctx: EngineContext): EvidenceClass {
  return ctx.isDemo ? "demo" : "measured";
}

function push<T>(list: T[], item: T | null | undefined) {
  if (item) list.push(item);
}

function measurement(
  label: string,
  value: number,
  unit: string,
  evidenceClass: EvidenceClass,
): AgentMeasurement {
  return { label, value, unit, evidenceClass };
}

function evidence(label: string, value: string, evidenceClass: EvidenceClass): AgentEvidence {
  return { label, value, evidenceClass };
}

/* ------------------------------------------------------------------ composition */

interface CompositionInput {
  intent: Intent;
  ctx: EngineContext;
  outputs: ToolOutputMap;
}

function compose({
  intent,
  ctx,
  outputs,
}: CompositionInput): Omit<AgentResponse, "requestId" | "mode" | "invocations" | "status"> {
  const eClass = evidenceClassFor(ctx);
  const summary = outputOf(outputs, "get_consumption_summary");
  const anomalies = outputOf(outputs, "detect_consumption_anomalies");
  const cost = outputOf(outputs, "estimate_electricity_cost");
  const emissions = outputOf(outputs, "estimate_emissions");
  const sim: SimulationResult | undefined = outputOf(outputs, "simulate_reduction");
  const plan = outputOf(outputs, "create_optimization_plan");

  const measurementList: AgentMeasurement[] = [];
  const evidenceList: AgentEvidence[] = [];
  const actions: string[] = [];
  const assumptions: string[] = [ASSUMPTION_DISCLOSURE];

  push(
    measurementList,
    summary ? measurement("Total electricity", summary.totalElectricityKwh, "kWh", eClass) : null,
  );
  push(
    measurementList,
    summary ? measurement("Average per day", summary.avgDailyElectricityKwh, "kWh/day", eClass) : null,
  );
  push(
    measurementList,
    summary ? measurement("Total water", summary.totalWaterLiters, "L", eClass) : null,
  );
  push(
    measurementList,
    cost ? measurement("Estimated electricity cost", cost.costInr, "INR", "calculated") : null,
  );
  push(
    measurementList,
    emissions?.available
      ? measurement("Estimated emissions", emissions.emissionsKg, "kg CO2e", "calculated")
      : null,
  );

  if (summary) {
    push(
      evidenceList,
      evidence(
        "Measurement window",
        `${formatDateShort(summary.from)} → ${formatDateShort(summary.to)} · ${summary.recordCount} records · ${summary.periodDays} days`,
        eClass,
      ),
    );
    push(
      evidenceList,
      evidence(
        "Trend",
        `Electricity ${summary.electricityTrend} (${summary.electricityChangePercent}%), water ${summary.waterTrend}`,
        "calculated",
      ),
    );
  }
  if (anomalies) {
    push(
      evidenceList,
      evidence(
        "Anomaly scan",
        anomalies.examined
          ? `${anomalies.anomalyCount} flagged by ${anomalies.method}`
          : "Not applicable — insufficient observations",
        "calculated",
      ),
    );
  }

  let headline = "Analysis complete";
  let narrative = "";
  let uncertainty: string | undefined;
  let verification =
    "Re-run the same analysis after the next measurement period and confirm whether the flagged signal persists.";
  let estimatedImpact: AgentResponse["estimatedImpact"];
  const followUps: string[] = [];

  const dataLabel = ctx.isDemo ? "the sample demo dataset" : "your imported dataset";

  switch (intent.id) {
    case "summary_inefficiencies": {
      headline = "Consumption summary and largest inefficiency signals";
      const topRecs = plan?.recommendations?.slice(0, 3) ?? [];
      narrative =
        `Across ${summary.recordCount} records covering ${summary.periodDays} days, ${dataLabel} totals ` +
        `${formatNumber(summary.totalElectricityKwh, 1)} kWh of electricity (${formatNumber(
          summary.avgDailyElectricityKwh,
          1,
        )} kWh/day) and ${formatNumber(summary.totalWaterLiters)} L of water. ` +
        (cost
          ? `Expenditure is estimated at ${formatInr(cost.costInr)} using ₹${cost.rateInrPerKwh}/kWh. `
          : "") +
        (anomalies?.examined
          ? `The anomaly scan flagged ${anomalies.anomalyCount} day${anomalies.anomalyCount === 1 ? "" : "s"} outside the normal band. `
          : "Anomaly detection needs at least 8 valid records, which this dataset does not yet have. ") +
        (topRecs.length
          ? `The largest opportunities, in order: ${topRecs.map((r) => r.title).join("; ")}.`
          : "");
      uncertainty =
        anomalies?.examined && anomalies.anomalyCount > 0
          ? "Anomalies are statistical outliers. They indicate where to look, not what caused the consumption."
          : "With this measurement window, differences smaller than the normal daily variation cannot be separated from noise.";
      actions.push(
        ...(topRecs.length
          ? topRecs.map(
              (r) =>
                `${r.priority.toUpperCase()} — ${r.title} (${r.estimatedSavingsInr !== null ? `≈ ${formatInr(r.estimatedSavingsInr)} estimated saving` : "no monetary estimate"})`,
            )
          : ["Extend the measurement baseline to at least 30 clean daily records."]),
      );
      if (plan) {
        const total = (plan.recommendations ?? []).reduce(
          (sum, r) => sum + (r.estimatedSavingsInr ?? 0),
          0,
        );
        push(
          evidenceList,
          evidence("Recommendations generated", `${plan.count} ranked items`, "interpretation"),
        );
        if (total > 0) {
          estimatedImpact = {
            costSavingsInr: total,
            label: "Sum of all estimated savings below, if every action is completed",
          };
        }
      }
      followUps.push(
        "Which consumption anomalies should I investigate first?",
        "Create a prioritized seven-day sustainability action plan.",
        "How much could I save with a hypothetical 15% electricity reduction?",
      );
      push(
        assumptions,
        "Savings figures combine each recommendation's own assumption; they are not additive in practice and are not guaranteed.",
      );
      break;
    }

    case "anomalies": {
      headline = anomalies?.examined
        ? `${anomalies.anomalyCount} anomal${anomalies.anomalyCount === 1 ? "y" : "ies"} flagged for investigation`
        : "Anomaly detection not applicable to this dataset";
      if (!anomalies?.examined) {
        narrative = `Anomaly detection needs at least 8 valid records to establish a stable normal band; this dataset has ${summary?.recordCount ?? 0}. Import a longer series and re-run.`;
        uncertainty = "No statistical conclusion can be drawn from this few observations.";
        actions.push("Import a dataset covering at least 8 days and re-run the anomaly scan.");
      } else if (anomalies.anomalyCount === 0) {
        narrative =
          "No day exceeded the robust z-score threshold, so consumption is consistent with this dataset's own normal band. That is a stability signal, not proof of efficiency.";
        uncertainty =
          "A short or low-variance window can hide real inefficiency. A longer baseline would raise confidence.";
        actions.push(
          "Keep collecting data and re-run the scan after the next billing period.",
          "Consider lowering the detection threshold k to surface softer deviations.",
        );
      } else {
        const ranked = [...anomalies.anomalies].sort(
          (a, b) => Math.abs(b.score) - Math.abs(a.score),
        );
        const first = ranked.slice(0, 3);
        narrative =
          `The scan flagged ${anomalies.anomalyCount} record${anomalies.anomalyCount === 1 ? "" : "s"}. ` +
          `Investigate in this order: ${first
            .map(
              (a) =>
                `${formatDateShort(a.date)} (${a.metric === "electricityKwh" ? "electricity" : "water"}, ${formatNumber(a.value, 1)}, z=${a.score})`,
            )
            .join("; ")}. The first entry has the largest deviation.`;
        uncertainty =
          "Ordering reflects statistical deviation, not verified cause. Check the associated equipment or meter before concluding that consumption was wasted.";
        first.forEach((a) => {
          evidenceList.push(
            evidence(
              formatDateShort(a.date),
              `${a.metric === "electricityKwh" ? "electricity" : "water"} ${formatNumber(a.value, 1)} · z=${a.score} · ${a.severity} severity`,
              "calculated",
            ),
          );
        });
        actions.push(
          `Check what changed on ${formatDateShort(first[0].date)} — equipment schedule, occupancy, or weather.`,
          "Cross-check the meter reading for the flagged dates for transcription errors.",
          "If consecutive high days appear, inspect for a slow leak or a stuck thermostat.",
        );
        verification =
          "Re-run the scan after corrective action. Flagged dates should drop inside the normal band if the cause was addressed.";
      }
      followUps.push(
        "Create a prioritized seven-day sustainability action plan.",
        "Analyze my consumption data and identify the largest inefficiencies.",
        "Explain the evidence behind the most important recommendation.",
      );
      break;
    }

    case "simulate":
    case "compare": {
      const percent = intent.reductionPercent ?? 15;
      headline = `${percent}% hypothetical electricity reduction`;
      if (sim) {
        narrative =
          `Baseline consumption is ${formatNumber(sim.baselineElectricityKwh, 1)} kWh. ` +
          `A hypothetical ${percent}% reduction gives ${formatNumber(sim.simulatedElectricityKwh, 1)} kWh, ` +
          `saving ${formatNumber(sim.electricitySavedKwh, 1)} kWh. ` +
          (sim.costSavingsInr !== null
            ? `At the configured rate that is ${formatInr(sim.costSavingsInr)} of avoided expenditure`
            : "Avoided expenditure cannot be estimated without a configured rate") +
          (sim.emissionsReductionKg !== null
            ? ` and ${formatNumber(sim.emissionsReductionKg, 1)} kg CO2e of avoided emissions.`
            : ". No emissions factor is configured, so avoided emissions are not estimated.");
        evidenceList.push(
          evidence("Baseline (measured)", `${formatNumber(sim.baselineElectricityKwh, 1)} kWh`, eClass),
          evidence(
            "Simulated (hypothetical)",
            `${formatNumber(sim.simulatedElectricityKwh, 1)} kWh at −${percent}%`,
            "simulated",
          ),
        );
        estimatedImpact = {
          costSavingsInr: sim.costSavingsInr ?? undefined,
          emissionsReductionKg: sim.emissionsReductionKg ?? undefined,
          label: "Hypothetical — assumes the reduction is achieved uniformly",
        };
      }
      uncertainty =
        "This is a modelled scenario, not a forecast. Real reductions depend on which loads you change and when.";
      assumptions.push(
        `Applies a uniform ${percent}% reduction to every day in the window — real-world reductions are rarely uniform.`,
        "Nothing in this simulation changes actual consumption or stored data.",
      );
      actions.push(
        "Open the Impact Simulator to explore other percentages and see the baseline-versus-simulated comparison.",
        percent >= 25
          ? "A reduction this large normally requires a structural change (equipment replacement or schedule change), not just behaviour tweaks."
          : "Start with the highest-severity anomaly day, which offers the largest single-day saving.",
      );
      verification =
        "Compare metered consumption for an equivalent period after the change. Track a rolling 14-day average rather than a single day.";
      followUps.push(
        "Create a prioritized seven-day sustainability action plan.",
        "Which consumption anomalies should I investigate first?",
        "Analyze my consumption data and identify the largest inefficiencies.",
      );
      break;
    }

    case "plan": {
      const recs = plan?.recommendations ?? [];
      headline = `${recs.length}-item prioritised action plan`;
      narrative = recs.length
        ? `Ranked by priority and estimated impact: ${recs
            .map((r, i) => `${i + 1}. ${r.title}`)
            .slice(0, 5)
            .join("; ")}. Each item lists its own evidence and verification method.`
        : "No rule-based inefficiency signal crossed its threshold, so the plan focuses on establishing a stronger measurement baseline.";
      recs.slice(0, 5).forEach((r) => {
        evidenceList.push(
          evidence(
            `${r.priority} · ${r.title}`,
            `${r.expectedImpact}${r.estimatedSavingsInr !== null ? ` · ≈ ${formatInr(r.estimatedSavingsInr)}` : ""} · ${r.timeframe}`,
            "interpretation",
          ),
        );
      });
      actions.push(
        ...recs.slice(0, 5).map((r) => `${r.title} — ${r.timeframe}`),
      );
      const total = recs.reduce((sum, r) => sum + (r.estimatedSavingsInr ?? 0), 0);
      if (total > 0) {
        estimatedImpact = {
          costSavingsInr: total,
          label: "Combined estimate if every action is completed in full",
        };
      }
      uncertainty =
        "Priorities reflect the current measurement window. Re-ranking after new data arrives is expected and healthy.";
      assumptions.push(
        "Estimated savings are upper-bound indications computed from the configured rate, not commitments.",
      );
      actions.push("Open Optimization Plans to set status and track completion for each item.");
      verification =
        "Each recommendation carries its own verification method — confirm improvement against it before marking an item complete.";
      followUps.push(
        "Explain the evidence behind the most important recommendation.",
        "Which consumption anomalies should I investigate first?",
        "How much could I save with a hypothetical 15% electricity reduction?",
      );
      break;
    }

    case "evidence": {
      const top = plan?.recommendations?.[0];
      headline = top ? `Evidence behind: ${top.title}` : "No recommendation evidence available";
      if (top) {
        narrative =
          `The leading item is "${top.title}". It was derived from the following measured evidence rather than a generic best practice: ${top.evidence.join(
            " ",
          )} ${top.description}`;
        top.evidence.forEach((line: string) => evidenceList.push(evidence("Supporting evidence", line, "calculated")));
        evidenceList.push(
          evidence("Confidence", `${top.confidence} · difficulty ${top.difficulty} · ${top.timeframe}`, "interpretation"),
          evidence("How to verify", top.verification, "interpretation"),
        );
        estimatedImpact = top.estimatedSavingsInr !== null
          ? { costSavingsInr: top.estimatedSavingsInr, label: "Estimated saving for this single action" }
          : undefined;
        uncertainty =
          "The evidence shows where consumption deviates from this dataset's own normal band. It does not prove a specific cause.";
        if (top.estimatedSavingsInr !== null) {
          assumptions.push(
            "The saving assumes the identified excess consumption is fully eliminated, which is rarely achieved immediately.",
          );
        }
      }
      actions.push(
        "Open Optimization Plans and expand this item to review its evidence block in full.",
        "Run the verification method listed for this item to confirm improvement.",
      );
      verification =
        top?.verification ??
        "Re-run the analysis after the next measurement period to confirm the finding persists.";
      followUps.push(
        "Create a prioritized seven-day sustainability action plan.",
        "How much could I save with a hypothetical 15% electricity reduction?",
        "Compare the baseline with my latest simulated scenario.",
      );
      break;
    }

    case "cost": {
      headline = cost ? `Estimated electricity expenditure ${formatInr(cost.costInr)}` : "Cost estimate unavailable";
      if (cost) {
        narrative =
          `Total metered electricity is ${formatNumber(cost.totalElectricityKwh, 1)} kWh. ` +
          `At ₹${cost.rateInrPerKwh}/kWh the estimated expenditure is ${formatInr(cost.costInr)}. ` +
          `Basis: ${cost.source === "measured" ? "measured cost values imported from the file" : cost.source === "partial" ? "a mix of measured and derived values" : "derived entirely from the configured rate"}.`;
        evidenceList.push(
          evidence("Rate applied", `₹${cost.rateInrPerKwh} per kWh`, "assumption"),
          evidence("Calculation basis", cost.source, "calculated"),
        );
      }
      uncertainty =
        "If the rate is not your actual tariff, this figure will differ from your bill. Update it in Settings for accuracy.";
      assumptions.push(
        "Assumes a single flat rate with no slab, time-of-use, demand charge, or fixed component.",
      );
      actions.push(
        "Set your real tariff in Settings → Calculations to make this estimate representative.",
        "Open the Impact Simulator to see how avoided kWh translates into avoided expenditure.",
      );
      followUps.push(
        "How much could I save with a hypothetical 15% electricity reduction?",
        "Create a prioritized seven-day sustainability action plan.",
        "Summarise my carbon emissions instead.",
      );
      break;
    }

    case "emissions": {
      headline = emissions?.available
        ? `Estimated emissions ${formatNumber(emissions.emissionsKg, 1)} kg CO2e`
        : "Emissions estimate unavailable";
      narrative = emissions?.available
        ? `${formatNumber(summary?.totalElectricityKwh ?? 0, 1)} kWh at ${emissions.factorKgPerKwh} kg CO2e/kWh gives an estimated ${formatNumber(emissions.emissionsKg, 1)} kg CO2e. Water-related emissions are not estimated because no documented water factor is configured.`
        : "No emissions factor is configured, so no emissions figure is produced. Setting a factor in Settings → Calculations enables this estimate.";
      if (emissions?.available) {
        evidenceList.push(evidence("Factor applied", `${emissions.factorKgPerKwh} kg CO2e/kWh`, "assumption"));
      }
      uncertainty =
        "Grid intensity varies by region, season, and time of day. A single factor is an approximation.";
      assumptions.push(
        "Excludes water-related emissions, embodied emissions, and any non-electricity sources.",
      );
      actions.push(
        "Set a grid factor that matches your region in Settings → Calculations.",
        "Open the Impact Simulator to quantify avoided emissions for a reduction scenario.",
      );
      followUps.push(
        "How much could I save with a hypothetical 15% electricity reduction?",
        "Analyze my consumption data and identify the largest inefficiencies.",
      );
      break;
    }

    case "water": {
      const waterAnoms = (anomalies?.anomalies ?? []).filter(
        (a) => a.metric === "waterLiters",
      );
      headline = waterAnoms.length
        ? `${waterAnoms.length} unusual water usage day${waterAnoms.length === 1 ? "" : "s"}`
        : "Water consumption review";
      narrative =
        `${formatNumber(summary?.totalWaterLiters ?? 0)} L of water across ${summary?.recordCount ?? 0} records, averaging ${formatNumber(
          summary?.avgDailyWaterLiters ?? 0,
        )} L/day. ` +
        (waterAnoms.length
          ? `Abnormal days: ${waterAnoms
              .map((a) => `${formatDateShort(a.date)} (${formatNumber(a.value)} L, z=${a.score})`)
              .join("; ")}.`
          : "No water usage day exceeded the statistical threshold for this dataset.");
      uncertainty =
        "Water cost and water-related emissions are not estimated because no water tariff or water emissions factor is configured.";
      if (waterAnoms.length) {
        actions.push(
          "Check the flagged days for irrigation, filling, or maintenance activity before assuming a leak.",
          "Take an overnight meter reading during an unoccupied period — a non-zero reading indicates ongoing loss.",
        );
      } else {
        actions.push("Continue collecting readings; the scan needs at least 8 valid days to be meaningful.");
      }
      verification =
        "Compare average daily litres before and after any repair or fixture change over an equivalent period.";
      followUps.push(
        "Which consumption anomalies should I investigate first?",
        "Create a prioritized seven-day sustainability action plan.",
      );
      break;
    }
  }

  if (ctx.isDemo) {
    assumptions.push(
      "The active dataset is a generated sample. Findings describe synthetic values and are for demonstration, not any real household or organisation.",
    );
  }

  return {
    headline,
    summary: narrative || headline,
    evidence: evidenceList,
    measurements: measurementList,
    uncertainty,
    actions,
    estimatedImpact,
    assumptions,
    verification,
    followUps,
  };
}

/* ------------------------------------------------------------------ execution */

export interface RunAgentOptions {
  request: AgentRequest;
  ctx: EngineContext;
  onEvent: (event: AgentEvent) => void;
}

function stageEvent(stage: AgentStage): AgentEvent {
  return { type: "stage", stage, at: new Date().toISOString() };
}

function toInvocation(result: ReturnType<typeof runTool>, status: ToolInvocation["status"]): ToolInvocation {
  return {
    id: result.invocationId,
    tool: result.tool,
    purpose: TOOL_PURPOSE[result.tool],
    arguments: result.arguments,
    status,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    output: result.output,
    error: result.error,
  };
}

/** Deterministic local pipeline: intent planning, bounded tool execution, validated composition. */
export async function runLocalAgent({
  request,
  ctx,
  onEvent,
  fallbackReason,
}: RunAgentOptions & { fallbackReason?: string }): Promise<AgentResponse> {
  const started = performance.now();
  const invocations: ToolInvocation[] = [];

  onEvent(stageEvent("request_received"));
  const intent = classifyIntent(request.message);
  onEvent(stageEvent("objective_interpreted"));

  if (!intent) {
    onEvent(stageEvent("results_validated"));
    return {
      requestId: request.requestId,
      mode: "fallback",
      status: "unsupported",
      headline: "Request outside the approved tool set",
      summary:
        "This objective cannot be answered with the approved analytical tools, and the agent will not speculate outside them. Ask about consumption summaries, anomalies, cost, emissions, reduction simulation, comparison against a baseline, water usage, or an action plan.",
      evidence: [
        {
          label: "Supported objectives",
          value: SUPPORTED_OBJECTIVES.join(" · "),
          evidenceClass: "interpretation",
        },
      ],
      measurements: [],
      actions: ["Pick one of the suggested prompts, or rephrase as an analysis question."],
      assumptions: [
        "No result is produced for unsupported requests — the agent never fabricates output.",
      ],
      verification:
        "Re-issue the request using one of the supported objectives and confirm the execution timeline shows validated tool output.",
      invocations,
      followUps: SUGGESTED_PROMPTS.slice(0, 3),
      latencyMs: performance.now() - started,
    };
  }

  if (!ctx.datasetId || ctx.records.length === 0) {
    onEvent(stageEvent("data_selected"));
    return {
      requestId: request.requestId,
      mode: "fallback",
      status: "error",
      headline: "No dataset available",
      summary:
        "No records are loaded, so no measured result can be produced. Import a CSV in Data Analysis or activate the sample dataset, then run the request again.",
      evidence: [
        {
          label: "Active dataset",
          value: "None",
          evidenceClass: "measured",
        },
      ],
      measurements: [],
      actions: [
        "Open Data Analysis and import a CSV using the header date,electricity_kwh,water_liters[,cost_inr].",
        "Or switch to the sample dataset to explore the workflow.",
      ],
      assumptions: ["Tools refuse to run without a dataset rather than returning placeholder numbers."],
      verification: "After import, re-run this request and confirm the timeline reports accepted records.",
      invocations,
      followUps: SUGGESTED_PROMPTS.slice(0, 3),
      latencyMs: performance.now() - started,
    };
  }

  onEvent(stageEvent("data_selected"));

  if (intent.id === "simulate" || intent.id === "compare") {
    intent.reductionPercent = intent.reductionPercent ?? 15;
  }

  onEvent(stageEvent("tool_selected"));

  const outputs: ToolOutputMap = new Map();
  const argsFor = (tool: ToolName): Record<string, unknown> => {
    if (tool === "simulate_reduction") {
      return { datasetId: ctx.datasetId, reductionPercent: intent.reductionPercent ?? 15 };
    }
    return { datasetId: ctx.datasetId };
  };

  for (const tool of intent.tools) {
    const args = argsFor(tool);
    onEvent({
      type: "tool",
      at: new Date().toISOString(),
      invocation: {
        id: `pending-${tool}-${Date.now().toString(36)}`,
        tool,
        purpose: TOOL_PURPOSE[tool],
        arguments: args,
        status: "running",
        startedAt: new Date().toISOString(),
      },
    });

    const result = runTool(tool, args, ctx);
    invocations.push(toInvocation(result, result.ok ? "succeeded" : "failed"));
    if (result.ok) outputs.set(tool, result.output);
    onEvent({
      type: "tool",
      at: new Date().toISOString(),
      invocation: toInvocation(result, result.ok ? "succeeded" : "failed"),
    });
  }

  onEvent(stageEvent("tool_execution"));
  onEvent(stageEvent("results_validated"));

  const failed = invocations.filter((i) => i.status === "failed");
  const composed = compose({ intent, ctx, outputs });
  onEvent(stageEvent("recommendation_generated"));

  const notes: string[] = [];
  if (fallbackReason) notes.push(fallbackReason);
  if (failed.length > 0) {
    notes.push(
      `${failed.length} tool call${failed.length > 1 ? "s" : ""} failed validation or execution: ${failed
        .map((f) => `${f.tool} (${f.error})`)
        .join("; ")}`,
    );
  }

  return {
    requestId: request.requestId,
    mode: "fallback",
    status: failed.length > 0 && outputs.size === 0 ? "error" : "ok",
    ...composed,
    summary: composed.summary,
    assumptions: [...composed.assumptions, ...notes],
    invocations,
    latencyMs: performance.now() - started,
  };
}

/**
 * Entry point used by the UI. Delegates to the secure backend when one is configured and
 * reachable; otherwise runs the deterministic local pipeline. A backend failure is reported
 * in the response rather than silently swallowed.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResponse> {
  if (isBackendConfigured()) {
    try {
      const response = await callBackendAgent(options.request, options.onEvent);
      return {
        ...response,
        mode: "backend",
        latencyMs: response.latencyMs ?? undefined,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? `Backend agent call failed (${error.message}). Fell back to deterministic local execution for this turn.`
          : "Backend agent call failed. Fell back to deterministic local execution for this turn.";
      return runLocalAgent({ ...options, fallbackReason: reason });
    }
  }

  return runLocalAgent(options);
}

export function describeToolOutput(invocation: ToolInvocation): string[] {
  if (invocation.status !== "succeeded" || invocation.output === undefined) {
    return invocation.error ? [invocation.error] : ["No validated output."];
  }
  return summarizeOutput(invocation.tool, invocation.output);
}
