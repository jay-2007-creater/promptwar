import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  FlaskConical,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import type { PlanItem, PlanStatus, Priority, Recommendation } from "@/types";
import { ASSUMPTION_DISCLOSURE } from "@/types";
import { useRecommendations } from "@/hooks/useAnalysis";
import { totalEstimatedSavings } from "@/services/recommendations";
import { isPersistenceAvailable } from "@/services/persistence";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, MethodNote, SectionHeading } from "@/components/ui/Card";
import { Pill, PlanStatusPill, PriorityPill, PLAN_STATUS_LABEL } from "@/components/ui/Badge";
import { EmptyState, ProgressBar } from "@/components/ui/Feedback";
import { SegmentedControl, Select } from "@/components/ui/Field";
import { formatDateLong, formatInr, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const DIFFICULTY_LABEL: Record<Recommendation["difficulty"], string> = {
  easy: "Easy",
  moderate: "Moderate",
  involved: "Involved",
};

type SortKey = "priority" | "savings" | "title";

export default function Plans() {
  const navigate = useNavigate();
  const recommendations = useRecommendations();
  const planStatus = useAppStore((s) => s.planStatus);
  const setPlanStatus = useAppStore((s) => s.setPlanStatus);
  const resetPlanStatus = useAppStore((s) => s.resetPlanStatus);
  const planPersistence = isPersistenceAvailable();

  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = useMemo<PlanItem[]>(
    () =>
      recommendations.map((recommendation) => ({
        ...recommendation,
        status: planStatus[recommendation.id] ?? "pending",
      })),
    [recommendations, planStatus],
  );

  const visible = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        (priorityFilter === "all" || item.priority === priorityFilter) &&
        (statusFilter === "all" || item.status === statusFilter),
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortKey === "savings")
        return (b.estimatedSavingsInr ?? -1) - (a.estimatedSavingsInr ?? -1);
      return a.title.localeCompare(b.title);
    });
    return sorted;
  }, [items, priorityFilter, statusFilter, sortKey]);

  const completed = items.filter((item) => item.status === "completed").length;
  const inProgress = items.filter((item) => item.status === "in_progress").length;
  const completion = items.length > 0 ? (completed / items.length) * 100 : 0;
  const totalSavings = totalEstimatedSavings(recommendations);
  const criticalCount = items.filter((item) => item.priority === "critical").length;

  return (
    <>
      <SectionHeading
        eyebrow="Optimization Plans"
        title="Prioritised sustainability actions"
        description="Each item is derived from a rule that fired on your active dataset, carries its own evidence and verification method, and is only marked complete when you set it."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/agent")}>
              Ask the agent for a plan
            </Button>
            {items.length > 0 ? (
              <Button variant="ghost" onClick={resetPlanStatus} disabled={completed + inProgress === 0}>
                Reset all statuses
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader title="Plan progress" icon={<Target size={15} />} />
          <div className="space-y-4 p-4 md:p-5">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xs text-faint">Completed</p>
                <p className="num text-sm font-semibold text-ink">
                  {completed}
                  <span className="text-faint"> / {items.length}</span>
                </p>
              </div>
              <ProgressBar value={completion} className="mt-2" />
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Critical priority</dt>
                <dd className="num text-muted">{criticalCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">In progress</dt>
                <dd className="num text-muted">{inProgress}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Pending</dt>
                <dd className="num text-muted">{items.length - completed - inProgress}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Combined estimated saving</dt>
                <dd className="num text-muted">
                  {totalSavings > 0 ? formatInr(totalSavings) : "not quantifiable"}
                </dd>
              </div>
            </dl>
            <MethodNote label="How is the combined saving derived?">
              Values are summed across items that produced a monetary estimate. Several actions can
              address the same excess consumption, so the total is an upper bound and is not additive in
              practice. {ASSUMPTION_DISCLOSURE}
            </MethodNote>
            <p className="rounded-lg border border-line bg-hairline/[0.03] px-3 py-2 text-2xs leading-relaxed text-faint">
              Statuses are stored locally in this browser{" "}
              {planPersistence ? "(localStorage available)" : "(in-memory only — storage blocked)"}. The
              persistence layer is isolated in <span className="font-mono">services/persistence.ts</span>, so
              replacing it with Cloud Firestore requires no change to this page.
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader
            title="Filters and ordering"
            caption="Filters apply to the generated plan for the current measurement window."
            icon={<Filter size={15} />}
            actions={
              <Pill tone="neutral" icon={<ListChecks size={10} />}>
                {visible.length} shown
              </Pill>
            }
          />
          <div className="flex flex-wrap items-end gap-3 p-4 md:p-5">
            <div>
              <p className="label-micro mb-1.5">Priority</p>
              <SegmentedControl<Priority | "all">
                size="sm"
                ariaLabel="Filter by priority"
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
            </div>
            <div>
              <p className="label-micro mb-1.5">Status</p>
              <SegmentedControl<PlanStatus | "all">
                size="sm"
                ariaLabel="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "pending", label: "Pending" },
                  { value: "in_progress", label: "In progress" },
                  { value: "completed", label: "Completed" },
                ]}
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <label htmlFor="plan-sort" className="label-micro mb-1.5 block">
                Sort by
              </label>
              <Select
                id="plan-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="priority">Priority (highest first)</option>
                <option value="savings">Estimated saving (largest first)</option>
                <option value="title">Title (A–Z)</option>
              </Select>
            </div>
            <span className="flex items-center gap-1.5 pb-2 text-2xs text-faint">
              <ArrowUpDown size={12} />
              Ordering is recomputed on every change
            </span>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={22} />}
            title="No plan generated for this dataset"
            description="Recommendations are produced only when a rule fires on the active dataset. Import a CSV with at least a few days of records, or widen the date range."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => navigate("/analysis")}>
                  Import data
                </Button>
                <Button icon={<FlaskConical size={14} />} onClick={() => navigate("/agent")}>
                  Open the agent
                </Button>
              </div>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Filter size={22} />}
            title="No items match these filters"
            description="Change the priority or status filter to see the rest of the plan."
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <li key={item.id}>
                  <Card className={cn(item.status === "completed" && "border-brand/25")}>
                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 md:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityPill priority={item.priority} />
                          <PlanStatusPill status={item.status} />
                          <Pill tone="muted">{DIFFICULTY_LABEL[item.difficulty]}</Pill>
                          <Pill tone="neutral" icon={<Clock size={10} />}>
                            {item.timeframe}
                          </Pill>
                          {item.source === "agent" ? <Pill tone="brand">Agent</Pill> : null}
                        </div>
                        <h3
                          className={cn(
                            "mt-2 text-sm font-semibold text-ink md:text-base",
                            item.status === "completed" && "line-through decoration-line",
                          )}
                        >
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <div className="text-right">
                          <p className="label-micro">Estimated saving</p>
                          <p className="num text-sm font-semibold text-ink">
                            {item.estimatedSavingsInr !== null
                              ? formatInr(item.estimatedSavingsInr)
                              : "—"}
                          </p>
                          {item.estimatedSavingsInr === null ? (
                            <p className="text-2xs text-faint">not quantifiable</p>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={
                            <ChevronDown
                              size={14}
                              className={cn("transition-transform", expanded && "rotate-180")}
                            />
                          }
                          onClick={() => setExpandedId(expanded ? null : item.id)}
                        >
                          {expanded ? "Hide detail" : "View detail"}
                        </Button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="animate-fade-in border-t border-line px-4 py-4 md:px-5">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <section>
                            <p className="label-micro mb-2">Supporting evidence</p>
                            <ul className="space-y-1.5">
                              {item.evidence.map((line) => (
                                <li key={line} className="flex gap-2 text-xs leading-relaxed text-muted">
                                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </section>
                          <section className="space-y-3">
                            <div>
                              <p className="label-micro mb-1">Expected impact</p>
                              <p className="text-xs leading-relaxed text-muted">{item.expectedImpact}</p>
                            </div>
                            <div className="flex flex-wrap gap-4">
                              <div>
                                <p className="label-micro">Confidence</p>
                                <p className="text-xs font-medium text-ink">{item.confidence}</p>
                              </div>
                              <div>
                                <p className="label-micro">Difficulty</p>
                                <p className="text-xs font-medium text-ink">
                                  {DIFFICULTY_LABEL[item.difficulty]}
                                </p>
                              </div>
                              <div>
                                <p className="label-micro">Generated</p>
                                <p className="text-xs font-medium text-ink">
                                  {formatDateLong(item.generatedAt.slice(0, 10))}
                                </p>
                              </div>
                            </div>
                          </section>
                        </div>

                        <section className="mt-4 rounded-lg border border-brand/25 bg-brand/[0.06] px-3.5 py-3">
                          <p className="label-micro mb-1 flex items-center gap-1.5">
                            <ShieldCheck size={11} /> Verification method
                          </p>
                          <p className="text-xs leading-relaxed text-muted">{item.verification}</p>
                        </section>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                          <div>
                            <p className="label-micro mb-1.5">Set status</p>
                            <SegmentedControl<PlanStatus>
                              size="sm"
                              ariaLabel="Set plan status"
                              value={item.status}
                              onChange={(status) => setPlanStatus(item.id, status)}
                              options={(["pending", "in_progress", "completed"] as PlanStatus[]).map(
                                (status) => ({ value: status, label: PLAN_STATUS_LABEL[status] }),
                              )}
                            />
                          </div>
                          <p className="max-w-md text-2xs leading-relaxed text-faint">
                            A recommendation is never marked complete automatically. Completion here means
                            you tracked it yourself — confirm the improvement with the verification method
                            above before relying on it.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {items.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryTile
            icon={<AlertTriangle size={14} />}
            label="Critical items"
            value={formatNumber(criticalCount)}
          />
          <SummaryTile
            icon={<TrendingUp size={14} />}
            label="Estimated combined saving"
            value={totalSavings > 0 ? formatInr(totalSavings) : "—"}
          />
          <SummaryTile
            icon={<CheckCircle2 size={14} />}
            label="Completed"
            value={`${formatNumber(completed)} / ${formatNumber(items.length)}`}
          />
        </div>
      ) : null}
    </>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand ring-1 ring-brand/20">
        {icon}
      </span>
      <div>
        <p className="label-micro">{label}</p>
        <p className="num text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
