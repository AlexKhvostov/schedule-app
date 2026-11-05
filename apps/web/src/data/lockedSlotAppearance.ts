import { getSupabase } from "./client";
import { isDevSandboxEnabled } from "./config";
import { isLockedSlotAppearance, normalizeLockedSlotAppearance, sameLockedSlotAppearance, type LockedSlotAppearance } from "../schedule/lockedSlotAppearance";

export const LOCKED_APPEARANCE_KEY = "redparty.demo.locked-slot-appearance.v1";
function demoAppearance() {
  return normalizeLockedSlotAppearance(JSON.parse(localStorage.getItem(LOCKED_APPEARANCE_KEY) ?? "null"));
}

export async function loadLockedSlotAppearance(): Promise<{ appearance: LockedSlotAppearance; error?: string }> {
  const fallback = normalizeLockedSlotAppearance(null);
  try {
    if (isDevSandboxEnabled()) return { appearance: demoAppearance() };
    const db = getSupabase();
    if (!db) return { appearance: fallback, error: "not-configured" };
    const { data, error } = await db.from("schedule_settings").select("locked_slot_appearance").eq("id", true).single();
    if (error || !isLockedSlotAppearance(data?.locked_slot_appearance)) return { appearance: fallback, error: error?.message ?? "invalid-locked-appearance" };
    return { appearance: normalizeLockedSlotAppearance(data.locked_slot_appearance) };
  } catch { return { appearance: fallback, error: "network-error" }; }
}

export async function saveLockedSlotAppearance(appearance: LockedSlotAppearance, expected: LockedSlotAppearance): Promise<{ error?: string }> {
  if (!isLockedSlotAppearance(appearance) || !isLockedSlotAppearance(expected)) return { error: "invalid-locked-appearance" };
  const next = normalizeLockedSlotAppearance(appearance);
  try {
    if (isDevSandboxEnabled()) {
      if (!sameLockedSlotAppearance(demoAppearance(), expected)) return { error: "locked-appearance-conflict" };
      localStorage.setItem(LOCKED_APPEARANCE_KEY, JSON.stringify(next));
    } else {
      const db = getSupabase();
      if (!db) return { error: "not-configured" };
      const { error } = await db.rpc("save_schedule_locked_appearance", { p_appearance: next, p_expected: normalizeLockedSlotAppearance(expected) });
      if (error) return { error: error.message };
    }
    window.dispatchEvent(new Event("redparty:limit-palette"));
    return {};
  } catch { return { error: "network-error" }; }
}
