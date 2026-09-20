import { defaultCapacity, emptyProfile, normalizeHours, type CapacityMap, type HourCaps } from "../schedule/capacity";
import { getSupabase } from "./client";
import { kindIdOf, loadKinds } from "./kinds";

function arr(hours: number[] | null | undefined): HourCaps {
  return normalizeHours(hours ?? undefined);
}

export async function loadCapacityLive(variant: "nitro" | "regular"): Promise<CapacityMap | null> {
  const db = getSupabase();
  if (!db) return null;
  const kinds = await loadKinds();
  const wanted = kinds.filter((row) => row.variantId === variant);
  if (!wanted.length) return defaultCapacity();
  const ids = wanted.map((row) => row.id);
  const [{ data: flags }, { data: rules }] = await Promise.all([
    db.from("capacity_flags").select("kind_id, equalize, week_on, month_on").in("kind_id", ids),
    db.from("capacity_rules").select("kind_id, layer, day_of_month, weekday, hours").in("kind_id", ids),
  ]);
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
    next[kind.limitId] = profile;
  }
  return next;
}

export async function saveCapacityLive(variant: "nitro" | "regular", map: CapacityMap) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  for (const [limit, profile] of Object.entries(map)) {
    const kindId = await kindIdOf(limit, variant);
    if (!kindId) continue;
    const { error: flagError } = await db.from("capacity_flags").upsert({
      kind_id: kindId,
      equalize: profile.equalize,
      week_on: profile.weekOn,
      month_on: profile.monthOn,
    });
    if (flagError) return { error: flagError.message };
    await db.from("capacity_rules").delete().eq("kind_id", kindId);
    const rows: {
      kind_id: string;
      layer: string;
      day_of_month: number | null;
      weekday: number | null;
      hours: number[];
    }[] = [{ kind_id: kindId, layer: "base", day_of_month: null, weekday: null, hours: profile.hours }];
    for (const [day, hours] of Object.entries(profile.days)) {
      rows.push({ kind_id: kindId, layer: "month", day_of_month: Number(day), weekday: null, hours });
    }
    for (const [weekday, hours] of Object.entries(profile.weekdays)) {
      rows.push({ kind_id: kindId, layer: "week", day_of_month: null, weekday: Number(weekday), hours });
    }
    const { error } = await db.from("capacity_rules").insert(rows);
    if (error) return { error: error.message };
  }
  return {};
}
