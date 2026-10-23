import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Droplets,
  FlaskConical,
  Gauge,
  MapPin,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import type { Insight } from "@/components/dashboard/InsightsList";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { WorkspaceHeader } from "@/components/dashboard/WorkspaceHeader";
import {
  AnomalyChart,
  CostChart,
  ElectricityChart,
  WaterChart,
} from "@/components/dashboard/ConsumptionCharts";
import { BaselineVsSimulatedChart } from "@/components/dashboard/ScenarioCharts";
import { markAnomalies, toTrendPoints } from "@/components/dashboard/chartData";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { useActiveRecords, useDerivedAnalysis, useRecommendations } from "@/hooks/useAnalysis";
import { useAllDatasets, useAppStore } from "@/store/useAppStore";
import { buildDerivedAnalysis } from "@/services/analytics";
import { simulateReduction } from "@/services/calculations";
import { formatDateShort, formatNumber } from "@/lib/format";

export default function Overview() {
  const navigate = useNavigate();
  const datasets = useAllDatasets();
  const { dataset, records, rangeDays } = useActiveRecords();
  const { derived } = useDerivedAnalysis();
  const recommendations = useRecommendations();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setActiveDataset = useAppStore((s) => s.setActiveDataset);
  const logExecution = useAppStore((s) => s.logExecution);
  const lastSimulation = useAppStore((s) => s.lastSimulation);

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshMs, setLastRefreshMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { summary } = derived;

  const trendPoints = useMemo(
    () =>
      markAnomalies(
        toTrendPoints(records, settings.electricityRateInrPerKwh),
        summary.anomalies,
      ),
    [records, settings.electricityRateInrPerKwh, summary.anomalies],
  );

  const potentialSavings = useMemo(
    () =>
      recommendations.reduce((total, rec) => total + (rec.estimatedSavingsInr ?? 0), 0),
    [recommendations],
  );

  const scenario = useMemo(() => {
    if (!lastSimulation || !dataset) return null;
    if (lastSimulation.datasetId !== dataset.id) return null;
    return simulateReduction(
      summary.totalElectricityKwh,
      lastSimulation.reductionPercent,
      settings.electricityRateInrPerKwh,
      settings.emissionsFactorKgPerKwh,
    );
  }, [lastSimulation, dataset, summary.totalElectricityKwh, settings]);

  const insights = useMemo<Insight[]>(() => {
    if (records.length === 0) return [];
    const items: Insight[] = [];
    const eClass = dataset?.isDemo ? "demo" : "measured";
    const peakRecord = records.reduce((best, r) =>
      r.electricityKwh > best.electricityKwh ? r : best,
    );

    items.push({
      id: "peak",
      title: "Highest-consumption period",
      icon: <TrendingUp size={15} />,
      evidenceClass: eClass,
      detail: (
        <>
          The single heaviest electricity day in this window is{" "}
          <strong className="num text-ink">{formatDateShort(peakRecord.date)}</strong> at{" "}
          <strong className="num text-ink">{formatNumber(peakRecord.electricityKwh, 1)} kWh</strong> —
          {formatNumber(
            ((peakRecord.electricityKwh - summary.avgDailyElectricityKwh) /
              Math.max(summary.avgDailyElectricityKwh, 0.01)) *
              100,
            1,
          )}
          % above the period average of {formatNumber(summary.avgDailyElectricityKwh, 1)} kWh/day.
          A peak day is a scheduling or equipment signal, not automatically waste.
        </>
      ),
    });

    items.push({
      id: "average",
      title: "Average daily electricity use",
      icon: <Zap size={15} />,
      evidenceClass: "calculated",
      detail: (
        <>
          <strong className="num text-ink">{formatNumber(summary.avgDailyElectricityKwh, 1)} kWh/day</strong>{" "}
          across {summary.recordCount} records spanning {summary.periodDays} days. Range:{" "}
          {formatNumber(summary.minElectricityKwh, 1)}–{formatNumber(summary.maxElectricityKwh, 1)} kWh.
          Trend across the window is <strong className="text-ink">{summary.electricityTrend}</strong> (
          {summary.electricityChangePercent > 0 ? "+" : ""}
          {summary.electricityChangePercent}%).
        </>
      ),
    });

    if (summary.anomaliesExamined) {
      const topAnomaly = summary.anomalies[0];
      items.push({
        id: "anomalies",
        title:
          summary.anomalies.length > 0
            ? `${summary.anomalies.length} unusual consumption event${summary.anomalies.length === 1 ? "" : "s"}`
            : "No unusual consumption events",
        icon: <AlertTriangle size={15} />,
        evidenceClass: "calculated",
        detail:
          summary.anomalies.length > 0 && topAnomaly ? (
            <>
              Flagged by a robust z-score on median absolute deviation (k = 3.5). Earliest flagged item:{" "}
              <strong className="num text-ink">{formatDateShort(topAnomaly.date)}</strong> —{" "}
              {topAnomaly.metric === "electricityKwh" ? "electricity" : "water"}{" "}
              {formatNumber(topAnomaly.value, 1)} (z = {topAnomaly.score}). Anomalies indicate where to
              look; they do not prove cause.
            </>
          ) : (
            <>
              Every day fell inside this dataset's own normal band. That is a stability signal, not proof
              of efficiency — a longer baseline would raise confidence.
            </>
          ),
      });
    } else {
      items.push({
        id: "anomalies-na",
        title: "Anomaly detection not yet applicable",
        icon: <AlertTriangle size={15} />,
        evidenceClass: "calculated",
        detail: (
          <>
            The scan needs at least 8 valid records to establish a normal band; this window contains{" "}
            {summary.recordCount}. Widen the date range or import more data.
          </>
        ),
      });
    }

    items.push({
      id: "investigate",
      title: "Potential areas for further investigation",
      icon: <MapPin size={15} />,
      evidenceClass: "interpretation",
      detail:
        recommendations.length > 0 ? (
          <>
            The highest-ranked open item is{" "}
            <strong className="text-ink">{recommendations[0].title}</strong> ({recommendations[0].priority}{" "}
            priority). {recommendations[0].evidence[0]}.
          </>
        ) : (
          <>No rule-based signal crossed its threshold in this window.</>
        ),
    });

    return items;
  }, [records, summary, recommendations, dataset]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotice(null);
    const started = performance.now();
    // Yield a frame so the busy state is visible, then recompute for real.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const recomputed = buildDerivedAnalysis(records, settings);
    const duration = performance.now() - started;
    logExecution({
      kind: "analysis",
      label: `Analysis recomputed · ${recomputed.summary.recordCount} records`,
      status: "succeeded",
      durationMs: duration,
      detail: `Window: ${rangeDays === 0 ? "all records" : `last ${rangeDays} days`}`,
    });
    setLastRefreshMs(Math.round(duration));
    setRefreshing(false);
    setNotice(
      `Analysis recomputed from ${recomputed.summary.recordCount} records in ${Math.round(duration)} ms.`,
    );
    window.setTimeout(() => setNotice(null), 6000);
  }, [records, settings, logExecution, rangeDays]);

  const costMeasured = derived.costSource === "measured";
  const savingsMethod =
    "Sum of the estimated savings from each generated recommendation, rounded. These estimates draw on the configured rate and can overlap between actions, so treat the total as an upper bound rather than an additive commitment.";

  return (
    <>
      <WorkspaceHeader
        title="Your Sustainability Overview"
        subtitle="Understand resource consumption. Discover opportunities. Take informed action."
        dataset={dataset}
        datasets={datasets}
        onSelectDataset={setActiveDataset}
        rangeDays={settings.dateRangeDays}
        onSelectRange={(days) => setSettings({ dateRangeDays: days })}
        onRefresh={() => void handleRefresh()}
        refreshing={refreshing}
        lastRefreshMs={lastRefreshMs}
        onOpenImport={() => navigate("/analysis")}
        rangeLabel={
          records.length > 0
            ? `${records.length} records in view · ${
                rangeDays === 0 ? "all available history" : `last ${rangeDays} days`
              }`
            : "No records available"
        }
      />

      {notice ? (
        <div className="mb-4 animate-fade-in rounded-lg border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-xs text-brand-300">
          {notice}
        </div>
      ) : null}

      {dataset && (dataset.warnings.length > 0 || dataset.rejectedCount > 0) ? (
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="amber" icon={<AlertTriangle size={10} />}>
              Data quality
            </Pill>
            <span className="text-xs text-amber-200/90">
              {dataset.rejectedCount > 0
                ? `${dataset.rejectedCount} record${dataset.rejectedCount === 1 ? "" : "s"} rejected at import. `
                : ""}
              {dataset.warnings[0]?.message}
            </span>
            <Button size="sm" variant="ghost" onClick={() => navigate("/analysis")}>
              Review import report
            </Button>
          </div>
        </div>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          icon={<Gauge size={22} />}
          title="No records in the selected window"
          description="The active dataset has no rows inside this date range. Widen the range, or import a CSV with the header date,electricity_kwh,water_liters[,cost_inr]."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setSettings({ dateRangeDays: 0 })}>
                Show all history
              </Button>
              <Button icon={<FlaskConical size={14} />} onClick={() => navigate("/analysis")}>
                Open Data Analysis
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label="Total electricity"
              value={summary.totalElectricityKwh}
              unit="kWh"
              icon={<Zap size={15} />}
              evidenceClass={dataset?.isDemo ? "demo" : "measured"}
              method={`Sum of electricity_kwh across ${summary.recordCount} accepted records (${formatDateShort(
                summary.from,
              )} → ${formatDateShort(summary.to)}).`}
            />
            <MetricCard
              label="Total water"
              value={summary.totalWaterLiters}
              unit="litres"
              icon={<Droplets size={15} />}
              evidenceClass={dataset?.isDemo ? "demo" : "measured"}
              method={`Sum of water_liters across ${summary.recordCount} accepted records. No water-related emissions are derived without a documented factor.`}
            />
            <MetricCard
              label="Estimated electricity cost"
              value={derived.costInr}
              unit="INR"
              icon={<BadgeIndianRupee size={15} />}
              evidenceClass={costMeasured ? "calculated" : "assumption"}
              method={derived.costMethod}
            />
            <MetricCard
              label="Estimated carbon emissions"
              value={derived.emissionsAvailable ? derived.emissionsKg : null}
              unit="kg CO2e"
              icon={<Waves size={15} />}
              evidenceClass="assumption"
              unavailable={!derived.emissionsAvailable}
              unavailableReason="No emissions factor is configured. Set one in Settings → Calculations to enable this estimate. Water emissions are never estimated without a documented factor."
              method={derived.emissionsMethod}
            />
            <MetricCard
              label="Potential cost savings"
              value={recommendations.length > 0 ? potentialSavings : null}
              unit="INR"
              icon={<TrendingUp size={15} />}
              evidenceClass="assumption"
              unavailable={recommendations.length === 0}
              unavailableReason="No recommendation produced an estimated saving for the active dataset."
              method={savingsMethod}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <ElectricityChart data={trendPoints} height={248} className="xl:col-span-8" />
            <WaterChart data={trendPoints} height={248} className="xl:col-span-4" />
            <CostChart data={trendPoints} height={238} measured={costMeasured} className="xl:col-span-6" />
            <div className="xl:col-span-6">
              {scenario && lastSimulation ? (
                <BaselineVsSimulatedChart
                  baselineKwh={scenario.baselineElectricityKwh}
                  simulatedKwh={scenario.simulatedElectricityKwh}
                  reductionPercent={scenario.reductionPercent}
                  height={238}
                  caption={`Scenario recorded ${formatDateShort(
                    lastSimulation.at.slice(0, 10),
                  )} on "${lastSimulation.datasetName}". Hypothetical only — it does not change real consumption.`}
                />
              ) : (
                <div className="card flex h-full flex-col p-4 md:p-5">
                  <h3 className="text-sm font-semibold text-ink">Baseline versus simulated consumption</h3>
                  <p className="mt-0.5 text-xs text-faint">
                    No scenario has been recorded for this dataset yet
                  </p>
                  <div className="mt-4 flex-1">
                    <EmptyState
                      icon={<Gauge size={20} />}
                      title="No simulation recorded"
                      description="Run a what-if scenario in the Impact Simulator. This chart shows only scenarios you actually ran — it never displays a fabricated comparison."
                      action={
                        <Button variant="primary" size="sm" onClick={() => navigate("/simulator")}>
                          Open Impact Simulator
                        </Button>
                      }
                      className="h-full"
                    />
                  </div>
                </div>
              )}
            </div>
            <AnomalyChart
              data={trendPoints}
              height={230}
              examined={summary.anomaliesExamined}
              className="xl:col-span-12"
            />
          </div>

          <InsightsList
            insights={insights}
            emptyTitle="No insights for this window"
            emptyDescription="Import data or widen the date range to generate evidence-backed observations."
          />

          <p className="text-2xs leading-relaxed text-faint">
            All figures on this page derive from the same {summary.recordCount} accepted records and the
            same configured factors, so charts and cards always agree. Estimated values are labelled with
            their evidence class and never presented as billed or metered outcomes.
          </p>
        </div>
      )}
    </>
  );
}
