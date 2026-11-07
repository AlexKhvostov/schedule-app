import { LIMIT_OPTIONS, defaultCapacity, emptyProfile, normalizeHours, type CapacityMap, type HourCaps } from "../schedule/capacity";
import { getSupabase } from "./client";
import { loadScheduleConfiguration, invalidateScheduleConfiguration, type ScheduleConfiguration } from "./scheduleConfiguration";

function arr(hours: number[] | null | undefined): HourCaps {
  return normalizeHours(hours ?? undefined);
}

export async function loadCapacityLive(variant: "nitro" | "regular", signal?: AbortSignal): Promise<CapacityMap | null> {
  const db = getSupabase();
  if (!db) return null;
  return capacityFromConfiguration(await loadScheduleConfiguration(signal), variant);
}

export function capacityFromConfiguration(data: ScheduleConfiguration, variant: "nitro" | "regular"): CapacityMap {
  const wanted = data.kinds.filter(row => row.variant_id === variant);
  if (LIMIT_OPTIONS.some(limit => !wanted.some(kind => kind.limit_id === limit))) throw new Error("capacity-kinds-unavailable");
  const flags = data.capacityFlags;
  const rules = data.capacityRules;
  const next = defaultCapacity();
  for (const kind of wanted) {
    const profile = emptyProfile();
    const flag = flags?.find((row) => row.kind_id === kind.id);
    if (flag) {
      profile.equalize = Boolean(flag.equalize);
      profile.weekOn = flag.week_on !== false;
      profile.monthOn = flag.month_on !== false;
    }
    for (const rule of rules ?? []) {
      if (rule.kind_id !== kind.id) continue;
      const hours = arr(rule.hours);
      if (rule.layer === "base") profile.hours = hours;
      if (rule.layer === "month" && rule.day_of_month) profile.days[String(rule.day_of_month)] = hours;
      if (rule.layer === "week" && rule.weekday != null) profile.weekdays[String(rule.weekday)] = hours;
    }
    next[kind.limit_id] = profile;
  }
  return next;
}

export async function saveCapacityLive(variant: "nitro" | "regular", map: CapacityMap) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("save_capacity_profiles", { p_variant: variant, p_profiles: map });
  if (!error) invalidateScheduleConfiguration();
  return { error: error?.message };
}
