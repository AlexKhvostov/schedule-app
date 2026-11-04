import { getSupabase } from "./client";
import { isDevSandboxEnabled } from "./config";
import { isLimitPalette, normalizeLimitPalette, sameLimitPalette, type LimitPalette } from "../schedule/limitPalette";

const STORAGE_KEY = "redparty.demo.limit-palette.v1";
const EVENT = "redparty:limit-palette";
export type PaletteResult = { palette: LimitPalette; error?: string };

function demoPalette() {
  try {
    return normalizeLimitPalette(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return normalizeLimitPalette(null);
  }
}

export async function loadClubLimitPalette(): Promise<PaletteResult> {
  if (isDevSandboxEnabled()) return { palette: demoPalette() };
  const fallback = normalizeLimitPalette(null);
  const db = getSupabase();
  if (!db) return { palette: fallback, error: "not-configured" };
  try {
    const { data, error } = await db.from("schedule_settings").select("limit_palette").eq("id", true).single();
    if (error || !isLimitPalette(data?.limit_palette)) return { palette: fallback, error: error?.message ?? "invalid-palette" };
    return { palette: normalizeLimitPalette(data.limit_palette) };
  } catch {
    return { palette: fallback, error: "network-error" };
  }
}

export async function saveClubLimitPalette(palette: LimitPalette, expected: LimitPalette): Promise<{ error?: string }> {
  if (!isLimitPalette(palette) || !isLimitPalette(expected)) return { error: "invalid-palette" };
  const next = normalizeLimitPalette(palette);
  try {
    if (isDevSandboxEnabled()) {
      if (!sameLimitPalette(demoPalette(), expected)) return { error: "palette-conflict" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
      return {};
    }
    const db = getSupabase();
    if (!db) return { error: "not-configured" };
    const { error } = await db.rpc("save_schedule_limit_palette", { p_palette: next, p_expected: expected });
    if (!error) window.dispatchEvent(new Event(EVENT));
    return { error: error?.message };
  } catch {
    return { error: "network-error" };
  }
}

export function subscribeClubLimitPalette(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onChange);
  // Recover after a missed realtime event or a sleeping/disconnected tab.
  const timer = window.setInterval(onChange, 60_000);
  const db = isDevSandboxEnabled() ? null : getSupabase();
  const channel = db?.channel("club-limit-palette")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "schedule_settings" }, onChange)
    .subscribe();
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onChange);
    window.clearInterval(timer);
    if (db && channel) void db.removeChannel(channel);
  };
}
