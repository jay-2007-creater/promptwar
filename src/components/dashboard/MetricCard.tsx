import type { ReactNode } from "react";
import { EvidenceChip } from "@/components/ui/Badge";
import { MethodNote } from "@/components/ui/Card";
import type { EvidenceClass } from "@/types";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  unit,
  evidenceClass,
  method,
  icon,
  unavailable,
  unavailableReason,
  className,
}: {
  label: string;
  value: number | null;
  unit: string;
  evidenceClass: EvidenceClass;
  method: string;
  icon?: ReactNode;
  unavailable?: boolean;
  unavailableReason?: string;
  className?: string;
}) {
  const isUnavailable = unavailable || value === null;

  return (
    <div
      className={cn(
        "card flex flex-col gap-3 p-4",
        isUnavailable && "border-dashed",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label-micro leading-tight">{label}</p>
        {icon ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              isUnavailable
                ? "bg-hairline/[0.05] text-faint"
                : "bg-brand/10 text-brand ring-1 ring-brand/20",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-1.5">
        {isUnavailable ? (
          <span className="num text-2xl font-semibold text-faint">Unavailable</span>
        ) : (
          <>
            <span className="metric-value">
              {value!.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs font-medium tracking-wide text-faint">{unit}</span>
          </>
        )}
      </div>

      <div className="mt-auto space-y-2">
        <EvidenceChip evidenceClass={isUnavailable ? "assumption" : evidenceClass} />
        <MethodNote label={isUnavailable ? "Why is this unavailable?" : "How is this computed?"}>
          {isUnavailable ? unavailableReason ?? "Required inputs are missing." : method}
        </MethodNote>
      </div>
    </div>
  );
}
