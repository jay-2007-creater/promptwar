import type {
  Anomaly,
  AppSettings,
  ConsumptionRecord,
  Recommendation,
  SimulationResult,
  ToolName,
} from "@/types";
import { buildDerivedAnalysis } from "./analytics";
import { analyze } from "./analytics";
import { round2, simulateReduction } from "./calculations";
import { generateRecommendations } from "./recommendations";
import { formatDateShort, formatInr, formatNumber } from "@/lib/format";

/**
 * Bounded tool registry.
 *
 * This is the ONLY surface an agent turn can reach. There is no shell access, no dynamic
 * code evaluation, and no unrestricted network call. Arguments are validated against a
 * typed contract before execution, and each tool reads only from the active dataset context.
 */

export interface EngineContext {
  datasetId: string | null;
  records: ConsumptionRecord[];
  settings: AppSettings;
  isDemo?: boolean;
}

export const TOOL_PURPOSE: Record<ToolName, string> = {
  get_consumption_summary:
    "Aggregate the active dataset into totals, daily averages, extremes and trend direction.",
  detect_consumption_anomalies:
    "Scan for statistical consumption outliers using a MAD-based robust z-score.",
  estimate_electricity_cost:
    "Convert metered electricity into an estimated expenditure using a configured rate.",
  estimate_emissions:
    "Convert metered electricity into estimated CO2e using a configured emissions factor.",
  simulate_reduction:
    "Model a hypothetical percentage reduction and compute the resulting savings.",
  create_optimization_plan:
    "Rank evidence-backed recommendations from the active dataset's findings.",
};

type Validation<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined };

interface ToolSpec {
  name: ToolName;
  validate(
    args: Record<string, unknown>,
    ctx: EngineContext,
  ): Validation<Record<string, unknown>>;
  execute(args: Record<string, unknown>, ctx: EngineContext): unknown;
}

function requireNonEmptyDataset(ctx: EngineContext): Validation<Record<string, never>> {
  if (!ctx.datasetId || ctx.records.length === 0) {
    return {
      ok: false,
      error:
        "No dataset is loaded, so this tool cannot produce a measured result. Import a dataset in Data Analysis first.",
    };
  }
  return { ok: true, value: {} };
}

function checkDatasetId(
  args: Record<string, unknown>,
  ctx: EngineContext,
): string | null {
  const requested = args.datasetId;
  if (requested === undefined) return null;
  if (typeof requested !== "string") return "datasetId must be a string.";
  if (ctx.datasetId && requested !== ctx.datasetId) {
    return `Unknown dataset "${requested}". Only the active dataset can be analysed.`;
  }
  return null;
}

function numberOf(
  value: unknown,
  name: string,
  { min, max }: { min?: number; max?: number } = {},
): number | string {
  if (value === undefined) return `Missing required numeric argument: ${name}.`;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${name} must be a finite number.`;
  }
  if (min !== undefined && value < min) return `${name} must be >= ${min}.`;
  if (max !== undefined && value > max) return `${name} must be <= ${max}.`;
  return value;
}

const toolSpecs: ToolSpec[] = [
  {
    name: "get_consumption_summary",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      return { ok: true, value: {} };
    },
    execute(_args, ctx) {
      const { summary } = analyze(ctx.records);
      return {
        recordCount: summary.recordCount,
        periodDays: summary.periodDays,
        from: summary.from,
        to: summary.to,
        totalElectricityKwh: summary.totalElectricityKwh,
        totalWaterLiters: summary.totalWaterLiters,
        avgDailyElectricityKwh: summary.avgDailyElectricityKwh,
        avgDailyWaterLiters: summary.avgDailyWaterLiters,
        minElectricityKwh: summary.minElectricityKwh,
        maxElectricityKwh: summary.maxElectricityKwh,
        peakElectricityDate: summary.peakElectricityDate,
        electricityTrend: summary.electricityTrend,
        electricityChangePercent: summary.electricityChangePercent,
        waterTrend: summary.waterTrend,
      };
    },
  },
  {
    name: "detect_consumption_anomalies",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      if (args.k !== undefined) {
        const k = numberOf(args.k, "k", { min: 0.5, max: 10 });
        if (typeof k === "string") return { ok: false, error: k };
        return { ok: true, value: { k } };
      }
      return { ok: true, value: {} };
    },
    execute(args, ctx) {
      const k = typeof args.k === "number" ? args.k : undefined;
      const result = analyze(ctx.records, k);
      return {
        method:
          "Robust z-score on median absolute deviation (MAD); k = " + (k ?? 3.5),
        examined: result.anomaliesExamined,
        note: result.anomalyNote,
        anomalyCount: result.summary.anomalies.length,
        anomalies: result.summary.anomalies.slice(0, 12),
      };
    },
  },
  {
    name: "estimate_electricity_cost",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      if (args.rateInrPerKwh !== undefined) {
        const rate = numberOf(args.rateInrPerKwh, "rateInrPerKwh", { min: 0, max: 1000 });
        if (typeof rate === "string") return { ok: false, error: rate };
        return { ok: true, value: { rateInrPerKwh: rate } };
      }
      return { ok: true, value: {} };
    },
    execute(args, ctx) {
      const rate =
        typeof args.rateInrPerKwh === "number"
          ? args.rateInrPerKwh
          : ctx.settings.electricityRateInrPerKwh;
      const derived = buildDerivedAnalysis(ctx.records, {
        ...ctx.settings,
        electricityRateInrPerKwh: rate,
      });
      return {
        costInr: derived.costInr,
        rateInrPerKwh: rate,
        source: derived.costSource,
        method: derived.costMethod,
        totalElectricityKwh: derived.summary.totalElectricityKwh,
      };
    },
  },
  {
    name: "estimate_emissions",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      if (args.factorKgPerKwh !== undefined) {
        const factor = numberOf(args.factorKgPerKwh, "factorKgPerKwh", { min: 0, max: 10 });
        if (typeof factor === "string") return { ok: false, error: factor };
        return { ok: true, value: { factorKgPerKwh: factor } };
      }
      return { ok: true, value: {} };
    },
    execute(args, ctx) {
      const factor =
        typeof args.factorKgPerKwh === "number"
          ? args.factorKgPerKwh
          : ctx.settings.emissionsFactorKgPerKwh;
      if (factor <= 0) {
        return {
          available: false,
          method: "No emissions factor configured. Set one in Settings to enable this estimate.",
        };
      }
      const derived = buildDerivedAnalysis(ctx.records, {
        ...ctx.settings,
        emissionsFactorKgPerKwh: factor,
      });
      return {
        available: true,
        emissionsKg: derived.emissionsKg,
        factorKgPerKwh: factor,
        method: derived.emissionsMethod,
      };
    },
  },
  {
    name: "simulate_reduction",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      const percent = numberOf(args.reductionPercent, "reductionPercent", {
        min: 0,
        max: 100,
      });
      if (typeof percent === "string") return { ok: false, error: percent };
      return { ok: true, value: { reductionPercent: percent } };
    },
    execute(args, ctx) {
      const percent = args.reductionPercent as number;
      const total = analyze(ctx.records).summary.totalElectricityKwh;
      const result: SimulationResult = simulateReduction(
        total,
        percent,
        ctx.settings.electricityRateInrPerKwh,
        ctx.settings.emissionsFactorKgPerKwh,
      );
      return { ...result, baselineElectricityKwh: round2(total) };
    },
  },
  {
    name: "create_optimization_plan",
    validate(args, ctx) {
      const empty = requireNonEmptyDataset(ctx);
      if (!empty.ok) return empty;
      const bad = checkDatasetId(args, ctx);
      if (bad) return { ok: false, error: bad };
      return { ok: true, value: {} };
    },
    execute(_args, ctx) {
      const recommendations = generateRecommendations({
        datasetId: ctx.datasetId as string,
        records: ctx.records,
        settings: ctx.settings,
      });
      return {
        count: recommendations.length,
        recommendations,
      };
    },
  },
];

export const TOOL_REGISTRY: Record<ToolName, ToolSpec> = toolSpecs.reduce(
  (acc, spec) => {
    acc[spec.name] = spec;
    return acc;
  },
  {} as Record<ToolName, ToolSpec>,
);

export interface ToolRunResult {
  ok: boolean;
  invocationId: string;
  tool: ToolName;
  output?: unknown;
  error?: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  arguments: Record<string, unknown>;
}

let invocationCounter = 0;

export function newInvocationId(tool: ToolName): string {
  invocationCounter += 1;
  return `${tool}-${Date.now().toString(36)}-${invocationCounter.toString(36)}`;
}

/**
 * Validate then execute a single tool. Duration is measured with `performance.now()` and
 * reported for real — it is never synthesised.
 */
export function runTool(
  tool: ToolName,
  args: Record<string, unknown>,
  ctx: EngineContext,
): ToolRunResult {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const spec = TOOL_REGISTRY[tool];

  if (!spec) {
    return {
      ok: false,
      invocationId: newInvocationId(tool),
      tool,
      error: `Tool "${tool}" is not in the approved registry and cannot be executed.`,
      durationMs: performance.now() - started,
      startedAt,
      finishedAt: new Date().toISOString(),
      arguments: args,
    };
  }

  let effectiveArgs: Record<string, unknown> = { ...args };
  try {
    const validation = spec.validate(args, ctx);
    if (!validation.ok) {
      return {
        ok: false,
        invocationId: newInvocationId(tool),
        tool,
        error: `Argument validation failed: ${validation.error}`,
        durationMs: performance.now() - started,
        startedAt,
        finishedAt: new Date().toISOString(),
        arguments: args,
      };
    }
    effectiveArgs = { ...args, ...validation.value };
    const output = spec.execute(effectiveArgs, ctx);
    return {
      ok: true,
      invocationId: newInvocationId(tool),
      tool,
      output,
      durationMs: performance.now() - started,
      startedAt,
      finishedAt: new Date().toISOString(),
      arguments: effectiveArgs,
    };
  } catch (error) {
    return {
      ok: false,
      invocationId: newInvocationId(tool),
      tool,
      error:
        error instanceof Error
          ? `Tool execution failed: ${error.message}`
          : "Tool execution failed with an unknown error.",
      durationMs: performance.now() - started,
      startedAt,
      finishedAt: new Date().toISOString(),
      arguments: effectiveArgs,
    };
  }
}

/* Shapes of each tool's validated output. Used for presentation formatting and for typing
   the orchestrator's output map, so no tool result is handled as `any`. */
export interface SummaryOutput {
  recordCount: number;
  periodDays: number;
  from: string;
  to: string;
  totalElectricityKwh: number;
  totalWaterLiters: number;
  avgDailyElectricityKwh: number;
  avgDailyWaterLiters: number;
  minElectricityKwh: number;
  maxElectricityKwh: number;
  peakElectricityDate: string;
  electricityTrend: string;
  electricityChangePercent: number;
  waterTrend: string;
}
export interface AnomalyDetectionOutput {
  method: string;
  examined: boolean;
  note: string;
  anomalyCount: number;
  anomalies: Anomaly[];
}
export interface CostOutput {
  costInr: number;
  rateInrPerKwh: number;
  source: string;
  method: string;
  totalElectricityKwh: number;
}
export type EmissionsOutput =
  | { available: true; emissionsKg: number; factorKgPerKwh: number; method: string }
  | { available: false; method: string };
export interface SimulationOutput extends SimulationResult {
  baselineElectricityKwh: number;
}
export interface PlanOutput {
  count: number;
  recommendations: Recommendation[];
}

/** Maps each tool name to the exact shape its validated output takes. */
export interface ToolOutputs {
  get_consumption_summary: SummaryOutput;
  detect_consumption_anomalies: AnomalyDetectionOutput;
  estimate_electricity_cost: CostOutput;
  estimate_emissions: EmissionsOutput;
  simulate_reduction: SimulationOutput;
  create_optimization_plan: PlanOutput;
}

/** Human-readable lines describing a validated tool output, used by the execution timeline. */
export function summarizeOutput(tool: ToolName, output: unknown): string[] {
  if (!output || typeof output !== "object") return ["No output returned."];

  switch (tool) {
    case "get_consumption_summary": {
      const d = output as unknown as SummaryOutput;
      return [
        `${d.recordCount} records · ${d.periodDays} days`,
        `${formatNumber(d.totalElectricityKwh, 1)} kWh electricity total`,
        `${formatNumber(d.avgDailyElectricityKwh, 1)} kWh average per day`,
        `Peak day ${formatDateShort(d.peakElectricityDate)} at ${formatNumber(d.maxElectricityKwh, 1)} kWh`,
        `Electricity trend: ${d.electricityTrend} (${d.electricityChangePercent}%)`,
      ];
    }
    case "detect_consumption_anomalies": {
      const d = output as unknown as AnomalyDetectionOutput;
      return [
        d.examined ? `Anomalies detected: ${d.anomalyCount}` : "Detection not applicable",
        d.method,
        ...(Array.isArray(d.anomalies)
          ? d.anomalies
              .slice(0, 4)
              .map(
                (a) =>
                  `${formatDateShort(a.date)} · ${a.metric} = ${formatNumber(a.value, 1)} (z=${a.score}, ${a.severity})`,
              )
          : []),
      ];
    }
    case "estimate_electricity_cost": {
      const d = output as unknown as CostOutput;
      return [
        `Estimated cost ${formatInr(d.costInr)}`,
        `Rate used ₹${d.rateInrPerKwh}/kWh · basis: ${d.source}`,
        `${formatNumber(d.totalElectricityKwh, 1)} kWh priced`,
      ];
    }
    case "estimate_emissions": {
      const d = output as unknown as EmissionsOutput;
      return d.available
        ? [
            `Estimated emissions ${formatNumber(d.emissionsKg, 1)} kg CO2e`,
            `Factor ${d.factorKgPerKwh} kg CO2e/kWh`,
          ]
        : [d.method];
    }
    case "simulate_reduction": {
      const d = output as unknown as SimulationOutput;
      return [
        `Baseline ${formatNumber(d.baselineElectricityKwh, 1)} kWh → simulated ${formatNumber(
          d.simulatedElectricityKwh,
          1,
        )} kWh (${d.reductionPercent}% reduction)`,
        `Electricity saved ${formatNumber(d.electricitySavedKwh, 1)} kWh`,
        d.costSavingsInr !== null
          ? `Estimated cost saving ${formatInr(d.costSavingsInr)}`
          : "Cost saving not calculable without a configured rate",
        d.emissionsReductionKg !== null
          ? `Estimated emissions reduction ${formatNumber(d.emissionsReductionKg, 1)} kg CO2e`
          : "Emissions reduction not calculable without a configured factor",
      ];
    }
    case "create_optimization_plan": {
      const d = output as unknown as PlanOutput;
      return [
        `${d.count} recommendation${d.count === 1 ? "" : "s"} generated`,
        ...(Array.isArray(d.recommendations)
          ? d.recommendations.slice(0, 4).map((r) => `${r.priority.toUpperCase()} · ${r.title}`)
          : []),
      ];
    }
    default:
      return ["Validated output received."];
  }
}
