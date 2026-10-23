import { RefreshCw, Upload, CalendarRange, Database } from "lucide-react";
import type { Dataset } from "@/types";
import { Button } from "@/components/ui/Button";
import { DemoBadge, Pill } from "@/components/ui/Badge";
import { SegmentedControl, Select } from "@/components/ui/Field";
import { SAMPLE_DATASET_ID } from "@/data/sampleData";
import { formatDateLong } from "@/lib/format";

export interface WorkspaceHeaderProps {
  title: string;
  subtitle: string;
  dataset: Dataset | null;
  datasets: Dataset[];
  onSelectDataset: (id: string) => void;
  rangeDays: number;
  onSelectRange: (days: 7 | 30 | 90 | 0) => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastRefreshMs: number | null;
  onOpenImport: () => void;
  rangeLabel: string;
}

export function WorkspaceHeader({
  title,
  subtitle,
  dataset,
  datasets,
  onSelectDataset,
  rangeDays,
  onSelectRange,
  onRefresh,
  refreshing,
  lastRefreshMs,
  onOpenImport,
  rangeLabel,
}: WorkspaceHeaderProps) {
  return (
    <div className="card card-pad mb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone="neutral" icon={<Database size={10} />}>
              Active dataset
            </Pill>
            {dataset?.isDemo ? <DemoBadge /> : null}
          </div>
          <h1 className="page-title">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
            <span className="font-medium text-muted">{dataset?.name ?? "No dataset selected"}</span>
            <span className="hidden sm:inline">·</span>
            <span>Source: {dataset?.source ?? "—"}</span>
            <span className="hidden sm:inline">·</span>
            <span>
              {dataset && dataset.records.length > 0
                ? `${formatDateLong(dataset.records[0].date)} → ${formatDateLong(
                    dataset.records[dataset.records.length - 1].date,
                  )}`
                : "No date range available"}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Active dataset"
              value={dataset?.id ?? SAMPLE_DATASET_ID}
              onChange={(event) => onSelectDataset(event.target.value)}
              className="w-full sm:w-[260px]"
            >
              {datasets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.isDemo ? " (demo)" : ""}
                </option>
              ))}
            </Select>
            <Button icon={<Upload size={14} />} onClick={onOpenImport}>
              Import data
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-2xs text-faint">
              <CalendarRange size={12} />
              Range
            </span>
            <SegmentedControl<7 | 30 | 90 | 0>
              size="sm"
              ariaLabel="Analysis range"
              value={rangeDays as 7 | 30 | 90 | 0}
              onChange={onSelectRange}
              options={[
                { value: 7, label: "7d" },
                { value: 30, label: "30d" },
                { value: 90, label: "90d" },
                { value: 0, label: "All" },
              ]}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />}
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Recomputing…" : "Refresh analysis"}
            </Button>
          </div>

          <p className="text-2xs text-faint">
            {rangeLabel}
            {lastRefreshMs !== null
              ? ` · last recompute ${lastRefreshMs} ms (measured)`
              : " · not recomputed this session"}
          </p>
        </div>
      </div>
    </div>
  );
}
