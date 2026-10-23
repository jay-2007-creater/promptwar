import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Gauge,
  ListChecks,
  PlayCircle,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import type { ExecutionKind } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { runTestSuite, type TestSuiteReport } from "@/services/testSuite";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, MethodNote, SectionHeading } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { SegmentedControl } from "@/components/ui/Field";
import { formatDuration, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ExecutionKind, string> = {
  csv_parse: "CSV parse",
  analysis: "Analysis",
  agent_request: "Agent request",
  tool_execution: "Tool execution",
  validation: "Validation",
  simulation: "Simulation",
};

type KindFilter = ExecutionKind | "all";

export default function Performance() {
  const executions = useAppStore((s) => s.executions);
  const clearExecutions = useAppStore((s) => s.clearExecutions);
  const logExecution = useAppStore((s) => s.logExecution);
  const settings = useAppStore((s) => s.settings);
  const { health } = useAgentHealth();

  const [report, setReport] = useState<TestSuiteReport | null>(null);
  const [running, setRunning] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const metrics = useMemo(() => {
    const of = (kind: ExecutionKind) => executions.filter((entry) => entry.kind === kind);
    const csv = of("csv_parse");
    const agent = of("agent_request");
    const tools = of("tool_execution");
    const validation = of("validation");
    const analysis = of("analysis");
    const simulations = of("simulation");

    const mean = (values: number[]) =>
      values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

    const toolDurations = tools.map((entry) => entry.durationMs).filter((value) => value > 0);

    return {
      lastCsv: csv[0] ?? null,
      lastAgentLatency: agent[0]?.durationMs ?? null,
      meanToolDuration: mean(toolDurations),
      agentRequests: agent.length,
      agentFailures: agent.filter((entry) => entry.status !== "succeeded").length,
      toolSucceeded: tools.filter((entry) => entry.status === "succeeded").length,
      toolFailed: tools.filter((entry) => entry.status === "failed").length,
      validationFailures: validation.filter((entry) => entry.status === "failed").length,
      validationRuns: validation.length,
      analysisRuns: analysis.length,
      lastAnalysis: analysis[0] ?? null,
      simulations: simulations.length,
    };
  }, [executions]);

  const filtered = useMemo(
    () => (kindFilter === "all" ? executions : executions.filter((e) => e.kind === kindFilter)),
    [executions, kindFilter],
  );

  const handleRunSuite = () => {
    setRunning(true);
    // Let the busy state paint, then execute the real suite synchronously.
    window.setTimeout(() => {
      const result = runTestSuite(settings);
      setReport(result);
      setRunning(false);
      logExecution({
        kind: "validation",
        label: `Regression suite · ${result.passed}/${result.results.length} passed`,
        status: result.failed === 0 ? "succeeded" : "failed",
        durationMs: result.durationMs,
        detail: result.failed === 0 ? "All checks passed" : `${result.failed} check(s) failed`,
      });
    }, 0);
  };

  return (
    <>
      <SectionHeading
        eyebrow="Performance & Evaluation"
        title="Measured performance and reliability"
        description="Every value on this page comes from an instrumented execution in this browser. Unmeasured metrics say “Not measured” rather than showing a placeholder."
        actions={
          <>
            <Button
              variant="primary"
              icon={<PlayCircle size={14} />}
              onClick={handleRunSuite}
              disabled={running}
            >
              {running ? "Running suite…" : "Run regression suite"}
            </Button>
            {executions.length > 0 ? (
              <Button variant="ghost" onClick={clearExecutions}>
                Clear log
              </Button>
            ) : null}
          </>
        }
      />

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Last CSV parse duration"
          value={metrics.lastCsv ? formatDuration(metrics.lastCsv.durationMs) : null}
          note={metrics.lastCsv ? metrics.lastCsv.label : "No CSV has been parsed yet"}
          icon={<FlaskConical size={15} />}
          tone={metrics.lastCsv?.status === "succeeded" ? "brand" : "amber"}
        />
        <MetricTile
          label="Last agent request latency"
          value={
            metrics.lastAgentLatency !== null ? formatDuration(metrics.lastAgentLatency) : null
          }
          note={
            metrics.lastAgentLatency !== null
              ? "End-to-end turn time, measured in the browser"
              : "No agent request has been made yet"
          }
          icon={<Timer size={15} />}
          tone="brand"
        />
        <MetricTile
          label="Mean tool execution duration"
          value={
            metrics.meanToolDuration !== null ? formatDuration(metrics.meanToolDuration) : null
          }
          note={
            metrics.toolSucceeded + metrics.toolFailed > 0
              ? `${formatNumber(metrics.toolSucceeded)} succeeded · ${formatNumber(metrics.toolFailed)} failed`
              : "No tool executions recorded yet"
          }
          icon={<Gauge size={15} />}
          tone="brand"
        />
        <MetricTile
          label="Last analysis completion"
          value={metrics.lastAnalysis ? formatDuration(metrics.lastAnalysis.durationMs) : null}
          note={
            metrics.lastAnalysis
              ? `${formatNumber(metrics.analysisRuns)} run(s) · ${formatRelative(metrics.lastAnalysis.at)}`
              : "No analysis recompute recorded yet"
          }
          icon={<Activity size={15} />}
          tone={metrics.lastAnalysis?.status === "succeeded" ? "brand" : "amber"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader
            title="Counters"
            caption="Counted from recorded executions in this session"
            icon={<ListChecks size={15} />}
          />
          <dl className="row-divide text-sm">
            <CounterRow label="Agent requests" value={formatNumber(metrics.agentRequests)} />
            <CounterRow
              label="Failed agent turns"
              value={formatNumber(metrics.agentFailures)}
              tone={metrics.agentFailures > 0 ? "red" : "neutral"}
            />
            <CounterRow label="Tool executions succeeded" value={formatNumber(metrics.toolSucceeded)} />
            <CounterRow
              label="Tool executions failed"
              value={formatNumber(metrics.toolFailed)}
              tone={metrics.toolFailed > 0 ? "red" : "neutral"}
            />
            <CounterRow
              label="Validation failures"
              value={formatNumber(metrics.validationFailures)}
              tone={metrics.validationFailures > 0 ? "amber" : "neutral"}
            />
            <CounterRow
              label="Validation runs"
              value={formatNumber(metrics.validationRuns)}
            />
            <CounterRow label="Scenarios recorded" value={formatNumber(metrics.simulations)} />
          </dl>
          <div className="space-y-2 p-4 md:p-5">
            <MethodNote label="What counts as a validation failure?">
              A CSV import is logged with its true outcome: rejected rows, a missing required column, or a
              refused tool argument all record a failure, so the counter reflects real validation results
              rather than the presence of a validation function.
            </MethodNote>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-hairline/[0.03] px-3 py-2.5">
              <ShieldCheck size={13} className="text-brand" />
              <span className="text-xs text-muted">
                AI integration mode:{" "}
                <span className="font-medium text-ink">
                  {health?.mode === "backend" ? "backend (Gemini via secure endpoint)" : "local deterministic pipeline"}
                </span>
              </span>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader
            title="Regression suite"
            caption="Runs the real calculation, parsing, analytics and tool-validation code against fixed fixtures."
            icon={<PlayCircle size={15} />}
            actions={
              report ? (
                <Pill tone={report.failed === 0 ? "mint" : "red"}>
                  {report.passed}/{report.results.length} passed
                </Pill>
              ) : (
                <Pill tone="neutral">Not run</Pill>
              )
            }
          />
          {!report ? (
            <div className="p-4 md:p-5">
              <EmptyState
                icon={<PlayCircle size={20} />}
                title="Suite not run in this session"
                description="Run the suite to execute nine deterministic checks covering CSV validation, empty datasets, cost and emissions maths, anomaly detection, reduction simulation and invalid tool arguments. Results and durations are reported from that run only."
                action={
                  <Button variant="primary" icon={<PlayCircle size={14} />} onClick={handleRunSuite}>
                    Run now
                  </Button>
                }
              />
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3 md:px-5">
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} />
                  Suite duration{" "}
                  <span className="num font-medium text-ink">{formatDuration(report.durationMs)}</span> (measured)
                </span>
                <span className="text-2xs text-faint">{formatRelative(report.at)}</span>
              </div>
              <ul className="row-divide">
                {report.results.map((result) => (
                  <li key={result.id} className="flex items-start gap-3 px-4 py-3 md:px-5">
                    {result.status === "passed" ? (
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" />
                    ) : (
                      <XCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{result.name}</p>
                        <Pill tone={result.status === "passed" ? "mint" : "red"}>{result.status}</Pill>
                        <span className="num text-2xs text-faint">{formatDuration(result.durationMs)}</span>
                      </div>
                      <p className="mt-1 text-2xs leading-relaxed text-faint">Expected: {result.expected}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{result.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Recent executions"
          caption="Newest first · durations measured with performance.now()"
          icon={<Clock size={15} />}
          actions={
            <SegmentedControl<KindFilter>
              size="sm"
              ariaLabel="Filter executions by kind"
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: "all", label: "All" },
                { value: "csv_parse", label: "CSV" },
                { value: "analysis", label: "Analysis" },
                { value: "agent_request", label: "Agent" },
                { value: "tool_execution", label: "Tools" },
                { value: "validation", label: "Validation" },
                { value: "simulation", label: "Simulation" },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <div className="p-4 md:p-5">
            <EmptyState
              icon={<Activity size={20} />}
              title={executions.length === 0 ? "No executions recorded yet" : "No executions match this filter"}
              description={
                executions.length === 0
                  ? "Import a CSV, recompute the analysis, run the agent or record a scenario and the measurements will appear here."
                  : "Choose another category to inspect the rest of the log."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="bg-hairline/[0.05]">
                <tr className="text-2xs uppercase tracking-[0.09em] text-faint">
                  <th className="px-4 py-2.5 font-semibold">Time</th>
                  <th className="px-4 py-2.5 font-semibold">Kind</th>
                  <th className="px-4 py-2.5 font-semibold">Execution</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="row-divide">
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-faint">{formatTime(entry.at)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{KIND_LABEL[entry.kind]}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink">{entry.label}</span>
                      {entry.detail ? (
                        <span className="mt-0.5 block text-2xs text-faint">{entry.detail}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {entry.status === "succeeded" ? (
                        <Pill tone="mint" icon={<CheckCircle2 size={10} />}>
                          Succeeded
                        </Pill>
                      ) : entry.status === "failed" ? (
                        <Pill tone="red" icon={<XCircle size={10} />}>
                          Failed
                        </Pill>
                      ) : (
                        <Pill tone="amber" icon={<AlertTriangle size={10} />}>
                          Timed out
                        </Pill>
                      )}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-muted">
                      {formatDuration(entry.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-2xs leading-relaxed text-faint md:px-5">
          Measured values come from instrumented executions. The regression suite computes results from
          fixed fixtures, so its durations describe the engine rather than your data. Demonstration data
          (the generated sample dataset) is always labelled as such and never mixed into these counters.
        </p>
      </Card>
    </>
  );
}

function MetricTile({
  label,
  value,
  note,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string | null;
  note: string;
  icon: ReactNode;
  tone?: "brand" | "amber";
}) {
  return (
    <div className={cn("card flex flex-col gap-3 p-4", value === null && "border-dashed")}>
      <div className="flex items-start justify-between gap-3">
        <p className="label-micro leading-tight">{label}</p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
            value === null
              ? "bg-hairline/[0.05] text-faint ring-line"
              : tone === "amber"
                ? "bg-amber-500/10 text-amber-300 ring-amber-500/20"
                : "bg-brand/10 text-brand ring-brand/20",
          )}
        >
          {icon}
        </span>
      </div>
      <p className={cn("num text-2xl font-semibold", value === null ? "text-faint" : "text-ink")}>
        {value ?? "Not measured"}
      </p>
      <p className="mt-auto text-2xs leading-relaxed text-faint">{note}</p>
    </div>
  );
}

function CounterRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "red" | "amber";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <dt className="text-xs text-faint">{label}</dt>
      <dd
        className={cn(
          "num text-sm font-semibold",
          tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
