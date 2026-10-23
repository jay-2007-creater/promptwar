import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  MessageSquare,
  PlusCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import type {
  AgentMessage,
  AgentRequest,
  AgentResponse,
  AgentStage,
  ToolInvocation,
} from "@/types";
import { STAGE_LABEL, TOOL_NAMES, ASSUMPTION_DISCLOSURE } from "@/types";
import { SUGGESTED_PROMPTS, SUPPORTED_OBJECTIVES, describeToolOutput, runAgent } from "@/services/agentService";
import { TOOL_PURPOSE, type EngineContext } from "@/services/tools";
import { useActiveRecords } from "@/hooks/useAnalysis";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, MethodNote } from "@/components/ui/Card";
import { EvidenceChip, Pill, ToolStatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatDateShort, formatDuration, formatInr, formatNumber, formatTime } from "@/lib/format";

export default function Agent() {
  const { dataset, records, rangeDays, allRecords } = useActiveRecords();
  const settings = useAppStore((s) => s.settings);
  const messages = useAppStore((s) => s.messages);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const clearConversation = useAppStore((s) => s.clearConversation);
  const logExecution = useAppStore((s) => s.logExecution);
  const { health, refresh: refreshHealth } = useAgentHealth();

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [liveStages, setLiveStages] = useState<AgentStage[]>([]);
  const [liveInvocations, setLiveInvocations] = useState<ToolInvocation[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const stagesRef = useRef<AgentStage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" && m.content)
        .map((m) => ({ id: m.id, content: m.content as string, at: m.createdAt })),
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, liveInvocations.length, running]);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || running) return;

      setFatal(null);
      setInput("");
      const requestId = `req-${Date.now().toString(36)}`;
      const userMessage: AgentMessage = {
        id: `${requestId}-user`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const agentMessageId = `${requestId}-agent`;
      appendMessage(userMessage);
      appendMessage({
        id: agentMessageId,
        role: "agent",
        stages: [],
        createdAt: new Date().toISOString(),
      });

      stagesRef.current = [];
      setLiveStages([]);
      setLiveInvocations([]);
      setRunning(true);
      setRunningId(agentMessageId);

      const ctx: EngineContext = {
        datasetId: dataset?.id ?? null,
        records,
        settings,
        isDemo: dataset?.isDemo,
      };

      const request: AgentRequest = {
        requestId,
        message: text,
        datasetId: ctx.datasetId,
        context: {
          datasetId: ctx.datasetId,
          recordCount: records.length,
          from: records[0]?.date ?? null,
          to: records[records.length - 1]?.date ?? null,
          electricityRate: settings.electricityRateInrPerKwh,
          emissionsFactor: settings.emissionsFactorKgPerKwh,
        },
        history: messages
          .filter((m) => m.content)
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content as string })),
      };

      const startedAt = performance.now();
      try {
        const response = await runAgent({
          request,
          ctx,
          onEvent: (event) => {
            if (event.type === "stage" && event.stage) {
              const stage = event.stage;
              stagesRef.current = stagesRef.current.includes(stage)
                ? stagesRef.current
                : [...stagesRef.current, stage];
              setLiveStages(stagesRef.current);
            }
            if (event.type === "tool" && event.invocation) {
              const invocation = event.invocation;
              setLiveInvocations((previous) => [
                ...previous.filter(
                  (existing) =>
                    existing.id !== invocation.id &&
                    !(existing.status === "running" && existing.tool === invocation.tool),
                ),
                invocation,
              ]);
            }
          },
        });

        updateMessage(agentMessageId, {
          response,
          stages: stagesRef.current,
          latencyMs: response.latencyMs ?? performance.now() - startedAt,
        });

        const latency = response.latencyMs ?? performance.now() - startedAt;
        logExecution({
          kind: "agent_request",
          label: `Agent · ${response.headline}`,
          status: response.status === "ok" ? "succeeded" : "failed",
          durationMs: latency,
          detail: `${response.invocations.length} tool call(s) · mode ${response.mode} · status ${response.status}`,
        });
        response.invocations.forEach((invocation) => {
          logExecution({
            kind: "tool_execution",
            label: `${invocation.tool} · ${invocation.status}`,
            status: invocation.status === "succeeded" ? "succeeded" : "failed",
            durationMs: invocation.durationMs ?? 0,
            detail: invocation.error ?? describeToolOutput(invocation).join(" | "),
          });
        });
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : "The agent turn failed with an unknown error before any result was produced.";
        setFatal(detail);
        updateMessage(agentMessageId, {
          stages: stagesRef.current,
          response: {
            requestId,
            mode: health?.mode ?? "fallback",
            status: "error",
            headline: "Agent turn failed",
            summary:
              "The request could not be completed, so no analysis is reported. Nothing is presented as a result when the pipeline does not finish.",
            evidence: [],
            measurements: [],
            actions: ["Retry the request.", "Check Performance → recent executions for the failure record."],
            assumptions: ["A failed turn produces no partial or estimated output."],
            verification: "Re-run the request and confirm the execution timeline completes with validated output.",
            invocations: [],
            followUps: SUGGESTED_PROMPTS.slice(0, 2),
            error: detail,
          },
          latencyMs: performance.now() - startedAt,
        });
        logExecution({
          kind: "agent_request",
          label: "Agent turn failed",
          status: "failed",
          durationMs: performance.now() - startedAt,
          detail,
        });
      } finally {
        setRunning(false);
        setRunningId(null);
      }
    },
    [
      appendMessage,
      dataset,
      health,
      logExecution,
      messages,
      records,
      running,
      settings,
      updateMessage,
    ],
  );

  const resetConversation = useCallback(() => {
    clearConversation();
    stagesRef.current = [];
    setLiveStages([]);
    setLiveInvocations([]);
    setFatal(null);
  }, [clearConversation]);

  const fallbackMode = health?.mode !== "backend";

  return (
    <>
      <div className="mb-5 card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill tone="brand" icon={<Bot size={10} />}>
                Bounded agent
              </Pill>
              {fallbackMode ? (
                <Pill tone="amber" icon={<AlertTriangle size={10} />}>
                  Demonstration workflow · no model connected
                </Pill>
              ) : (
                <Pill tone="mint" icon={<CheckCircle2 size={10} />}>
                  Backend agent connected
                </Pill>
              )}
            </div>
            <h1 className="page-title">AI Agent</h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">
              The agent investigates the active dataset through an approved tool registry, then explains
              what it found. Every number it surfaces is either computed from your records or explicitly
              labelled as an assumption.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Activity size={14} />}
              onClick={() => void refreshHealth()}
            >
              Re-check connection
            </Button>
            <Button variant="secondary" icon={<PlusCircle size={14} />} onClick={resetConversation}>
              New analysis
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-faint">
          <span className="flex items-center gap-1.5">
            <Gauge size={12} />
            {health?.detail ?? "Connection status not yet probed."}
          </span>
          {health?.endpoint ? (
            <span className="font-mono">endpoint: {health.endpoint}</span>
          ) : (
            <span className="font-mono">VITE_AGENT_API_URL: not set</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ------------------------------------------------------------ sidebar */}
        <aside className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader
              title="Current dataset context"
              caption="The agent can only read the active dataset."
              icon={<Database size={15} />}
            />
            <div className="space-y-3 p-4 md:p-5">
              <div>
                <p className="text-sm font-medium text-ink">{dataset?.name ?? "No dataset selected"}</p>
                <p className="mt-0.5 text-2xs text-faint">
                  {dataset?.source ?? "—"} · {dataset?.isDemo ? "generated sample" : "imported"}
                </p>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Records in window</dt>
                  <dd className="num text-muted">
                    {formatNumber(records.length)}
                    <span className="text-faint"> / {formatNumber(allRecords.length)}</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Window</dt>
                  <dd className="text-muted">
                    {rangeDays === 0 ? "all history" : `last ${rangeDays} days`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Coverage</dt>
                  <dd className="text-muted">
                    {records.length > 0
                      ? `${formatDateShort(records[0].date)} → ${formatDateShort(records[records.length - 1].date)}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Electricity rate</dt>
                  <dd className="num text-muted">{formatInr(settings.electricityRateInrPerKwh, 2)}/kWh</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Emissions factor</dt>
                  <dd className="num text-muted">
                    {settings.emissionsFactorKgPerKwh > 0
                      ? `${settings.emissionsFactorKgPerKwh} kg/kWh`
                      : "not configured"}
                  </dd>
                </div>
              </dl>
              {records.length === 0 ? (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-2xs leading-relaxed text-amber-100/90">
                  No records are in the current window. Tool calls will refuse to run rather than return
                  placeholder numbers.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Conversation history"
              caption={`${history.length} request${history.length === 1 ? "" : "s"} in this session`}
              icon={<MessageSquare size={15} />}
            />
            {history.length === 0 ? (
              <p className="px-4 py-3.5 text-xs text-faint md:px-5">
                No requests yet in this session.
              </p>
            ) : (
              <ul className="row-divide">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        document
                          .getElementById(`msg-${item.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-xs transition-colors hover:bg-line/40 md:px-5"
                    >
                      <Clock size={12} className="mt-0.5 shrink-0 text-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-muted">{item.content}</span>
                        <span className="text-2xs text-faint">{formatTime(item.at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Approved tools"
              caption="The only surface a turn can reach — no shell, no arbitrary code, no unrestricted network."
              icon={<Wrench size={15} />}
            />
            <ul className="row-divide">
              {TOOL_NAMES.map((tool) => (
                <li key={tool} className="px-4 py-3 md:px-5">
                  <p className="font-mono text-2xs text-ink">{tool}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-faint">{TOOL_PURPOSE[tool]}</p>
                </li>
              ))}
            </ul>
          </Card>
        </aside>

        {/* ------------------------------------------------------------ thread */}
        <div className="xl:col-span-9">
          <Card className="flex min-h-[560px] flex-col">
            <CardHeader
              title="Investigation thread"
              caption="Responses separate measured evidence from AI interpretation, assumptions and hypothetical results."
              icon={<Sparkles size={15} />}
              actions={
                messages.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={resetConversation}>
                    Clear thread
                  </Button>
                ) : null
              }
            />

            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Agent conversation"
              className="flex-1 space-y-4 p-4 md:p-5"
            >
              {messages.length === 0 && !running ? (
                <div className="space-y-4">
                  <EmptyState
                    icon={<Bot size={22} />}
                    title="No investigation started"
                    description="Ask a question about the active dataset, or pick one of the suggested objectives below. Unsupported requests are refused rather than answered speculatively."
                  />
                  <div>
                    <p className="label-micro mb-2">Objectives the agent can execute</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {SUPPORTED_OBJECTIVES.map((objective) => (
                        <li key={objective} className="flex items-start gap-2 text-xs text-muted">
                          <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-brand" />
                          {objective}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} id={`msg-${message.id}`} className="flex justify-end">
                      <div className="max-w-[85%] rounded-card border border-brand/25 bg-brand/[0.09] px-3.5 py-2.5">
                        <p className="text-sm leading-relaxed text-ink">{message.content}</p>
                        <p className="mt-1 text-2xs text-faint">{formatTime(message.createdAt)}</p>
                      </div>
                    </div>
                  );
                }

                const isLive = running && runningId === message.id;
                return (
                  <div key={message.id} id={`msg-${message.id}`} className="space-y-3">
                    {isLive ? (
                      <LiveTurn stages={liveStages} invocations={liveInvocations} />
                    ) : message.response ? (
                      <ResponseCard response={message.response} stages={message.stages ?? []} />
                    ) : (
                      <EmptyState
                        icon={<XCircle size={18} />}
                        title="No result was recorded for this turn"
                        description="The turn did not complete, so nothing is presented as a finding."
                        tone="error"
                      />
                    )}
                  </div>
                );
              })}

              {fatal ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3.5 py-3"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Turn failed</p>
                    <p className="mt-1 text-xs leading-relaxed text-red-200/85">{fatal}</p>
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>

            {/* ------------------------------------------------------ composer */}
            <div className="border-t border-line p-4 md:p-5">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={running}
                    onClick={() => void submit(prompt)}
                    className="rounded-full border border-line bg-elevated px-3 py-1 text-2xs text-muted transition-colors hover:border-brand/40 hover:text-ink disabled:opacity-45"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submit(input);
                    }
                  }}
                  rows={2}
                  aria-label="Message the agent about the active dataset"
                  placeholder="Ask about consumption, anomalies, cost, emissions, a hypothetical reduction, or an action plan…"
                  className="min-h-[52px] w-full resize-y rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-brand/30 focus:border-brand/60"
                  disabled={running}
                />
                <Button
                  variant="primary"
                  size="md"
                  icon={<Send size={14} />}
                  onClick={() => void submit(input)}
                  disabled={running || input.trim().length === 0}
                >
                  {running ? "Running…" : "Send"}
                </Button>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-faint">
                Enter sends · Shift + Enter adds a line. Tool execution durations shown in the timeline are
                measured with <span className="font-mono">performance.now()</span>, never estimated.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ live turn */

function LiveTurn({
  stages,
  invocations,
}: {
  stages: AgentStage[];
  invocations: ToolInvocation[];
}) {
  return (
    <Card className="border-brand/25">
      <CardHeader
        title="Executing request"
        caption="Steps appear as the pipeline reaches them — nothing is displayed before it happens."
        icon={<Bot size={15} />}
        actions={
          <Pill tone="brand" icon={<Activity size={10} />}>
            Running
          </Pill>
        }
      />
      <div className="p-4 md:p-5">
        <ol className="space-y-2">
          {stages.map((stage) => (
            <li key={stage} className="flex items-center gap-2 text-xs text-muted">
              <CheckCircle2 size={13} className="shrink-0 text-brand" />
              {STAGE_LABEL[stage]}
            </li>
          ))}
          <li className="flex items-center gap-2 text-xs text-faint">
            <Clock size={13} className="shrink-0 animate-pulse" />
            Waiting for the next execution step…
          </li>
        </ol>
        {invocations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="label-micro">Tool invocations</p>
            {invocations.map((invocation) => (
              <InvocationRow key={invocation.id} invocation={invocation} />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ response card */

const STATUS_TONE = {
  ok: "mint",
  unsupported: "amber",
  error: "red",
  timeout: "amber",
} as const;

function ResponseCard({
  response,
  stages,
}: {
  response: AgentResponse;
  stages: AgentStage[];
}) {
  const [showTimeline, setShowTimeline] = useState(true);

  return (
    <Card className="border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS_TONE[response.status]}>
              {response.status === "ok"
                ? "Completed"
                : response.status === "unsupported"
                  ? "Outside approved scope"
                  : response.status === "timeout"
                    ? "Timed out"
                    : "Failed"}
            </Pill>
            {response.mode === "backend" ? (
              <Pill tone="mint" icon={<ShieldCheck size={10} />}>
                Backend reasoning
              </Pill>
            ) : (
              <Pill tone="amber" icon={<AlertTriangle size={10} />}>
                Local deterministic pipeline
              </Pill>
            )}
            {response.latencyMs !== undefined ? (
              <span className="text-2xs text-faint">
                {formatDuration(response.latencyMs)} end-to-end (measured)
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-ink md:text-base">{response.headline}</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowTimeline((v) => !v)}>
          {showTimeline ? "Hide execution timeline" : "Show execution timeline"}
        </Button>
      </div>

      <div className="space-y-4 p-4 md:p-5">
        <p className="text-xs leading-relaxed text-muted md:text-sm">{response.summary}</p>

        {response.error ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5">
            <Ban size={14} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-200/90">{response.error}</p>
          </div>
        ) : null}

        {response.measurements.length > 0 ? (
          <section>
            <p className="label-micro mb-2">Relevant measurements</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {response.measurements.map((measurement) => (
                <div
                  key={measurement.label}
                  className="rounded-lg border border-line bg-hairline/[0.03] px-3 py-2.5"
                >
                  <p className="text-2xs text-faint">{measurement.label}</p>
                  <p className="num mt-1 text-lg font-semibold text-ink">
                    {formatNumber(measurement.value, measurement.unit === "L" ? 0 : 1)}
                    <span className="ml-1 text-xs font-medium text-faint">{measurement.unit}</span>
                  </p>
                  <EvidenceChip evidenceClass={measurement.evidenceClass} className="mt-1.5" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {response.evidence.length > 0 ? (
          <section>
            <p className="label-micro mb-2">Evidence</p>
            <ul className="space-y-2">
              {response.evidence.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="flex flex-wrap items-start gap-x-2.5 gap-y-1 rounded-lg border border-line bg-hairline/[0.03] px-3 py-2.5"
                >
                  <span className="text-2xs font-semibold uppercase tracking-[0.09em] text-faint">
                    {item.label}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">{item.value}</span>
                  <EvidenceChip evidenceClass={item.evidenceClass} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {response.estimatedImpact ? (
          <section className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label-micro">Estimated impact</p>
              <EvidenceChip evidenceClass="simulated" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              {response.estimatedImpact.costSavingsInr !== undefined ? (
                <p className="text-sm text-ink">
                  <span className="num font-semibold">
                    {formatInr(response.estimatedImpact.costSavingsInr)}
                  </span>{" "}
                  <span className="text-faint">avoided expenditure</span>
                </p>
              ) : null}
              {response.estimatedImpact.emissionsReductionKg !== undefined ? (
                <p className="text-sm text-ink">
                  <span className="num font-semibold">
                    {formatNumber(response.estimatedImpact.emissionsReductionKg, 1)}
                  </span>{" "}
                  <span className="text-faint">kg CO2e avoided</span>
                </p>
              ) : null}
            </div>
            <p className="mt-1 text-2xs leading-relaxed text-amber-100/80">
              {response.estimatedImpact.label}
            </p>
          </section>
        ) : null}

        {response.uncertainty ? (
          <section className="rounded-lg border border-line bg-hairline/[0.03] px-3.5 py-3">
            <p className="label-micro mb-1">Detected uncertainty</p>
            <p className="text-xs leading-relaxed text-muted">{response.uncertainty}</p>
          </section>
        ) : null}

        {response.actions.length > 0 ? (
          <section>
            <p className="label-micro mb-2">Recommended actions</p>
            <ol className="space-y-1.5">
              {response.actions.map((action, index) => (
                <li key={action} className="flex gap-2.5 text-xs leading-relaxed text-muted">
                  <span className="num shrink-0 font-semibold text-brand-300">{index + 1}.</span>
                  {action}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="rounded-lg border border-brand/25 bg-brand/[0.06] px-3.5 py-3">
          <p className="label-micro mb-1">Verification method</p>
          <p className="text-xs leading-relaxed text-muted">{response.verification}</p>
        </section>

        <section>
          <p className="label-micro mb-2">Assumptions and limitations</p>
          <ul className="space-y-1.5">
            {response.assumptions.map((assumption) => (
              <li key={assumption} className="flex gap-2 text-2xs leading-relaxed text-faint">
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-400/80" />
                {assumption}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <MethodNote label="What is measured vs. interpreted here?">
              Measurements tagged “Measured” or “Calculated” come from your accepted records and the
              configured factors. “AI interpretation” items are reasoning about those numbers.
              “Hypothetical” items are modelled scenarios that change nothing in the real world.{" "}
              {ASSUMPTION_DISCLOSURE}
            </MethodNote>
          </div>
        </section>

        {showTimeline ? (
          <section className="rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
              <p className="label-micro">Agent execution timeline</p>
              <span className="text-2xs text-faint">
                {response.invocations.length} tool call{response.invocations.length === 1 ? "" : "s"} ·
                durations measured
              </span>
            </div>
            <div className="p-3.5">
              <StageTimeline stages={stages} invocations={response.invocations} />
            </div>
          </section>
        ) : null}

        {response.followUps.length > 0 ? (
          <section className="flex flex-wrap gap-1.5 border-t border-line pt-4">
            {response.followUps.map((followUp) => (
              <span
                key={followUp}
                className="rounded-full border border-line bg-elevated px-3 py-1 text-2xs text-faint"
              >
                {followUp}
              </span>
            ))}
          </section>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ timeline */

function StageTimeline({
  stages,
  invocations,
}: {
  stages: AgentStage[];
  invocations: ToolInvocation[];
}) {
  const ordered: AgentStage[] = [
    "request_received",
    "objective_interpreted",
    "data_selected",
    "tool_selected",
    "tool_execution",
    "results_validated",
    "recommendation_generated",
  ];
  const reached = ordered.filter((stage) => stages.includes(stage));

  if (reached.length === 0 && invocations.length === 0) {
    return (
      <p className="text-2xs text-faint">
        No execution events were emitted for this turn, so no timeline is shown.
      </p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {reached.map((stage) => (
        <li key={stage}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="shrink-0 text-brand" />
            <span className="text-xs font-medium text-ink">{STAGE_LABEL[stage]}</span>
          </div>
          {stage === "tool_selected" && invocations.length > 0 ? (
            <p className="mt-1 pl-5 font-mono text-2xs text-faint">
              {invocations.map((invocation) => invocation.tool).join(" → ")}
            </p>
          ) : null}
          {stage === "tool_execution" && invocations.length > 0 ? (
            <div className="mt-2 space-y-2 pl-5">
              {invocations.map((invocation) => (
                <InvocationRow key={invocation.id} invocation={invocation} />
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function InvocationRow({ invocation }: { invocation: ToolInvocation }) {
  const outputs = describeToolOutput(invocation);
  return (
    <div className="rounded-lg border border-line bg-hairline/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-2xs text-ink">{invocation.tool}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ToolStatusPill status={invocation.status} />
          <span className="text-2xs text-faint">
            {invocation.durationMs !== undefined
              ? `${formatDuration(invocation.durationMs)} (measured)`
              : "duration not measured"}
          </span>
        </div>
      </div>
      <p className="mt-1 text-2xs leading-relaxed text-faint">{invocation.purpose}</p>
      <p className="mt-1 font-mono text-2xs text-faint">id: {invocation.id}</p>

      {outputs.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {outputs.map((line) => (
            <li key={line} className="flex gap-2 text-2xs leading-relaxed text-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-2">
        <summary className="cursor-pointer text-2xs text-faint transition-colors hover:text-muted">
          Arguments and raw output
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-bg/60 p-2 font-mono text-2xs leading-relaxed text-muted">
          {JSON.stringify(
            { arguments: invocation.arguments, output: invocation.output ?? null, error: invocation.error ?? null },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
