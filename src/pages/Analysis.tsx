import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BadgeIndianRupee,
  CheckCircle2,
  Database,
  Droplets,
  FileSpreadsheet,
  FlaskConical,
  Info,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Waves,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { Dataset } from "@/types";
import { ASSUMPTION_DISCLOSURE } from "@/types";
import {
  ACCEPTED_HEADERS,
  MAX_DATA_ROWS,
  MAX_FILE_BYTES,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  parseCsv,
  type ParseResult,
} from "@/services/csvParser";
import { ANOMALY_METHOD_NOTE, MIN_OBSERVATIONS_FOR_ANOMALY, analyze, buildDerivedAnalysis } from "@/services/analytics";
import { useActiveDataset, useAllDatasets, useAppStore } from "@/store/useAppStore";
import { SAMPLE_DATASET_ID } from "@/data/sampleData";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader, KbdRow, MethodNote, SectionHeading } from "@/components/ui/Card";
import { DemoBadge, EvidenceChip, Pill } from "@/components/ui/Badge";
import { EmptyState, ProgressBar } from "@/components/ui/Feedback";
import { Select } from "@/components/ui/Field";
import { formatDateLong, formatDuration, formatInr, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const BLOCKED_EXTENSIONS = ["xlsx", "xls", "pdf", "zip", "json", "parquet"];

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function readFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  register: (reader: FileReader) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    register(reader);
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    reader.onload = () => {
      onProgress(100);
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () =>
      reject(new Error("The file could not be read. It may be corrupted, locked, or not a text file."));
    reader.onabort = () => reject(new Error("__aborted__"));
    reader.readAsText(file);
  });
}

export default function Analysis() {
  const navigate = useNavigate();
  const interactionsDisabled = false;
  const datasets = useAllDatasets();
  const activeDataset = useActiveDataset();
  const settings = useAppStore((s) => s.settings);
  const addDataset = useAppStore((s) => s.addDataset);
  const setActiveDataset = useAppStore((s) => s.setActiveDataset);
  const removeDataset = useAppStore((s) => s.removeDataset);
  const resetDatasets = useAppStore((s) => s.resetDatasets);
  const logExecution = useAppStore((s) => s.logExecution);

  const [dragActive, setDragActive] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [showAllRejected, setShowAllRejected] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<FileReader | null>(null);

  const resetImport = useCallback(() => {
    readerRef.current = null;
    setReading(false);
    setProgress(0);
    setError(null);
    setFileName(null);
    setResult(null);
    setShowAllRejected(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      resetImport();
      setFileName(file.name);

      const ext = extensionOf(file.name);
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        setError(
          `".${ext}" files are not supported. Export the sheet as CSV (comma-separated values) and try again.`,
        );
        logExecution({
          kind: "validation",
          label: `Import rejected · unsupported format .${ext}`,
          status: "failed",
          durationMs: 0,
          detail: file.name,
        });
        return;
      }
      if (file.size === 0) {
        setError("The selected file is empty (0 bytes). Nothing was imported.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(2);
        setError(
          `File is ${mb} MB, which exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB client-side processing limit. Split the export into smaller files.`,
        );
        logExecution({
          kind: "validation",
          label: "Import rejected · file too large",
          status: "failed",
          durationMs: 0,
          detail: `${mb} MB > ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
        });
        return;
      }

      setReading(true);
      setProgress(4);
      try {
        const text = await readFileWithProgress(
          file,
          (percent) => setProgress(percent),
          (reader) => {
            readerRef.current = reader;
          },
        );
        readerRef.current = null;

        const parsed = parseCsv(text, file.name);
        setResult(parsed);
        logExecution({
          kind: "csv_parse",
          label: `CSV parsed · ${file.name}`,
          status: parsed.ok ? "succeeded" : "failed",
          durationMs: parsed.parseDurationMs,
          detail: `${parsed.records.length} accepted · ${parsed.rejected.length} rejected · ${parsed.emptyRows} blank rows skipped`,
        });
        logExecution({
          kind: "validation",
          label: `Schema validation · ${file.name}`,
          status: parsed.ok && parsed.rejected.length === 0 ? "succeeded" : "failed",
          durationMs: 0,
          detail:
            parsed.fatalError ??
            (parsed.rejected.length > 0
              ? `${parsed.rejected.length} row(s) failed validation`
              : "All rows passed column, date and numeric validation"),
        });

        if (parsed.ok) {
          const dataset: Dataset = {
            id: `dataset-${Date.now().toString(36)}`,
            name: file.name,
            source: "Imported CSV",
            isDemo: false,
            importedAt: new Date().toISOString(),
            records: parsed.records,
            rejected: parsed.rejected,
            warnings: parsed.warnings,
            acceptedCount: parsed.records.length,
            rejectedCount: parsed.rejected.length,
            parseDurationMs: parsed.parseDurationMs,
          };
          addDataset(dataset);
        }
      } catch (readError) {
        if (readError instanceof Error && readError.message === "__aborted__") {
          setError("Import cancelled. No records were saved.");
        } else {
          setError(
            readError instanceof Error
              ? readError.message
              : "The file could not be read due to an unexpected error.",
          );
          logExecution({
            kind: "csv_parse",
            label: `CSV read failed · ${file.name}`,
            status: "failed",
            durationMs: 0,
            detail: readError instanceof Error ? readError.message : "Unknown read error",
          });
        }
      } finally {
        setReading(false);
      }
    },
    [addDataset, logExecution, resetImport],
  );

  const cancelImport = useCallback(() => {
    readerRef.current?.abort();
    readerRef.current = null;
    setReading(false);
    setProgress(0);
    setError("Import cancelled before parsing. No records were saved.");
  }, []);

  /* --------------------------------------------------- results for the active dataset */

  const activeAnalysis = useMemo(() => {
    if (!activeDataset || activeDataset.records.length === 0) return null;
    const { summary, anomalyNote } = analyze(activeDataset.records);
    const derived = buildDerivedAnalysis(activeDataset.records, settings);
    return { summary, derived, anomalyNote };
  }, [activeDataset, settings]);

  const rejectedToShow = result
    ? showAllRejected
      ? result.rejected
      : result.rejected.slice(0, 12)
    : [];

  const previewHeaders = [...ACCEPTED_HEADERS, "__status"] as const;

  const importedCount = datasets.filter((d) => !d.isDemo).length;

  return (
    <>
      <SectionHeading
        eyebrow="Data Analysis"
        title="Import, validate and analyse consumption data"
        description="Every statistic on this page is computed from records that actually passed validation. Missing values are never silently replaced with zero, and nothing is reported as measured unless it came from your file."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FlaskConical size={14} />}
              onClick={() => setActiveDataset(SAMPLE_DATASET_ID)}
              disabled={interactionsDisabled}
            >
              Use sample dataset
            </Button>
            {result || error ? (
              <Button icon={<X size={14} />} onClick={resetImport}>
                Reset import
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ------------------------------------------------------------- import */}
        <Card className="xl:col-span-7">
          <CardHeader
            title="CSV import"
            caption="Drag a file onto the panel or browse. Parsing happens entirely in your browser."
            icon={<FileSpreadsheet size={15} />}
            actions={<Pill tone="neutral">Max {MAX_FILE_BYTES / (1024 * 1024)} MB</Pill>}
          />
          <div className="p-4 md:p-5">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
                dragActive
                  ? "border-brand/60 bg-brand/[0.07]"
                  : "border-line bg-hairline/[0.03] hover:border-brand/30",
              )}
            >
              <UploadCloud size={22} className={dragActive ? "text-brand" : "text-faint"} />
              <p className="mt-2.5 text-sm font-semibold text-ink">
                {dragActive ? "Release to import" : "Drop a CSV file here"}
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                Required header: <span className="font-mono text-2xs text-muted">
                  date,electricity_kwh,water_liters
                </span>
                . An optional <span className="font-mono text-2xs text-muted">cost_inr</span> column is
                used as measured expenditure when present.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="primary"
                  icon={<UploadCloud size={14} />}
                  onClick={() => inputRef.current?.click()}
                  disabled={reading}
                >
                  Choose file
                </Button>
                {reading ? (
                  <Button variant="ghost" icon={<X size={14} />} onClick={cancelImport}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </div>

            {reading ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    Reading {fileName ?? "file"}…
                  </span>
                  <span className="num text-faint">{progress}%</span>
                </div>
                <ProgressBar value={progress} />
                <p className="text-2xs text-faint">
                  Bytes read from disk — not parse progress. Parsing duration is measured separately
                  below.
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3.5 py-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-300">Import rejected</p>
                  <p className="mt-1 text-xs leading-relaxed text-red-200/85">{error}</p>
                  <p className="mt-1.5 text-2xs text-red-200/60">
                    No dataset was saved. Correct the file and import it again.
                  </p>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="mt-4 space-y-4">
                <div
                  className={cn(
                    "rounded-lg border px-3.5 py-3",
                    result.ok
                      ? "border-brand/30 bg-brand/[0.07]"
                      : "border-red-500/30 bg-red-500/[0.06]",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {result.ok ? (
                      <Pill tone="mint" icon={<CheckCircle2 size={10} />}>
                        Import complete
                      </Pill>
                    ) : (
                      <Pill tone="red" icon={<XCircle size={10} />}>
                        Import failed
                      </Pill>
                    )}
                    <span className="text-xs font-medium text-ink">{fileName}</span>
                    <span className="text-2xs text-faint">
                      parsed in {formatDuration(result.parseDurationMs)} (measured)
                    </span>
                  </div>
                  {result.fatalError ? (
                    <p className="mt-2 text-xs leading-relaxed text-red-200/85">{result.fatalError}</p>
                  ) : (
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      The file was decoded with the{" "}
                      <span className="font-mono text-2xs">
                        {result.delimiter === "\t" ? "tab" : `"${result.delimiter}"`}
                      </span>{" "}
                      delimiter. Columns detected:{" "}
                      <span className="font-mono text-2xs">
                        {result.detectedColumns.join(", ") || "none"}
                      </span>
                      .
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatBox label="Data rows" value={formatNumber(result.totalDataRows)} />
                  <StatBox
                    label="Accepted"
                    value={formatNumber(result.records.length)}
                    tone="mint"
                  />
                  <StatBox
                    label="Rejected"
                    value={formatNumber(result.rejected.length)}
                    tone={result.rejected.length > 0 ? "red" : "muted"}
                  />
                  <StatBox label="Blank rows skipped" value={formatNumber(result.emptyRows)} />
                </div>

                {result.warnings.length > 0 ? (
                  <ul className="space-y-1.5">
                    {result.warnings.map((warning) => (
                      <li
                        key={warning.code}
                        className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs leading-relaxed text-amber-100/90"
                      >
                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        {/* ------------------------------------------------------------- schema */}
        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardHeader
              title="Documented CSV schema"
              caption="Header names are matched after trimming and lower-casing."
              icon={<Info size={15} />}
            />
            <div className="p-4 md:p-5">
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-hairline/[0.05]">
                    <tr className="text-2xs uppercase tracking-[0.09em] text-faint">
                      <th className="px-3 py-2 font-semibold">Column</th>
                      <th className="px-3 py-2 font-semibold">Requirement</th>
                      <th className="px-3 py-2 font-semibold">Accepted values</th>
                    </tr>
                  </thead>
                  <tbody className="row-divide">
                    {REQUIRED_COLUMNS.map((column) => (
                      <tr key={column}>
                        <td className="px-3 py-2 font-mono text-2xs text-ink">{column}</td>
                        <td className="px-3 py-2 text-muted">Required</td>
                        <td className="px-3 py-2 text-faint">
                          {column === "date" ? "yyyy-mm-dd, or dd-mm-yyyy" : "number ≥ 0"}
                        </td>
                      </tr>
                    ))}
                    {OPTIONAL_COLUMNS.map((column) => (
                      <tr key={column}>
                        <td className="px-3 py-2 font-mono text-2xs text-ink">{column}</td>
                        <td className="px-3 py-2 text-muted">Optional</td>
                        <td className="px-3 py-2 text-faint">number ≥ 0 · measured spend</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-2xs leading-relaxed text-faint">
                The importer also accepts <span className="font-mono">;</span> and tab delimiters, and
                strips a leading byte-order mark.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Validation policy"
              caption="Deliberately explicit — nothing is repaired silently."
              icon={<ShieldCheck size={15} />}
            />
            <ul className="row-divide text-xs leading-relaxed text-muted">
              {[
                "Missing values in required columns are rejected, never defaulted to zero.",
                "Negative consumption values are rejected as physically impossible.",
                "Invalid dates and non-numeric values are rejected with the row number and reason.",
                "Duplicate dates keep the first occurrence; later duplicates are reported as rejected.",
                "Fully blank rows are skipped and counted separately from rejected rows.",
                `Files are capped at ${MAX_FILE_BYTES / (1024 * 1024)} MB and ${MAX_DATA_ROWS.toLocaleString()} data rows to protect browser memory.`,
              ].map((line) => (
                <li key={line} className="flex gap-2 px-4 py-3 md:px-5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------- preview */}
      {result && result.preview.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Data preview"
            caption={`First ${result.preview.length} data rows as parsed, including rejected ones`}
            actions={
              result.rejected.length > 0 ? (
                <Pill tone="red">{formatNumber(result.rejected.length)} rejected</Pill>
              ) : (
                <Pill tone="mint">No rejections</Pill>
              )
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead className="bg-hairline/[0.05]">
                <tr className="text-2xs uppercase tracking-[0.09em] text-faint">
                  <th className="px-4 py-2.5 font-semibold">Row</th>
                  {previewHeaders.map((header) => (
                    <th key={header} className="px-4 py-2.5 font-semibold">
                      {header === "__status" ? "Validation" : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="row-divide">
                {result.preview.map((row) => (
                  <tr key={row.row} className={row.accepted ? undefined : "bg-red-500/[0.03]"}>
                    <td className="num px-4 py-2.5 text-faint">{row.row}</td>
                    {ACCEPTED_HEADERS.map((header) => (
                      <td key={header} className="num px-4 py-2.5 text-muted">
                        {row.cells[header]?.trim() ? row.cells[header] : <span className="text-faint">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      {row.accepted ? (
                        <span className="inline-flex items-center gap-1.5 text-2xs text-brand-300">
                          <CheckCircle2 size={11} /> Accepted
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5 text-2xs text-red-300">
                          <XCircle size={11} className="mt-0.5 shrink-0" />
                          {row.issue}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------- rejected rows */}
      {result && result.rejected.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Rejected rows"
            caption="Each rejected row is reported individually so the source file can be corrected and retried."
            actions={
              result.rejected.length > 12 ? (
                <Button size="sm" variant="ghost" onClick={() => setShowAllRejected((v) => !v)}>
                  {showAllRejected ? "Show first 12" : `Show all ${result.rejected.length}`}
                </Button>
              ) : null
            }
          />
          <ul className="row-divide text-xs">
            {rejectedToShow.map((row) => (
              <li key={`${row.row}-${row.reason}`} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3 md:px-5">
                <span className="num shrink-0 font-semibold text-red-300">Row {row.row}</span>
                <span className="min-w-0 flex-1 leading-relaxed text-muted">{row.reason}</span>
                <span className="w-full truncate font-mono text-2xs text-faint sm:w-auto sm:max-w-[42%]">
                  {row.raw}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------- datasets */}
      <Card className="mt-4">
        <CardHeader
          title="Datasets available in this workspace"
          caption="Switching the active dataset updates every page. The sample dataset is generated locally and is never persisted."
          icon={<Database size={15} />}
          actions={
            importedCount > 0 ? (
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={resetDatasets}>
                Remove all imported
              </Button>
            ) : null
          }
        />
        <ul className="row-divide">
          {datasets.map((dataset) => {
            const isActive = activeDataset?.id === dataset.id;
            return (
              <li
                key={dataset.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{dataset.name}</span>
                    {dataset.isDemo ? <DemoBadge /> : <Pill tone="neutral">Imported</Pill>}
                    {isActive ? <Pill tone="brand">Active</Pill> : null}
                  </div>
                  <p className="mt-1 text-2xs text-faint">
                    {formatNumber(dataset.acceptedCount)} accepted ·{" "}
                    {dataset.rejectedCount > 0 ? `${formatNumber(dataset.rejectedCount)} rejected · ` : ""}
                    {dataset.records.length > 0
                      ? `${formatDateLong(dataset.records[0].date)} → ${formatDateLong(
                          dataset.records[dataset.records.length - 1].date,
                        )}`
                      : "No records"}
                    {dataset.parseDurationMs > 0
                      ? ` · parsed in ${formatDuration(dataset.parseDurationMs)} (measured)`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={isActive ? "ghost" : "secondary"}
                    onClick={() => setActiveDataset(dataset.id)}
                    disabled={isActive}
                  >
                    {isActive ? "In use" : "Activate"}
                  </Button>
                  {!dataset.isDemo ? (
                    <IconButton label={`Remove ${dataset.name}`} onClick={() => removeDataset(dataset.id)}>
                      <Trash2 size={14} />
                    </IconButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ------------------------------------------------------------- analysis results */}
      <div className="mt-6">
        <SectionHeading
          eyebrow="Analysis results"
          title="Computed from the records that passed validation"
          description={
            activeDataset
              ? `All figures below use every accepted record in "${activeDataset.name}" — the date-range control on the Overview page does not filter this panel.`
              : "Select or import a dataset to compute results."
          }
        />
      </div>

      {!activeDataset || !activeAnalysis ? (
        <EmptyState
          icon={<FileSpreadsheet size={22} />}
          title="No dataset to analyse"
          description="Import a CSV above, or activate the sample dataset to explore the analysis pipeline."
        />
      ) : (
        <div className="space-y-4">
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total electricity"
              value={activeAnalysis.summary.totalElectricityKwh}
              unit="kWh"
              icon={<Zap size={15} />}
              evidenceClass={activeDataset.isDemo ? "demo" : "measured"}
              method={`Sum of electricity_kwh over ${activeAnalysis.summary.recordCount} accepted records.`}
            />
            <MetricCard
              label="Total water"
              value={activeAnalysis.summary.totalWaterLiters}
              unit="litres"
              icon={<Droplets size={15} />}
              evidenceClass={activeDataset.isDemo ? "demo" : "measured"}
              method={`Sum of water_liters over ${activeAnalysis.summary.recordCount} accepted records.`}
            />
            <MetricCard
              label="Estimated expenditure"
              value={activeAnalysis.derived.costInr}
              unit="INR"
              icon={<BadgeIndianRupee size={15} />}
              evidenceClass={activeAnalysis.derived.costSource === "measured" ? "calculated" : "assumption"}
              method={activeAnalysis.derived.costMethod}
            />
            <MetricCard
              label="Estimated emissions"
              value={activeAnalysis.derived.emissionsAvailable ? activeAnalysis.derived.emissionsKg : null}
              unit="kg CO2e"
              icon={<Waves size={15} />}
              evidenceClass="assumption"
              unavailable={!activeAnalysis.derived.emissionsAvailable}
              unavailableReason="No emissions factor is configured. Set one in Settings → Calculations. Water emissions are never estimated without a documented factor."
              method={activeAnalysis.derived.emissionsMethod}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardHeader
                title="Descriptive statistics"
                caption="Every value is computed from accepted records only."
              />
              <div className="p-4 md:p-5">
                <KbdRow
                  items={[
                    { k: "Accepted records", v: formatNumber(activeAnalysis.summary.recordCount) },
                    { k: "Rejected at import", v: formatNumber(activeDataset.rejectedCount) },
                    { k: "Measurement window", v: `${activeAnalysis.summary.periodDays} days` },
                    {
                      k: "Date range",
                      v:
                        activeAnalysis.summary.from && activeAnalysis.summary.to
                          ? `${formatDateLong(activeAnalysis.summary.from)} → ${formatDateLong(activeAnalysis.summary.to)}`
                          : "—",
                    },
                    {
                      k: "Average electricity",
                      v: `${formatNumber(activeAnalysis.summary.avgDailyElectricityKwh, 1)} kWh/day`,
                    },
                    {
                      k: "Average water",
                      v: `${formatNumber(activeAnalysis.summary.avgDailyWaterLiters, 0)} L/day`,
                    },
                    {
                      k: "Electricity range",
                      v: `${formatNumber(activeAnalysis.summary.minElectricityKwh, 1)} – ${formatNumber(
                        activeAnalysis.summary.maxElectricityKwh,
                        1,
                      )} kWh`,
                    },
                    {
                      k: "Water range",
                      v: `${formatNumber(activeAnalysis.summary.minWaterLiters, 0)} – ${formatNumber(
                        activeAnalysis.summary.maxWaterLiters,
                        0,
                      )} L`,
                    },
                    {
                      k: "Electricity trend",
                      v: `${activeAnalysis.summary.electricityTrend} (${activeAnalysis.summary.electricityChangePercent > 0 ? "+" : ""}${activeAnalysis.summary.electricityChangePercent}%)`,
                    },
                    { k: "Water trend", v: activeAnalysis.summary.waterTrend },
                    {
                      k: "Peak electricity day",
                      v: activeAnalysis.summary.peakElectricityDate
                        ? `${formatDateLong(activeAnalysis.summary.peakElectricityDate)} · ${formatNumber(
                            activeAnalysis.summary.maxElectricityKwh,
                            1,
                          )} kWh`
                        : "—",
                    },
                    {
                      k: "Peak water day",
                      v: activeAnalysis.summary.peakWaterDate
                        ? `${formatDateLong(activeAnalysis.summary.peakWaterDate)} · ${formatNumber(
                            activeAnalysis.summary.maxWaterLiters,
                            0,
                          )} L`
                        : "—",
                    },
                  ]}
                />
                <div className="mt-4">
                  <MethodNote label="How is the trend computed?">
                    The window is split into a leading and a trailing block of up to 10 records each
                    (at least 4 records are required). The two block means are compared: a difference
                    above +5% is rising, below −5% is falling, otherwise stable. Trends describe this
                    measurement window only.
                  </MethodNote>
                </div>
                <div className="mt-2">
                  <MethodNote label="What counts as measured cost?">
                    Expenditure is labelled measured only when <span className="font-mono">cost_inr</span>{" "}
                    is present and positive on every accepted row. A partial column produces a mixed
                    figure, and an absent column falls back to the configured rate. {ASSUMPTION_DISCLOSURE}
                  </MethodNote>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-5">
              <CardHeader
                title="Detected anomalies"
                caption={activeAnalysis.anomalyNote}
                icon={<AlertTriangle size={15} />}
                actions={
                  <Pill tone={activeAnalysis.summary.anomalies.length > 0 ? "amber" : "mint"}>
                    {activeAnalysis.summary.anomalies.length} flagged
                  </Pill>
                }
              />
              {activeAnalysis.summary.anomalies.length === 0 ? (
                <div className="p-4 md:p-5">
                  <EmptyState
                    icon={<ShieldCheck size={18} />}
                    title={
                      activeAnalysis.summary.anomaliesExamined
                        ? "No statistical outlier in this window"
                        : "Anomaly detection not yet applicable"
                    }
                    description={
                      activeAnalysis.summary.anomaliesExamined
                        ? "Every day stayed inside this dataset's own normal band. That is a stability signal, not proof of efficiency."
                        : `At least ${MIN_OBSERVATIONS_FOR_ANOMALY} valid records are required to establish a normal band; this dataset has ${activeAnalysis.summary.recordCount}.`
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                    <thead className="bg-hairline/[0.05]">
                      <tr className="text-2xs uppercase tracking-[0.09em] text-faint">
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Metric</th>
                        <th className="px-4 py-2.5 font-semibold">Value</th>
                        <th className="px-4 py-2.5 font-semibold">z-score</th>
                        <th className="px-4 py-2.5 font-semibold">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="row-divide">
                      {activeAnalysis.summary.anomalies.map((anomaly) => (
                        <tr key={`${anomaly.date}-${anomaly.metric}`}>
                          <td className="px-4 py-2.5 text-ink">{formatDateLong(anomaly.date)}</td>
                          <td className="px-4 py-2.5 text-muted">
                            {anomaly.metric === "electricityKwh" ? "Electricity" : "Water"}
                          </td>
                          <td className="num px-4 py-2.5 text-muted">
                            {anomaly.metric === "electricityKwh"
                              ? `${formatNumber(anomaly.value, 1)} kWh`
                              : `${formatNumber(anomaly.value, 0)} L`}
                          </td>
                          <td className="num px-4 py-2.5 text-muted">{anomaly.score}</td>
                          <td className="px-4 py-2.5">
                            <Pill tone={anomaly.severity === "high" ? "red" : "amber"}>
                              {anomaly.severity}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-line px-4 py-3 text-2xs leading-relaxed text-faint md:px-5">
                    {ANOMALY_METHOD_NOTE} A flagged day does not prove waste, a fault, or equipment
                    failure — cross-check the meter reading and what changed that day.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {activeDataset.warnings.length > 0 || activeDataset.rejectedCount > 0 ? (
            <Card>
              <CardHeader
                title="Data quality warnings"
                caption="Recorded at import time and preserved with the dataset."
                icon={<AlertTriangle size={15} />}
              />
              <ul className="row-divide text-xs">
                <li className="px-4 py-3 md:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceChip evidenceClass="measured" />
                    <span className="text-muted">
                      {formatNumber(activeDataset.acceptedCount)} records accepted ·{" "}
                      {formatNumber(activeDataset.rejectedCount)} rejected ·{" "}
                      {formatNumber(activeDataset.records.length)} currently stored
                    </span>
                  </div>
                </li>
                {activeDataset.warnings.map((warning) => (
                  <li key={warning.code} className="flex gap-2 px-4 py-3 leading-relaxed text-muted md:px-5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                    <span>
                      {warning.message}
                      {warning.count ? (
                        <span className="num text-faint"> ({formatNumber(warning.count)} rows)</span>
                      ) : null}
                    </span>
                  </li>
                ))}
                {activeDataset.rejectedCount > 0 ? (
                  <li className="px-4 py-3 md:px-5">
                    <Button size="sm" variant="ghost" onClick={() => navigate("/performance")}>
                      View import metrics in Performance
                    </Button>
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Switch dataset"
              caption="Charts, insights, plans and the simulator all follow the active dataset."
            />
            <div className="flex flex-wrap items-end gap-3 p-4 md:p-5">
              <div className="w-full sm:w-[320px]">
                <label htmlFor="analysis-dataset" className="label-micro mb-1.5 block">
                  Active dataset
                </label>
                <Select
                  id="analysis-dataset"
                  value={activeDataset.id}
                  onChange={(event) => setActiveDataset(event.target.value)}
                >
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                      {dataset.isDemo ? " (demo)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={() => navigate("/overview")}>
                Open Overview
              </Button>
              <span className="text-2xs text-faint">
                Estimated expenditure for the sample dataset uses the configured rate:{" "}
                {formatInr(settings.electricityRateInrPerKwh, 2)}/kWh.
              </span>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function StatBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "mint" | "red" | "muted";
}) {
  return (
    <div className="rounded-lg border border-line bg-hairline/[0.03] px-3 py-2.5">
      <p className="label-micro">{label}</p>
      <p
        className={cn(
          "num mt-1 text-lg font-semibold",
          tone === "mint"
            ? "text-brand-300"
            : tone === "red"
              ? "text-red-300"
              : tone === "muted"
                ? "text-muted"
                : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
