import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Beaker,
  Droplets,
  Info,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Waves,
  Zap,
} from "lucide-react";
import { ASSUMPTION_DISCLOSURE } from "@/types";
import { simulateReduction } from "@/services/calculations";
import { useActiveRecords, useDerivedAnalysis } from "@/hooks/useAnalysis";
import { BaselineVsSimulatedChart } from "@/components/dashboard/ScenarioCharts";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, MethodNote, SectionHeading } from "@/components/ui/Card";
import { EvidenceChip, Pill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { TextInput } from "@/components/ui/Field";
import { formatDateShort, formatInr, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_PERCENTAGES = [5, 10, 15, 20, 30, 50];

export default function Simulator() {
  const navigate = useNavigate();
  const { dataset, records, rangeDays } = useActiveRecords();
  const { derived } = useDerivedAnalysis();
  const settings = useAppStore((s) => s.settings);
  const setLastSimulation = useAppStore((s) => s.setLastSimulation);
  const lastSimulation = useAppStore((s) => s.lastSimulation);
  const logExecution = useAppStore((s) => s.logExecution);

  const [percent, setPercent] = useState(15);
  const [rawInput, setRawInput] = useState("15");
  const [inputError, setInputError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const baselineKwh = derived.summary.totalElectricityKwh;
  const emissionsAvailable = settings.emissionsFactorKgPerKwh > 0;
  const rateAvailable = settings.electricityRateInrPerKwh > 0;

  const scenario = useMemo(
    () =>
      simulateReduction(
        baselineKwh,
        percent,
        settings.electricityRateInrPerKwh,
        settings.emissionsFactorKgPerKwh,
      ),
    [baselineKwh, percent, settings.electricityRateInrPerKwh, settings.emissionsFactorKgPerKwh],
  );

  const applyPercent = (next: number, from: "slider" | "input") => {
    if (!Number.isFinite(next)) {
      setInputError("Enter a number between 0 and 100.");
      return;
    }
    if (next < 0 || next > 100) {
      setInputError("Reduction must be between 0% and 100%.");
      return;
    }
    setInputError(null);
    setPercent(next);
    if (from === "slider") setRawInput(String(next));
    else setRawInput(String(next));
  };

  const handleInputChange = (value: string) => {
    setRawInput(value);
    if (value.trim() === "") {
      setInputError("Enter a percentage between 0 and 100.");
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setInputError("That is not a valid number.");
      return;
    }
    if (parsed < 0 || parsed > 100) {
      setInputError("Reduction must be between 0% and 100%.");
      return;
    }
    setInputError(null);
    setPercent(parsed);
  };

  const recordScenario = () => {
    if (!dataset || records.length === 0) return;
    const started = performance.now();
    const result = simulateReduction(
      baselineKwh,
      percent,
      settings.electricityRateInrPerKwh,
      settings.emissionsFactorKgPerKwh,
    );
    setLastSimulation({
      reductionPercent: percent,
      datasetId: dataset.id,
      datasetName: dataset.name,
      at: new Date().toISOString(),
    });
    logExecution({
      kind: "simulation",
      label: `Scenario recorded · −${percent}% electricity`,
      status: "succeeded",
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      detail: `${formatNumber(result.electricitySavedKwh, 1)} kWh saved · ${result.costSavingsInr !== null ? formatInr(result.costSavingsInr) : "cost not estimated"} · dataset "${dataset.name}"`,
    });
    setSavedNotice(
      `Scenario recorded: a hypothetical ${percent}% reduction on "${dataset.name}". The Overview page now compares baseline against this run.`,
    );
    window.setTimeout(() => setSavedNotice(null), 7000);
  };

  return (
    <>
      <SectionHeading
        eyebrow="Impact Simulator"
        title="What if consumption dropped?"
        description="Model a hypothetical electricity reduction and see how consumption, expenditure and emissions respond. Nothing here changes real consumption or stored measurements — the scenario is a calculation, not a forecast."
        actions={<Pill tone="amber" icon={<Beaker size={10} />}>Hypothetical scenario</Pill>}
      />

      {records.length === 0 || baselineKwh <= 0 ? (
        <EmptyState
          icon={<SlidersHorizontal size={22} />}
          title="No baseline to simulate against"
          description="The simulator needs a measured baseline of electricity consumption. Import a dataset or widen the date range so the active window contains records."
          action={
            <Button variant="primary" onClick={() => navigate("/analysis")}>
              Import consumption data
            </Button>
          }
        />
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader
              title="Reduction parameter"
              caption={`Applied uniformly to every day of the active window · baseline ${formatNumber(
                baselineKwh,
                1,
              )} kWh across ${derived.summary.recordCount} records`}
              icon={<SlidersHorizontal size={15} />}
              actions={
                <Pill tone={rangeDays === 0 ? "neutral" : "brand"}>
                  {rangeDays === 0 ? "All history" : `Last ${rangeDays} days`}
                </Pill>
              }
            />
            <div className="p-4 md:p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="reduction-slider" className="label-micro">
                      Hypothetical reduction
                    </label>
                    <span className="num text-2xl font-semibold text-ink">
                      −{percent}
                      <span className="text-sm text-faint">%</span>
                    </span>
                  </div>
                  <input
                    id="reduction-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={percent}
                    onChange={(event) => applyPercent(Number(event.target.value), "slider")}
                    className="range mt-3 w-full"
                    aria-describedby="reduction-help"
                  />
                  <div className="mt-2 flex justify-between text-2xs text-faint">
                    <span>0% (no change)</span>
                    <span>50%</span>
                    <span>100% (full elimination)</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {QUICK_PERCENTAGES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyPercent(value, "slider")}
                        aria-pressed={percent === value}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-2xs transition-colors",
                          percent === value
                            ? "border-brand/45 bg-brand/15 text-brand-300"
                            : "border-line bg-elevated text-muted hover:border-brand/40 hover:text-ink",
                        )}
                      >
                        −{value}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full lg:w-[220px]">
                  <label htmlFor="reduction-input" className="label-micro mb-1.5 block">
                    Exact value
                  </label>
                  <TextInput
                    id="reduction-input"
                    inputMode="numeric"
                    value={rawInput}
                    onChange={(event) => handleInputChange(event.target.value)}
                    aria-invalid={inputError !== null}
                    className={inputError ? "border-red-500/50" : undefined}
                  />
                  <p
                    id="reduction-help"
                    className={cn(
                      "mt-1.5 text-2xs leading-relaxed",
                      inputError ? "text-red-300" : "text-faint",
                    )}
                  >
                    {inputError ??
                      "Accepts 0–100. Values outside that range are rejected rather than silently clamped."}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {savedNotice ? (
            <div className="mb-4 animate-fade-in rounded-lg border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-xs text-brand-300">
              {savedNotice}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-4">
              <CardHeader
                title="Baseline"
                caption="Measured from the active dataset"
                icon={<Zap size={15} />}
                actions={<EvidenceChip evidenceClass={dataset?.isDemo ? "demo" : "measured"} />}
              />
              <dl className="row-divide text-sm">
                <ScenarioRow
                  label="Electricity"
                  value={formatNumber(scenario.baselineElectricityKwh, 1)}
                  unit="kWh"
                />
                <ScenarioRow
                  label="Estimated expenditure"
                  value={
                    scenario.baselineCostInr !== null ? formatInr(scenario.baselineCostInr) : "Unavailable"
                  }
                  unit={scenario.baselineCostInr !== null ? "" : ""}
                  unavailable={scenario.baselineCostInr === null}
                />
                <ScenarioRow
                  label="Estimated emissions"
                  value={
                    scenario.baselineEmissionsKg !== null
                      ? formatNumber(scenario.baselineEmissionsKg, 1)
                      : "Unavailable"
                  }
                  unit="kg CO2e"
                  unavailable={scenario.baselineEmissionsKg === null}
                />
              </dl>
            </Card>

            <Card className="border-amber-500/25 xl:col-span-4">
              <CardHeader
                title={`Simulated scenario · −${percent}%`}
                caption="Hypothetical — not a measurement"
                icon={<Beaker size={15} />}
                actions={<Pill tone="amber">Hypothetical</Pill>}
              />
              <dl className="row-divide text-sm">
                <ScenarioRow
                  label="Electricity"
                  value={formatNumber(scenario.simulatedElectricityKwh, 1)}
                  unit="kWh"
                />
                <ScenarioRow
                  label="Estimated expenditure"
                  value={
                    scenario.simulatedCostInr !== null ? formatInr(scenario.simulatedCostInr) : "Unavailable"
                  }
                  unavailable={scenario.simulatedCostInr === null}
                />
                <ScenarioRow
                  label="Estimated emissions"
                  value={
                    scenario.simulatedEmissionsKg !== null
                      ? formatNumber(scenario.simulatedEmissionsKg, 1)
                      : "Unavailable"
                  }
                  unit="kg CO2e"
                  unavailable={scenario.simulatedEmissionsKg === null}
                />
              </dl>
            </Card>

            <Card className="xl:col-span-4">
              <CardHeader
                title="Impact"
                caption="Difference between the two scenarios"
                icon={<ArrowRight size={15} />}
              />
              <dl className="row-divide text-sm">
                <ScenarioRow
                  label="Electricity saved"
                  value={formatNumber(scenario.electricitySavedKwh, 1)}
                  unit="kWh"
                  tone="positive"
                />
                <ScenarioRow
                  label="Cost savings"
                  value={scenario.costSavingsInr !== null ? formatInr(scenario.costSavingsInr) : "Unavailable"}
                  unavailable={scenario.costSavingsInr === null}
                  tone="positive"
                />
                <ScenarioRow
                  label="Emissions reduction"
                  value={
                    scenario.emissionsReductionKg !== null
                      ? formatNumber(scenario.emissionsReductionKg, 1)
                      : "Unavailable"
                  }
                  unit="kg CO2e"
                  unavailable={scenario.emissionsReductionKg === null}
                  tone="positive"
                />
              </dl>
            </Card>
          </div>

          {(!rateAvailable || !emissionsAvailable) && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="text-xs leading-relaxed text-amber-100/90">
                {!rateAvailable
                  ? "No electricity rate is configured, so avoided expenditure cannot be calculated. Set a rate in Settings → Calculations."
                  : null}
                {!rateAvailable && !emissionsAvailable ? " " : null}
                {!emissionsAvailable
                  ? "No emissions factor is configured, so avoided emissions cannot be calculated. Set a factor in Settings → Calculations."
                  : null}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            <BaselineVsSimulatedChart
              baselineKwh={scenario.baselineElectricityKwh}
              simulatedKwh={scenario.simulatedElectricityKwh}
              reductionPercent={percent}
              height={268}
              className="xl:col-span-7"
              caption={`Measured baseline across ${derived.summary.recordCount} records (${formatDateShort(
                derived.summary.from,
              )} → ${formatDateShort(derived.summary.to)}) compared with a uniform ${percent}% reduction.`}
            />

            <Card className="xl:col-span-5">
              <CardHeader
                title="Assumptions and method"
                caption="Exactly how this scenario is calculated"
                icon={<Info size={15} />}
                actions={
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Save size={13} />}
                    onClick={recordScenario}
                    disabled={!dataset}
                  >
                    Record scenario
                  </Button>
                }
              />
              <div className="space-y-3 p-4 md:p-5">
                <ul className="space-y-2 text-xs leading-relaxed text-muted">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                    Simulated consumption = baseline × (1 − {percent}/100) ={" "}
                    <span className="num">
                      {formatNumber(scenario.baselineElectricityKwh, 1)} × {((100 - percent) / 100).toFixed(2)} ={" "}
                      {formatNumber(scenario.simulatedElectricityKwh, 1)} kWh
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                    Expenditure is priced on both sides at the configured rate of{" "}
                    <span className="num">{formatInr(settings.electricityRateInrPerKwh, 2)}/kWh</span> so the
                    comparison is like-for-like.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                    Emissions use a single factor of{" "}
                    <span className="num">{settings.emissionsFactorKgPerKwh} kg CO2e/kWh</span>.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                    The reduction is applied uniformly to every day. Real reductions are rarely uniform and
                    usually take effect gradually.
                  </li>
                </ul>

                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2.5 text-2xs leading-relaxed text-amber-100/85">
                  {ASSUMPTION_DISCLOSURE} Recording a scenario stores only the percentage and timestamp — it
                  does not modify your dataset or assume the saving was achieved.
                </div>

                <MethodNote label="Why can the expenditure be unavailable?">
                  Avoided expenditure needs a configured rate, and avoided emissions need a configured
                  factor. When either is missing the respective figure is reported as unavailable rather
                  than shown as zero.
                </MethodNote>

                {derived.costSource !== "estimated" ? (
                  <MethodNote label="You have measured cost values in this dataset">
                    The active dataset contains measured <span className="font-mono">cost_inr</span> values.
                    This simulator still prices both scenarios at the configured rate so the comparison
                    isolates the effect of the reduction. The Overview page uses your measured values for
                    actual expenditure.
                  </MethodNote>
                ) : null}

                {lastSimulation ? (
                  <p className="border-t border-line pt-3 text-2xs leading-relaxed text-faint">
                    Last recorded scenario: −{lastSimulation.reductionPercent}% on “{lastSimulation.datasetName}
                    ”, {formatDateShort(lastSimulation.at.slice(0, 10))}.{" "}
                    {lastSimulation.datasetId === dataset?.id
                      ? "It is shown on the Overview page."
                      : "It belongs to a different dataset, so Overview will not compare it."}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw size={13} />}
                    onClick={() => applyPercent(15, "slider")}
                  >
                    Reset to 15%
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Droplets size={13} />} onClick={() => navigate("/plans")}>
                    Open action plan
                  </Button>
                  <Button size="sm" variant="ghost" icon={<BadgeIndianRupee size={13} />} onClick={() => navigate("/settings")}>
                    Adjust rate and factor
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Waves size={13} />} onClick={() => navigate("/overview")}>
                    Back to Overview
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function ScenarioRow({
  label,
  value,
  unit = "",
  tone = "neutral",
  unavailable,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "neutral" | "positive";
  unavailable?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 md:px-5">
      <dt className="text-xs text-faint">{label}</dt>
      <dd
        className={cn(
          "num text-sm font-semibold",
          unavailable ? "text-faint" : tone === "positive" ? "text-brand-300" : "text-ink",
        )}
      >
        {value}
        {unit && !unavailable ? <span className="ml-1 text-xs font-medium text-faint">{unit}</span> : null}
      </dd>
    </div>
  );
}
