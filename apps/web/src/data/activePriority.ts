import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { notifyPriorityDistanceChanged } from "./priorityRefresh";
import { isPriorityPeriod } from "../schedule/priorities";

export type ActivePriority = { activePeriod: string; activeRevision: number };
export const DEMO_ACTIVE_PRIORITY_KEY = "v2-active-priority-1";

export function demoActivePriority(): ActivePriority {
  const saved = localStorage.getItem(DEMO_ACTIVE_PRIORITY_KEY);
  if (saved === null) return { activePeriod: "2026-08-01", activeRevision: 0 };
  const value = JSON.parse(saved) as ActivePriority;
  if (!isPriorityPeriod(value.activePeriod) || !Number.isSafeInteger(value.activeRevision) || value.activeRevision < 0) throw new Error("priority-invalid-active");
  return value;
}

export async function setActivePriority(period: string, expectedRevision: number, demoCanManage: boolean): Promise<{ error: string | null }> {
  if (!isPriorityPeriod(period)) return { error: "priority-bad-period" };
  try {
    if (!isLiveData()) {
      if (!demoCanManage) return { error: "forbidden" };
      const current = demoActivePriority();
      if (current.activeRevision !== expectedRevision) return { error: "priority-active-conflict" };
      localStorage.setItem(DEMO_ACTIVE_PRIORITY_KEY, JSON.stringify({ activePeriod: period, activeRevision: current.activeRevision + 1 }));
    } else {
      const db = getSupabase();
      if (!db) return { error: "not-configured" };
      const { error } = await db.rpc("set_active_priority", { p_period_start: period, p_expected_revision: expectedRevision });
      if (error) return { error: error.message };
    }
    notifyPriorityDistanceChanged();
    return { error: null };
  } catch (error) { return { error: String(error) }; }
}
