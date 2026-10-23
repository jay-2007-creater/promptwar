import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Bot,
  Database,
  KeyRound,
  Leaf,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { ASSUMPTION_DISCLOSURE, DEFAULT_SETTINGS } from "@/types";
import type { AppSettings } from "@/types";
import { SAMPLE_DATASET_ID, useAllDatasets, useAppStore } from "@/store/useAppStore";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { getAgentEndpoint, REQUEST_TIMEOUT_MS } from "@/services/api";
import { clearPersistedState, isPersistenceAvailable, STORAGE_KEYS } from "@/services/persistence";
import { emissionsKg, electricityCost } from "@/services/calculations";
import { Card, CardHeader, MethodNote, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { FieldRow, NumberInput, SegmentedControl, Select, Toggle } from "@/components/ui/Field";
import { formatDateShort, formatInr, formatNumber, formatRelative } from "@/lib/format";

export default function Settings() {
  const navigate = useNavigate();
  const datasets = useAllDatasets();
  const settings = useAppStore((s) => s.settings);
  const activeDatasetId = useAppStore((s) => s.activeDatasetId);
  const executions = useAppStore((s) => s.executions);
  const messages = useAppStore((s) => s.messages);
  const planStatus = useAppStore((s) => s.planStatus);

  const setSettings = useAppStore((s) => s.setSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const setActiveDataset = useAppStore((s) => s.setActiveDataset);
  const removeDataset = useAppStore((s) => s.removeDataset);
  const resetDatasets = useAppStore((s) => s.resetDatasets);
  const resetPlanStatus = useAppStore((s) => s.resetPlanStatus);
  const clearExecutions = useAppStore((s) => s.clearExecutions);
  const clearConversation = useAppStore((s) => s.clearConversation);
  const resetAllLocalData = useAppStore((s) => s.resetAllLocalData);

  const { health, checkedAt, refresh, backendConfigured } = useAgentHealth();
  const endpoint = getAgentEndpoint();
  const persistenceAvailable = isPersistenceAvailable();

  const [draftRate, setDraftRate] = useState(String(settings.electricityRateInrPerKwh));
  const [draftFactor, setDraftFactor] = useState(String(settings.emissionsFactorKgPerKwh));
  const [factorError, setFactorError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const importedCount = datasets.filter((d) => d.id !== SAMPLE_DATASET_ID).length;

  /** Live preview of the calculation engine using the drafted factors. */
  const preview = useMemo(() => {
    const rate = Number(draftRate);
    const factor = Number(draftFactor);
    const usableRate = Number.isFinite(rate) && rate > 0;
    const usableFactor = Number.isFinite(factor) && factor > 0;
    return {
      costFor100: usableRate ? electricityCost(100, rate) : null,
      emissionsFor100: usableFactor ? emissionsKg(100, factor) : null,
    };
  }, [draftRate, draftFactor]);

  const commitFactors = () => {
    const rate = Number(draftRate);
    const factor = Number(draftFactor);
    let blocked = false;

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setRateError("Enter a rate between 0.01 and 100 INR per kWh.");
      blocked = true;
    } else {
      setRateError(null);
    }

    if (!Number.isFinite(factor) || factor <= 0 || factor > 5) {
      setFactorError("Enter a factor between 0.01 and 5 kg CO₂e per kWh.");
      blocked = true;
    } else {
      setFactorError(null);
    }

    if (blocked) return;

    setSettings({
      electricityRateInrPerKwh: Math.round(rate * 100) / 100,
      emissionsFactorKgPerKwh: Math.round(factor * 1000) / 1000,
    });
    setSavedAt(new Date().toISOString());
  };

  const resetFactorsToDefault = () => {
    setDraftRate(String(DEFAULT_SETTINGS.electricityRateInrPerKwh));
    setDraftFactor(String(DEFAULT_SETTINGS.emissionsFactorKgPerKwh));
    setRateError(null);
    setFactorError(null);
  };

  const handleFullReset = () => {
    resetAllLocalData();
    clearPersistedState();
    setDraftRate(String(DEFAULT_SETTINGS.electricityRateInrPerKwh));
    setDraftFactor(String(DEFAULT_SETTINGS.emissionsFactorKgPerKwh));
    setConfirmReset(false);
  };

  const dirty =
    Number(draftRate) !== settings.electricityRateInrPerKwh ||
    Number(draftFactor) !== settings.emissionsFactorKgPerKwh;

  const agentMode = health?.connected ? "backend" : "fallback";

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Configure"
        title="Settings"
        description="Control the active dataset, the calculation factors used by every surface, the AI connection mode and your local preferences. Nothing here is a secret — credentials never live in the browser."
        actions={
          <Button
            icon={<Upload size={14} />}
            onClick={() => navigate("/analysis")}
          >
            Import data
          </Button>
        }
      />

      {/* ------------------------------------------------------------ data */}
      <Card>
        <CardHeader
          icon={<Database size={15} />}
          title="Data"
          caption="Datasets, the active selection and import behaviour."
        />
        <div className="card-pad space-y-4">
          <FieldRow
            label="Active dataset"
            hint={`${datasets.length} dataset${datasets.length === 1 ? "" : "s"} available · ${importedCount} imported by you`}
          >
            <Select
              aria-label="Active dataset"
              value={activeDatasetId}
              onChange={(event) => setActiveDataset(event.target.value)}
            >
              {datasets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.isDemo ? " (demo)" : ""}
                </option>
              ))}
            </Select>
          </FieldRow>

          <FieldRow
            label="Default analysis window"
            hint="Applied to the Overview, Plans and Simulator when a page opens. “All” uses every parsed record."
          >
            <SegmentedControl<7 | 30 | 90 | 0>
              ariaLabel="Default analysis window"
              value={settings.dateRangeDays}
              onChange={(value) => setSettings({ dateRangeDays: value })}
              options={[
                { value: 7, label: "7d" },
                { value: 30, label: "30d" },
                { value: 90, label: "90d" },
                { value: 0, label: "All" },
              ]}
            />
          </FieldRow>

          <div className="rounded-lg border border-line bg-elevated/40 p-3">
            {importedCount === 0 ? (
              <EmptyState
                icon={<Database size={16} />}
                title="No imported datasets yet"
                description="The demo dataset is always available and never persisted. Import a CSV to analyse your own consumption data."
                action={
                  <Button
                    size="sm"
                    icon={<Upload size={13} />}
                    onClick={() => navigate("/analysis")}
                  >
                    Open Data Analysis
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {datasets
                  .filter((d) => d.id !== SAMPLE_DATASET_ID)
                  .map((dataset) => (
                    <li
                      key={dataset.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{dataset.name}</p>
                        <p className="mt-0.5 text-2xs text-faint">
                          {formatNumber(dataset.acceptedCount)} accepted ·{" "}
                          {formatNumber(dataset.rejectedCount)} rejected ·{" "}
                          {dataset.records.length > 0
                            ? `${formatDateShort(dataset.records[0].date)} → ${formatDateShort(
                                dataset.records[dataset.records.length - 1].date,
                              )}`
                            : "no valid rows"}{" "}
                          · imported {formatRelative(dataset.importedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {dataset.id === activeDatasetId ? (
                          <Pill tone="brand">Active</Pill>
                        ) : (
                          <Button size="sm" onClick={() => setActiveDataset(dataset.id)}>
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 size={13} />}
                          onClick={() => removeDataset(dataset.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-2xs text-faint">
              Removing a dataset does not delete anything on a server — imported data lives only in
              this browser until a backend is wired in.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw size={13} />}
              onClick={resetDatasets}
              disabled={importedCount === 0}
            >
              Reset imported datasets
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------- calculations */}
      <Card>
        <CardHeader
          icon={<BadgeIndianRupee size={15} />}
          title="Calculations"
          caption="The tariff and grid factor behind every cost and emissions figure in the app."
        />
        <div className="card-pad space-y-1">
          <FieldRow
            label="Electricity rate"
            hint="INR per kWh. Used by estimate_electricity_cost and every cost card."
          >
            <div>
              <NumberInput
                aria-label="Electricity rate in INR per kWh"
                value={draftRate}
                step="0.1"
                min="0"
                suffix="₹/kWh"
                onChange={(event) => setDraftRate(event.target.value)}
              />
              {rateError ? (
                <p className="mt-1 text-2xs text-red-400">{rateError}</p>
              ) : null}
            </div>
          </FieldRow>

          <FieldRow
            label="Emissions factor"
            hint="kg CO₂e per kWh. Applied to metered electricity only — water emissions need a separate documented factor."
          >
            <div>
              <NumberInput
                aria-label="Emissions factor in kg CO2e per kWh"
                value={draftFactor}
                step="0.01"
                min="0"
                suffix="kg/kWh"
                onChange={(event) => setDraftFactor(event.target.value)}
              />
              {factorError ? (
                <p className="mt-1 text-2xs text-red-400">{factorError}</p>
              ) : null}
            </div>
          </FieldRow>

          <div className="mt-3 rounded-lg border border-line bg-elevated/40 p-3">
            <p className="label-micro mb-2">Live preview · 100 kWh reference</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewStat
                icon={<BadgeIndianRupee size={13} />}
                label="Estimated cost"
                value={preview.costFor100 === null ? "Unavailable" : formatInr(preview.costFor100, 2)}
              />
              <PreviewStat
                icon={<Leaf size={13} />}
                label="Estimated emissions"
                value={
                  preview.emissionsFor100 === null
                    ? "Unavailable"
                    : `${formatNumber(preview.emissionsFor100, 2)} kg CO₂e`
                }
              />
            </div>
            <div className="mt-3">
              <MethodNote label="Assumption disclosure">
                {ASSUMPTION_DISCLOSURE} Cost is computed as kWh × rate; emissions as kWh × factor.
                Water consumption is reported in litres and is never converted to emissions without
                an explicitly configured water factor.
              </MethodNote>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-2xs text-faint">
              {savedAt
                ? `Factors saved ${formatRelative(savedAt)} · stored locally`
                : dirty
                  ? "Unsaved changes — every page still uses the previously saved factors."
                  : "Factors match the values in use."}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={resetFactorsToDefault}>
                Use illustrative defaults
              </Button>
              <Button
                size="sm"
                icon={<Save size={13} />}
                onClick={commitFactors}
                disabled={!dirty}
              >
                Save factors
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------------- ai */}
      <Card>
        <CardHeader
          icon={<Bot size={15} />}
          title="AI"
          caption="Gemini connection status and the current integration mode."
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={13} className={!checkedAt ? "animate-spin" : undefined} />}
              onClick={() => void refresh()}
            >
              Re-check
            </Button>
          }
        />
        <div className="card-pad space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={health?.connected ? "mint" : "amber"}>
              {health?.connected ? "Connected" : "Fallback mode"}
            </Pill>
            <Pill tone="neutral" mono>
              mode: {agentMode}
            </Pill>
            <Pill tone="neutral" mono>
              endpoint: {endpoint ? endpoint : "not configured"}
            </Pill>
          </div>

          <p className="text-sm leading-relaxed text-muted">
            {health?.detail ??
              "No health probe has completed yet. The app runs deterministic local tools until a backend responds."}
          </p>

          <div className="rounded-lg border border-line bg-elevated/40 p-3 text-xs leading-relaxed text-muted">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium text-ink">
              <KeyRound size={13} className="text-brand" />
              Where the Gemini key lives
            </p>
            The Gemini API key is read only by the deployed backend from its own environment
            variables. The browser holds one non-secret value — the endpoint URL
            (<span className="font-mono text-2xs">VITE_AGENT_API_URL</span>). There is no field in
            this app that asks you to paste an API key, and none is ever written to browser storage
            or the bundle.
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <PreviewStat
              icon={<Sparkles size={13} />}
              label="Integration mode"
              value={backendConfigured ? "Backend endpoint configured" : "No backend configured"}
            />
            <PreviewStat
              icon={<RefreshCw size={13} />}
              label="Last health probe"
              value={checkedAt ? formatRelative(checkedAt) : "Not probed"}
            />
            <PreviewStat
              icon={<AlertTriangle size={13} />}
              label="Request timeout"
              value={`${Math.round(REQUEST_TIMEOUT_MS / 1000)} s`}
            />
          </div>

          {!backendConfigured ? (
            <p className="text-2xs leading-relaxed text-faint">
              To connect Gemini, deploy the secure backend (Google Cloud Run) with the key set in its
              environment, then build this app with{" "}
              <span className="font-mono">VITE_AGENT_API_URL</span> pointing at{" "}
              <span className="font-mono">https://your-backend/</span>. Until then, every agent turn
              is served by the deterministic local engine and labelled as a demonstration.
            </p>
          ) : null}
        </div>
      </Card>

      {/* ----------------------------------------------------- preferences */}
      <Card>
        <CardHeader
          icon={<SlidersHorizontal size={15} />}
          title="Preferences"
          caption="Interface options that persist locally on this device."
        />
        <div className="card-pad space-y-1">
          <FieldRow label="Theme" hint="Applies immediately and is remembered across sessions.">
            <SegmentedControl<AppSettings["theme"]>
              ariaLabel="Theme"
              value={settings.theme}
              onChange={(value) => setSettings({ theme: value })}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </FieldRow>

          <FieldRow
            label="Compact density"
            hint="Tightens table and list spacing. Charts and cards are unchanged."
          >
            <div className="flex sm:justify-end">
              <Toggle
                label="Compact density"
                checked={settings.compactDensity}
                onChange={(value) => setSettings({ compactDensity: value })}
              />
            </div>
          </FieldRow>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-2xs text-faint">
              Resets the theme, density, range and calculation factors to the illustrative defaults.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw size={13} />}
              onClick={resetSettings}
            >
              Reset preferences
            </Button>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------- security */}
      <Card>
        <CardHeader
          icon={<ShieldCheck size={15} />}
          title="Security & data handling"
          caption="What is stored, where it goes, and how to clear it."
        />
        <div className="card-pad space-y-3 text-xs leading-relaxed text-muted">
          <ul className="space-y-2">
            <Bullet title="Credentials">
              No API key, token or password is stored in this browser. Never paste a secret into any
              field of this app.
            </Bullet>
            <Bullet title="What is persisted">
              Settings, imported datasets, plan statuses, the execution log and conversation state —
              stored under{" "}
              <span className="font-mono text-2xs">{STORAGE_KEYS.app}</span> in this browser only.
            </Bullet>
            <Bullet title="Session status">
              {persistenceAvailable
                ? "Browser storage is available, so saved data survives a reload."
                : "Browser storage is blocked, so this session runs from memory and nothing is saved."}
            </Bullet>
            <Bullet title="Demonstration data">
              The demo dataset is synthetic and contains no real personal information. Imported CSVs
              stay on your device unless you connect a backend.
            </Bullet>
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-faint">
            <span>{formatNumber(executions.length)} execution log entries</span>
            <span>{formatNumber(messages.length)} conversation messages</span>
            <span>{formatNumber(Object.keys(planStatus).length)} plan statuses</span>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------ danger zone */}
      <Card className="border-red-500/25">
        <CardHeader
          icon={<AlertTriangle size={15} />}
          title="Reset & clear"
          caption="Destructive actions. Everything below is local to this browser and cannot be undone."
        />
        <div className="card-pad space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <DangerAction
              title="Clear execution log"
              description="Removes measured performance history used by the Performance page."
              actionLabel="Clear log"
              disabled={executions.length === 0}
              onClick={clearExecutions}
            />
            <DangerAction
              title="Clear conversation"
              description="Deletes the stored AI Agent transcript. Generated plans are kept."
              actionLabel="Clear chat"
              disabled={messages.length === 0}
              onClick={clearConversation}
            />
            <DangerAction
              title="Reset plan statuses"
              description="Returns every optimisation recommendation to “Pending”."
              actionLabel="Reset statuses"
              disabled={Object.keys(planStatus).length === 0}
              onClick={resetPlanStatus}
            />
          </div>

          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3">
            <p className="text-sm font-medium text-ink">Reset all local data</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Clears settings, imported datasets, plan statuses, the execution log and the
              conversation, then removes the persisted record from this browser. The demo dataset
              remains available.
            </p>
            {confirmReset ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={13} />}
                  onClick={handleFullReset}
                >
                  Yes, reset everything
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="danger"
                className="mt-3"
                icon={<Trash2 size={13} />}
                onClick={() => setConfirmReset(true)}
              >
                Reset all local data
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function PreviewStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 px-3 py-2">
      <p className="flex items-center gap-1.5 text-2xs uppercase tracking-[0.09em] text-faint">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <p className="num mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function Bullet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
      <span>
        <span className="font-medium text-ink">{title}. </span>
        {children}
      </span>
    </li>
  );
}

function DangerAction({
  title,
  description,
  actionLabel,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-line bg-elevated/40 p-3">
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-2xs leading-relaxed text-faint">{description}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
