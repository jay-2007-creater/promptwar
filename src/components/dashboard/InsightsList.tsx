import type { ReactNode } from "react";
import { EvidenceChip } from "@/components/ui/Badge";
import type { EvidenceClass } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Lightbulb } from "lucide-react";

export interface Insight {
  id: string;
  title: string;
  detail: ReactNode;
  evidenceClass: EvidenceClass;
  icon?: ReactNode;
}

export function InsightsList({
  insights,
  emptyTitle = "No insights available",
  emptyDescription,
  className,
}: {
  insights: Insight[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="Insights"
        caption="Observations computed from the active dataset only — nothing is inferred beyond the records"
        icon={<Lightbulb size={15} />}
      />
      {insights.length === 0 ? (
        <div className="p-4 md:p-5">
          <EmptyState
            icon={<Lightbulb size={18} />}
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <ul className="row-divide">
          {insights.map((insight) => (
            <li key={insight.id} className="flex gap-3 px-4 py-3.5 md:px-5">
              <span className="mt-0.5 shrink-0 text-brand">{insight.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{insight.title}</p>
                  <EvidenceChip evidenceClass={insight.evidenceClass} />
                </div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{insight.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
