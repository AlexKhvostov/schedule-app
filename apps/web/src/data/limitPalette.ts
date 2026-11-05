import { getSupabase } from "./client";
import { isDevSandboxEnabled } from "./config";
import { isLimitPalette, normalizeLimitPalette, sameLimitPalette, type LimitPalette } from "../schedule/limitPalette";
import { isSlotTint, normalizeSlotTint, sameSlotTint, type SlotTint } from "../schedule/slotAppearance";
import { LOCKED_APPEARANCE_KEY } from "./lockedSlotAppearance";

const STORAGE_KEY = "redparty.demo.limit-palette.v1";
const APPEARANCE_KEY = "redparty.demo.slot-appearance.v1";
const EVENT = "redparty:limit-palette";
export type PaletteResult = { palette: LimitPalette; tint: SlotTint; error?: string };

function demoAppearance(): PaletteResult {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null");
    if (isLimitPalette(saved?.palette) && isSlotTint(saved?.tint)) {
      return { palette: normalizeLimitPalette(saved.palette), tint: normalizeSlotTint(saved.tint) };
    }
  } catch { /* Older Demo installations only have the palette key. */ }
  return { palette: demoPalette(), tint: normalizeSlotTint(null) };
}

function demoPalette() {
  try {
    return normalizeLimitPalette(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return normalizeLimitPalette(null);
  }
}

export async function loadClubLimitPalette(): Promise<PaletteResult> {
  if (isDevSandboxEnabled()) return demoAppearance();
  const fallback = { palette: normalizeLimitPalette(null), tint: normalizeSlotTint(null) };
  const db = getSupabase();
  if (!db) return { ...fallback, error: "not-configured" };
  try {
    const { data, error } = await db.from("schedule_settings").select("limit_palette,slot_tint").eq("id", true).single();
    if (error || !isLimitPalette(data?.limit_palette) || !isSlotTint(data?.slot_tint)) return { ...fallback, error: error?.message ?? "invalid-palette" };
    return { palette: normalizeLimitPalette(data.limit_palette), tint: normalizeSlotTint(data.slot_tint) };
  } catch {
    return { ...fallback, error: "network-error" };
  }
}

export async function saveClubLimitPalette(palette: LimitPalette, expected: LimitPalette, tint?: SlotTint, expectedTint?: SlotTint): Promise<{ error?: string }> {
  if (!isLimitPalette(palette) || !isLimitPalette(expected)) return { error: "invalid-palette" };
  if (tint !== undefined && (!isSlotTint(tint) || !isSlotTint(expectedTint))) return { error: "invalid-slot-tint" };
  const next = normalizeLimitPalette(palette);
  try {
    if (isDevSandboxEnabled()) {
      const current = demoAppearance();
      if (!sameLimitPalette(current.palette, expected) || (expectedTint && !sameSlotTint(current.tint, expectedTint))) return { error: "palette-conflict" };
      // The combined editor writes one value: no partially saved palette/tint pair.
      if (tint || localStorage.getItem(APPEARANCE_KEY)) localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ palette: next, tint: tint ?? current.tint }));
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
      return {};
    }
    const db = getSupabase();
    if (!db) return { error: "not-configured" };
    const { error } = tint
      ? await db.rpc("save_schedule_appearance", { p_palette: next, p_expected_palette: expected, p_tint: tint, p_expected_tint: expectedTint })
      : await db.rpc("save_schedule_limit_palette", { p_palette: next, p_expected: expected });
    if (!error) window.dispatchEvent(new Event(EVENT));
    return { error: error?.message };
  } catch {
    return { error: "network-error" };
  }
}

export function subscribeClubLimitPalette(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === APPEARANCE_KEY || event.key === LOCKED_APPEARANCE_KEY || event.key === null) onChange(); };
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
