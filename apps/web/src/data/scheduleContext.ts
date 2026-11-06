import { loadCapacityLive } from "./capacityLive";
import { loadDeadTimeIntervals } from "./deadTime";
import { loadScheduleSettings } from "./scheduleSettings";
import type { VariantCapacityMap } from "../schedule/capacity";

export async function loadScheduleContext(signal: AbortSignal) {
  const [settings, deadTimeIntervals, nitro, regular] = await Promise.all([
    loadScheduleSettings({ strict: true, signal }), loadDeadTimeIntervals(signal),
    loadCapacityLive("nitro", signal), loadCapacityLive("regular", signal),
  ]);
  if (!nitro || !regular) throw new Error("capacity-unavailable");
  return { settings, deadTimeIntervals, capacity: { nitro, regular } as VariantCapacityMap };
}
export type ScheduleContext = Awaited<ReturnType<typeof loadScheduleContext>>;
