import { describe, expect, it } from "vitest";
import { DEFAULT_LOCKED_SLOT_APPEARANCE as defaults, isLockedSlotAppearance, lockedSlotInk, lockedSlotSegments, normalizeLockedSlotAppearance, sameLockedSlotAppearance } from "./lockedSlotAppearance";
import { paletteContrast } from "./limitPalette";

describe("closed slot appearance", () => {
  it("accepts empty text, normalizes color case and rejects incomplete/oversized/unsafe values", () => {
    expect(isLockedSlotAppearance(defaults)).toBe(true);
    expect(sameLockedSlotAppearance({ ...defaults, dark: "#ABCDEF" }, { ...defaults, dark: "#abcdef" })).toBe(true);
    for (const value of [null, [], {}, { ...defaults, light: "red" }, { ...defaults, merge: 1 }, { ...defaults, short: "x".repeat(13) }, { ...defaults, long: "x".repeat(121) }, { ...defaults, extra: true }]) {
      expect(isLockedSlotAppearance(value)).toBe(false);
      expect(normalizeLockedSlotAppearance(value)).toEqual(defaults);
    }
  });
  it("merges only consecutive visible closed halves, splitting on occupied/open/hidden halves", () => {
    const halves = [0, 1, 3, 4, 8, 9, 47];
    expect(lockedSlotSegments(halves, true)).toEqual([
      { startHalf: 0, endHalf: 2 }, { startHalf: 3, endHalf: 5 }, { startHalf: 8, endHalf: 10 }, { startHalf: 47, endHalf: 48 },
    ]);
    expect(lockedSlotSegments(halves, false)).toEqual(halves.map(half => ({ startHalf: half, endHalf: half + 1 })));
    expect(lockedSlotSegments([], true)).toEqual([]);
  });
  it("keeps text readable on any chosen background", () => {
    for (const color of [defaults.light, defaults.dark, "#ffffff", "#000000", "#ffcc00", "#006aff", "#777777"]) {
      expect(paletteContrast(lockedSlotInk(color), color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
