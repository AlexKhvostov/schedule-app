import { getSupabase } from "./client";
import { isDevSandboxEnabled } from "./config";
import { invalidateScheduleConfiguration, loadScheduleConfiguration, subscribeConfigurationChanged } from "./scheduleConfiguration";

export type ScheduleSyncSettings = { enabled: boolean; intervalMinutes: number };
export const DEFAULT_SYNC_SETTINGS: ScheduleSyncSettings = { enabled: false, intervalMinutes: 5 };
const KEY = "redparty.demo.schedule-sync.v1";
const EVENT = "redparty:demo-schedule-sync";

export function validScheduleSyncSettings(value: unknown): value is ScheduleSyncSettings {
  const row = value as ScheduleSyncSettings | null;
  return !!row && typeof row.enabled === "boolean" && Number.isInteger(row.intervalMinutes)
    && row.intervalMinutes >= 1 && row.intervalMinutes <= 60;
}

export function syncSettingsFromRow(row: Record<string, unknown>): ScheduleSyncSettings {
  const result = { enabled: row.sync_fallback_enabled, intervalMinutes: row.sync_fallback_minutes };
  if (!validScheduleSyncSettings(result)) throw new Error("invalid-sync-settings");
  return result;
}

function demoSettings(): ScheduleSyncSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return validScheduleSyncSettings(value) ? value : { ...DEFAULT_SYNC_SETTINGS };
  } catch { return { ...DEFAULT_SYNC_SETTINGS }; }
}

export async function loadScheduleSyncSettings(signal?: AbortSignal) {
  if (isDevSandboxEnabled()) return demoSettings();
  return syncSettingsFromRow((await loadScheduleConfiguration(signal)).settings);
}

/** Explicit reload must bypass a stale cache after a missed event or CAS conflict. */
export async function reloadScheduleSyncSettings() {
  if (!isDevSandboxEnabled()) invalidateScheduleConfiguration();
  return loadScheduleSyncSettings();
}

export async function saveScheduleSyncSettings(value: ScheduleSyncSettings, expected: ScheduleSyncSettings): Promise<{ error?: string }> {
  if (!validScheduleSyncSettings(value) || !validScheduleSyncSettings(expected)) return { error: "invalid-sync-settings" };
  try {
    if (isDevSandboxEnabled()) {
      const current = demoSettings();
      if (current.enabled !== expected.enabled || current.intervalMinutes !== expected.intervalMinutes) return { error: "sync-settings-conflict" };
      localStorage.setItem(KEY, JSON.stringify(value));
      window.dispatchEvent(new Event(EVENT));
    } else {
      const db = getSupabase();
      if (!db) return { error: "not-configured" };
      const { error } = await db.rpc("save_schedule_sync", {
        p_enabled: value.enabled, p_minutes: value.intervalMinutes,
        p_expected_enabled: expected.enabled, p_expected_minutes: expected.intervalMinutes,
      });
      if (error) return { error: error.message };
      invalidateScheduleConfiguration();
    }
    return {};
  } catch { return { error: "network-error" }; }
}

export function subscribeScheduleSyncSettings(listener: () => void) {
  if (!isDevSandboxEnabled()) return subscribeConfigurationChanged(listener);
  const storage = (event: StorageEvent) => { if (!event.key || event.key === KEY) listener(); };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", storage); };
}
