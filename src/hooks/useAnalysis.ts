import { useMemo } from "react";
import type {
  ConsumptionRecord,
  Dataset,
  DerivedAnalysis,
  Recommendation,
} from "@/types";
import { useActiveDataset, useAppStore } from "@/store/useAppStore";
import { buildDerivedAnalysis, filterByRange } from "@/services/analytics";
import { generateRecommendations } from "@/services/recommendations";

/**
 * Derived-data hooks. All dashboard surfaces read from these so every chart and card is
 * computed from the same records, the same date window, and the same formulas.
 */

export interface ActiveRecords {
  dataset: Dataset | null;
  /** Records fully parsed from the dataset, before the date-range window is applied. */
  allRecords: ConsumptionRecord[];
  /** Records inside the active date-range window. */
  records: ConsumptionRecord[];
  rangeDays: number;
}

export function useActiveRecords(): ActiveRecords {
  const dataset = useActiveDataset();
  const rangeDays = useAppStore((s) => s.settings.dateRangeDays);

  return useMemo(() => {
    const allRecords = dataset?.records ?? [];
    return {
      dataset,
      allRecords,
      records: filterByRange(allRecords, rangeDays),
      rangeDays,
    };
  }, [dataset, rangeDays]);
}

export function useDerivedAnalysis(): {
  derived: DerivedAnalysis;
  records: ConsumptionRecord[];
  dataset: Dataset | null;
  rangeDays: number;
} {
  const { dataset, records, rangeDays } = useActiveRecords();
  const settings = useAppStore((s) => s.settings);

  const derived = useMemo(
    () => buildDerivedAnalysis(records, settings),
    [records, settings],
  );

  return { derived, records, dataset, rangeDays };
}

export function useRecommendations(): Recommendation[] {
  const { dataset, records } = useActiveRecords();
  const settings = useAppStore((s) => s.settings);

  return useMemo(() => {
    if (!dataset || records.length === 0) return [];
    return generateRecommendations({
      datasetId: dataset.id,
      records,
      settings,
    });
  }, [dataset, records, settings]);
}
