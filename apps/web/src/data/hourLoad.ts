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
    const { data, error } = await db.from("schedule_settings").select("hour_load").eq("id", true).single();
    if (error || !isHourLoadMap(data?.hour_load)) return { map: {}, error: error?.message ?? "invalid-hour-load" };
    return { map: data.hour_load };
  } catch { return { map: {}, error: "load-error" }; }
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
    }
    window.dispatchEvent(new Event(EVENT));
    return {};
  } catch { return { error: "save-error" }; }
}
export function subscribeClubHourLoad(onChange: () => void) {
  const storage = (event: StorageEvent) => { if (!event.key || event.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", onChange);
  const timer = window.setInterval(onChange, 60_000);
  const db = isDevSandboxEnabled() ? null : getSupabase();
  const channel = db?.channel("club-hour-load").on("postgres_changes", { event: "UPDATE", schema: "public", table: "schedule_settings" }, onChange).subscribe();
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", onChange);
    window.clearInterval(timer);
    if (db && channel) void db.removeChannel(channel);
  };
}
