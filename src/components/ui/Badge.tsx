import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  MinusCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  EvidenceClass,
  PlanStatus,
  Priority,
  ToolStatus,
} from "@/types";
import { EVIDENCE_LABEL } from "@/types";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "mint" | "amber" | "red" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-hairline/[0.05] text-muted",
  brand: "border-brand/30 bg-brand/10 text-brand-300",
  mint: "border-brand-300/25 bg-brand-300/10 text-brand-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  muted: "border-line/70 bg-transparent text-faint",
};

export function Pill({
  tone = "neutral",
  icon,
  children,
  className,
  mono,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.09em]",
        TONES[tone],
        mono && "font-mono tracking-normal normal-case",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const EVIDENCE_TONE: Record<EvidenceClass, Tone> = {
  measured: "neutral",
  calculated: "brand",
  assumption: "amber",
  interpretation: "muted",
  simulated: "amber",
  demo: "amber",
};

const EVIDENCE_ICON: Record<EvidenceClass, ReactNode> = {
  measured: <Activity size={10} />,
  calculated: <FlaskConical size={10} />,
  assumption: <AlertTriangle size={10} />,
  interpretation: <Sparkles size={10} />,
  simulated: <FlaskConical size={10} />,
  demo: <FlaskConical size={10} />,
};

export function EvidenceChip({
  evidenceClass,
  className,
}: {
  evidenceClass: EvidenceClass;
  className?: string;
}) {
  return (
    <Pill
      tone={EVIDENCE_TONE[evidenceClass]}
      icon={EVIDENCE_ICON[evidenceClass]}
      className={className}
    >
      {EVIDENCE_LABEL[evidenceClass]}
    </Pill>
  );
}

const TOOL_TONE: Record<ToolStatus, Tone> = {
  pending: "muted",
  running: "brand",
  succeeded: "mint",
  failed: "red",
  timed_out: "amber",
};

const TOOL_ICON: Record<ToolStatus, ReactNode> = {
  pending: <Clock size={10} />,
  running: <Loader2 size={10} className="animate-spin" />,
  succeeded: <CheckCircle2 size={10} />,
  failed: <XCircle size={10} />,
  timed_out: <AlertTriangle size={10} />,
};

export const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timed_out: "Timed out",
};

export function ToolStatusPill({ status }: { status: ToolStatus }) {
  return (
    <Pill tone={TOOL_TONE[status]} icon={TOOL_ICON[status]}>
      {TOOL_STATUS_LABEL[status]}
    </Pill>
  );
}

const PRIORITY_TONE: Record<Priority, Tone> = {
  critical: "red",
  high: "amber",
  medium: "brand",
  low: "muted",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return <Pill tone={PRIORITY_TONE[priority]}>{priority}</Pill>;
}

const PLAN_TONE: Record<PlanStatus, Tone> = {
  pending: "neutral",
  in_progress: "brand",
  completed: "mint",
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

export function PlanStatusPill({ status }: { status: PlanStatus }) {
  return <Pill tone={PLAN_TONE[status]}>{PLAN_STATUS_LABEL[status]}</Pill>;
}

const SECURITY_TONE: Record<string, Tone> = {
  verified: "mint",
  not_configured: "amber",
  not_verified: "amber",
  unavailable: "red",
};

const SECURITY_LABEL: Record<string, string> = {
  verified: "Verified",
  not_configured: "Not configured",
  not_verified: "Not verified",
  unavailable: "Unavailable",
};

export function SecurityStatusPill({ status }: { status: string }) {
  return (
    <Pill
      tone={SECURITY_TONE[status] ?? "neutral"}
      icon={
        status === "verified" ? (
          <CheckCircle2 size={10} />
        ) : status === "unavailable" ? (
          <XCircle size={10} />
        ) : (
          <MinusCircle size={10} />
        )
      }
    >
      {SECURITY_LABEL[status] ?? status}
    </Pill>
  );
}

export function DemoBadge({ label = "Demo data", className }: { label?: string; className?: string }) {
  return (
    <Pill
      tone="amber"
      icon={<FlaskConical size={10} />}
      className={cn("border-dashed", className)}
    >
      {label}
    </Pill>
  );
}
