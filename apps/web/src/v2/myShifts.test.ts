import { describe, expect, it } from "vitest";
import { hourBoundaries } from "./myShifts";

describe("my shifts presentation", () => {
  it("keeps separators only on full-hour boundaries", () => {
    expect(hourBoundaries(1, 7)).toEqual([2, 4, 6]);
    expect(hourBoundaries(2, 4)).toEqual([]);
    expect(hourBoundaries(2, 5)).toEqual([4]);
  });
});
