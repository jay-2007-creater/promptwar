import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center",
        tone === "error" ? "border-red-500/30 bg-red-500/[0.04]" : "border-line bg-hairline/[0.03]",
        className,
      )}
    >
      {icon ? (
        <span className={cn("mb-1", tone === "error" ? "text-red-400" : "text-faint")}>{icon}</span>
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-hairline/[0.07]", className)}
      aria-hidden
    >
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-hairline/[0.10] to-transparent" />
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="card card-pad space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  value: number;
  tone?: "brand" | "amber";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          tone === "amber" ? "bg-amber-400" : "bg-brand",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
