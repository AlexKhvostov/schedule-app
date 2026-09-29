import { describe, expect, it } from "vitest";
import { hourBoundaries, uniqueShiftHours } from "./myShifts";

describe("my shifts presentation", () => {
  it("keeps separators only on full-hour boundaries", () => {
    expect(hourBoundaries(1, 7)).toEqual([2, 4, 6]);
    expect(hourBoundaries(2, 4)).toEqual([]);
    expect(hourBoundaries(2, 5)).toEqual([4]);
  });

  it("does not double-count overlapping variants in physical time", () => {
    expect(uniqueShiftHours([
      { day: 1, limit: "N50", start: 16, end: 18 },
      { day: 1, limit: "E50", start: 17, end: 19 },
    ])).toBe(1.5);
  });
});
