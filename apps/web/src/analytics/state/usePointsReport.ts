import { useRegistryRevision } from "./useRegistry";
import { useAnalyticsMode } from "./source";
import { getPointsSource } from "../../data/analytics/http";
import { useEffect, useState } from "react";
import { loadPoints } from "../../data/analytics/points";
import type { PointsQuery, PointsReport } from "../contracts/points";
import { queryKey } from "../model/pointsFilters";
type Result = { key: string; status: "ready"; report: PointsReport; now: Date } | { key: string; status: "error" };
export function usePointsReport(query: PointsQuery, revision: number) {
  const mode = useAnalyticsMode();
  const regRevision = useRegistryRevision();
  const serialized = queryKey(query);
  const key = `${mode}:${regRevision}:${revision}:${serialized}`;
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (mode === "unconfigured") return;
    const controller = new AbortController();
    let current = true;
    void getPointsSource(mode).then(async (source) => {
      controller.signal.throwIfAborted();
      const report = await loadPoints(source, JSON.parse(serialized) as PointsQuery, controller.signal);
      if (current) setResult({ key, status: "ready", report, now: new Date() });
    }).catch(() => { if (current && !controller.signal.aborted) setResult({ key, status: "error" }); });
    return () => { current = false; controller.abort(); };
  }, [key, serialized, mode]);
  if (mode === "unconfigured") return { status: "unconfigured" } as const;
  return result?.key === key ? result : { status: "loading" } as const;
}
