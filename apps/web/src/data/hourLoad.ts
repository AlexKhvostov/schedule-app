import { loadScheduleConfiguration, invalidateScheduleConfiguration, subscribeConfigurationChanged } from "./scheduleConfiguration";
import { getSupabase } from "./client";
import { isDevSandboxEnabled } from "./config";
import { emptyLoadRow, isHourLoadMap, isHourLoadRow, legacyLoadRow, sameLoadRow, validLoadKey, type HourLoadMap, type HourLoadRow } from "../schedule/hourLoad";

const KEY = "redparty.demo.hour-load.v2";
const EVENT = "redparty:hour-load";
function demoLoad(): HourLoadMap {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (!isHourLoadMap(value)) throw new Error("invalid-hour-load");
  return value;
}
export function readLegacyHourLoad(limit: string) {
  try { return legacyLoadRow(JSON.parse(localStorage.getItem("v2-hour-load") ?? "null"), limit); }
  catch { return null; }
}
export async function loadClubHourLoad(): Promise<{ map: HourLoadMap; error?: string }> {
  try {
    if (isDevSandboxEnabled()) return { map: demoLoad() };
    const db = getSupabase();
    if (!db) return { map: {}, error: "not-configured" };
    const { settings } = await loadScheduleConfiguration();
    if (!isHourLoadMap(settings.hour_load)) return { map: {}, error: "invalid-hour-load" };
    return { map: settings.hour_load };
  } catch (error) { return { map: {}, error: error instanceof Error ? error.message : "load-error" }; }
}
export async function saveClubHourLoad(key: string, row: HourLoadRow, expected: HourLoadRow): Promise<{ error?: string }> {
  if (!validLoadKey(key) || !isHourLoadRow(row) || !isHourLoadRow(expected)) return { error: "invalid-hour-load" };
  try {
    if (isDevSandboxEnabled()) {
      const map = demoLoad();
      if (!sameLoadRow(map[key] ?? emptyLoadRow(), expected)) return { error: "hour-load-conflict" };
      localStorage.setItem(KEY, JSON.stringify({ ...map, [key]: row }));
    } else {
      const db = getSupabase();
      if (!db) return { error: "not-configured" };
      const { error } = await db.rpc("save_schedule_hour_load", { p_key: key, p_row: row, p_expected: expected });
      if (error) return { error: error.message };
      invalidateScheduleConfiguration();
    }
    window.dispatchEvent(new Event(EVENT));
    return {};
  } catch { return { error: "save-error" }; }
}
export function subscribeClubHourLoad(onChange: () => void) {
  if (!isDevSandboxEnabled()) return subscribeConfigurationChanged(onChange);
  const storage = (event: StorageEvent) => { if (!event.key || event.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", storage);
  };
}
