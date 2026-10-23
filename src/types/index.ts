/**
 * Shared typed models for EcoPilot AI.
 * Every surfaced number carries an evidence class so the UI can never present an
 * assumption or a simulation as a real-world measurement.
 */

export type EvidenceClass =
  | "measured"
  | "calculated"
  | "assumption"
  | "interpretation"
  | "simulated"
  | "demo";

export const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  measured: "Measured",
  calculated: "Calculated",
  assumption: "Illustrative assumption",
  interpretation: "AI interpretation",
  simulated: "Hypothetical",
  demo: "Demo data",
};

/* ------------------------------------------------------------------ datasets */

export interface ConsumptionRecord {
  date: string; // ISO yyyy-mm-dd
  electricityKwh: number;
  waterLiters: number;
  costInr: number;
}

export interface RejectedRecord {
  row: number;
  raw: string;
  reason: string;
}

export interface DataQualityWarning {
  code: string;
  message: string;
  count?: number;
}

export interface Dataset {
  id: string;
  name: string;
  source: string;
  isDemo: boolean;
  importedAt: string;
  records: ConsumptionRecord[];
  rejected: RejectedRecord[];
  warnings: DataQualityWarning[];
  acceptedCount: number;
  rejectedCount: number;
  parseDurationMs: number;
}

export type TrendDirection = "rising" | "falling" | "stable";

export interface Anomaly {
  date: string;
  metric: "electricityKwh" | "waterLiters";
  value: number;
  score: number; // robust z-score (MAD based)
  severity: "high" | "medium";
}

export interface AnalysisSummary {
  totalElectricityKwh: number;
  totalWaterLiters: number;
  totalCostInr: number;
  recordCount: number;
  periodDays: number;
  from: string;
  to: string;
  avgDailyElectricityKwh: number;
  avgDailyWaterLiters: number;
  minElectricityKwh: number;
  maxElectricityKwh: number;
  minWaterLiters: number;
  maxWaterLiters: number;
  peakElectricityDate: string;
  peakWaterDate: string;
  electricityTrend: TrendDirection;
  waterTrend: TrendDirection;
  electricityChangePercent: number;
  anomalies: Anomaly[];
  anomaliesExamined: boolean;
}

export interface DerivedAnalysis {
  summary: AnalysisSummary;
  costInr: number;
  costSource: "measured" | "partial" | "estimated";
  costMethod: string;
  emissionsKg: number;
  emissionsAvailable: boolean;
  emissionsMethod: string;
}

/* ------------------------------------------------------------------ settings */

export interface AppSettings {
  electricityRateInrPerKwh: number;
  emissionsFactorKgPerKwh: number;
  theme: "dark" | "light";
  compactDensity: boolean;
  dateRangeDays: 7 | 30 | 90 | 0; // 0 = all
}

export const DEFAULT_SETTINGS: AppSettings = {
  electricityRateInrPerKwh: 8.0,
  emissionsFactorKgPerKwh: 0.82,
  theme: "dark",
  compactDensity: false,
  dateRangeDays: 30,
};

export const ASSUMPTION_DISCLOSURE =
  "Electricity rate and emissions factor are user-configurable illustrative assumptions, not verified local tariffs or official grid factors.";

/* ------------------------------------------------------------------ plans */

export type Priority = "critical" | "high" | "medium" | "low";
export type PlanStatus = "pending" | "in_progress" | "completed";
export type Difficulty = "easy" | "moderate" | "involved";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  evidence: string[];
  priority: Priority;
  expectedImpact: string;
  estimatedSavingsInr: number | null;
  difficulty: Difficulty;
  timeframe: string;
  confidence: "low" | "medium" | "high";
  verification: string;
  datasetId: string;
  generatedAt: string;
  source: "agent" | "analysis";
}

export interface PlanItem extends Recommendation {
  status: PlanStatus;
}

/* ------------------------------------------------------------------ agent */

export const TOOL_NAMES = [
  "get_consumption_summary",
  "detect_consumption_anomalies",
  "estimate_electricity_cost",
  "estimate_emissions",
  "simulate_reduction",
  "create_optimization_plan",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out";

export interface ToolInvocation {
  id: string;
  tool: ToolName;
  purpose: string;
  arguments: Record<string, unknown>;
  status: ToolStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

export type AgentStage =
  | "request_received"
  | "objective_interpreted"
  | "data_selected"
  | "tool_selected"
  | "tool_execution"
  | "results_validated"
  | "recommendation_generated";

export const STAGE_LABEL: Record<AgentStage, string> = {
  request_received: "Request received",
  objective_interpreted: "Objective interpreted",
  data_selected: "Relevant data selected",
  tool_selected: "Analytical tool selected",
  tool_execution: "Tool execution",
  results_validated: "Results validated",
  recommendation_generated: "Recommendation generated",
};

export type AgentMode = "backend" | "fallback";

export interface AgentEvent {
  type: "stage" | "tool";
  stage?: AgentStage;
  at: string;
  invocation?: ToolInvocation;
}

export interface AgentMeasurement {
  label: string;
  value: number;
  unit: string;
  evidenceClass: EvidenceClass;
}

export interface AgentEvidence {
  label: string;
  value: string;
  evidenceClass: EvidenceClass;
}

export interface AgentResponse {
  requestId: string;
  mode: AgentMode;
  status: "ok" | "unsupported" | "error" | "timeout";
  headline: string;
  summary: string;
  evidence: AgentEvidence[];
  measurements: AgentMeasurement[];
  uncertainty?: string;
  actions: string[];
  estimatedImpact?: {
    costSavingsInr?: number;
    emissionsReductionKg?: number;
    label: string;
  };
  assumptions: string[];
  verification: string;
  invocations: ToolInvocation[];
  followUps: string[];
  error?: string;
  latencyMs?: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  content?: string;
  response?: AgentResponse;
  stages?: AgentStage[];
  createdAt: string;
  latencyMs?: number;
}

export interface AgentContext {
  datasetId: string | null;
  recordCount: number;
  from: string | null;
  to: string | null;
  electricityRate: number;
  emissionsFactor: number;
}

export interface AgentRequest {
  requestId: string;
  message: string;
  datasetId: string | null;
  context: AgentContext;
  history: Array<{ role: "user" | "agent"; content: string }>;
}

export interface AgentHealth {
  connected: boolean;
  mode: AgentMode;
  detail: string;
  endpoint: string | null;
}

/* ------------------------------------------------------------------ telemetry */

export type ExecutionKind =
  | "csv_parse"
  | "analysis"
  | "agent_request"
  | "tool_execution"
  | "validation"
  | "simulation";

export interface ExecutionLogEntry {
  id: string;
  kind: ExecutionKind;
  label: string;
  status: "succeeded" | "failed" | "timed_out";
  durationMs: number;
  at: string;
  detail?: string;
}

/* ------------------------------------------------------------------ simulator */

export interface SimulationResult {
  reductionPercent: number;
  baselineElectricityKwh: number;
  simulatedElectricityKwh: number;
  baselineCostInr: number | null;
  simulatedCostInr: number | null;
  baselineEmissionsKg: number | null;
  simulatedEmissionsKg: number | null;
  electricitySavedKwh: number;
  costSavingsInr: number | null;
  emissionsReductionKg: number | null;
}

/** A scenario the user actually ran in the simulator. Persisted so other pages reference a real run. */
export interface SimulationScenario {
  reductionPercent: number;
  datasetId: string;
  datasetName: string;
  at: string;
}

export interface SecurityControl {
  id: string;
  category: string;
  name: string;
  description: string;
  status: "verified" | "not_configured" | "not_verified" | "unavailable";
  note: string;
}
