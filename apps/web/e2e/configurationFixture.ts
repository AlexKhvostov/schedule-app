import { DEFAULT_LIMIT_PALETTE } from "../src/schedule/limitPalette";
import { DEFAULT_SLOT_TINT } from "../src/schedule/slotAppearance";
import { DEFAULT_LOCKED_SLOT_APPEARANCE } from "../src/schedule/lockedSlotAppearance";

export function configurationFixture(kinds: { id: string; variant_id: string; limit_id: string }[], settings: Record<string, unknown> = {}) {
  return {
    settings: {
      allow_act_as: true, allow_overwrite_marks: false, count_tables: false, edit_by_button: true,
      merge_adjacent_slots: true, filter_limits_nitro: ["50", "100"], filter_limits_regular: ["50"],
      limit_palette: DEFAULT_LIMIT_PALETTE, slot_tint: DEFAULT_SLOT_TINT,
      locked_slot_appearance: DEFAULT_LOCKED_SLOT_APPEARANCE, hour_load: {},
      sync_fallback_enabled: false, sync_fallback_minutes: 5, ...settings,
    },
    kinds, deadTimeIntervals: [], capacityFlags: [], capacityRules: [] as Record<string, unknown>[], revision: "0",
  };
}

export function revisionsFixture() {
  return { version: 1, targets: [] as { date: string; kind_id: string; revision: string }[], config: "0", directory: "0", priorities: "0", access: "0" };
}
