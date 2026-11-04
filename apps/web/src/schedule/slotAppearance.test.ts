import { describe, expect, it } from "vitest";
import { DEFAULT_SLOT_TINT, isSlotTint, normalizeSlotTint, sameSlotTint, slotTintStrength } from "./slotAppearance";

describe("club slot tint", () => {
  it("accepts only a boolean switch and integer intensity within 0..30", () => {
    for (const strength of [0, 8, 30]) expect(isSlotTint({ enabled: false, strength })).toBe(true);
    for (const value of [null, {}, [], { enabled: true }, { enabled: "true", strength: 8 },
      { enabled: true, strength: -1 }, { enabled: true, strength: 31 }, { enabled: true, strength: 1.5 },
      { enabled: true, strength: NaN }, { enabled: true, strength: 8, extra: 1 }]) expect(isSlotTint(value)).toBe(false);
  });
  it("turns the tint off without discarding its chosen intensity", () => {
    const tint = { enabled: false, strength: 24 };
    expect(slotTintStrength(tint)).toBe("0%");
    expect(slotTintStrength({ ...tint, enabled: true })).toBe("24%");
    expect(sameSlotTint(tint, { ...tint, enabled: true })).toBe(false);
    expect(sameSlotTint(tint, { ...tint, strength: 8 })).toBe(false);
    expect(normalizeSlotTint(null)).toEqual(DEFAULT_SLOT_TINT);
    expect(normalizeSlotTint(tint)).not.toBe(tint);
  });
});
