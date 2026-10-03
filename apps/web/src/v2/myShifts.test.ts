import { describe, expect, it } from "vitest";
import { emptyMonth } from "../schedule/plan";
import type { Mark } from "../schedule/marks";
import { hourBoundaries, mergeOccupiedPairs, occupiedPairsFromSlots, uniqueShiftHours } from "./myShifts";

const mine: Mark = {
  t: "ME",
  discord: "Me",
  room: "MeRoom",
  bg: "#123456",
  fg: "#ffffff",
  tables: 4,
  memberId: "member-me",
};

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

  it("keeps the tournament kind when the same limit is occupied in both schedules", () => {
    const occupied = occupiedPairsFromSlots([
      { variant: "nitro", limit: "50", dayIdx: 0, half: 16 },
      { variant: "regular", limit: "50", dayIdx: 0, half: 16 },
    ], 31);

    expect(occupied[0][16]).toEqual([
      { variant: "nitro", limit: "50" },
      { variant: "regular", limit: "50" },
    ]);
  });

  it("merges optimistic changes per variant and limit instead of collapsing equal limits", () => {
    const nitro = emptyMonth(2026, 9);
    const regular = emptyMonth(2026, 9);
    nitro[0][16][0] = mine;
    const remote = occupiedPairsFromSlots([
      { variant: "nitro", limit: "100", dayIdx: 0, half: 16 },
      { variant: "regular", limit: "50", dayIdx: 0, half: 16 },
    ], 31);

    expect(mergeOccupiedPairs(remote, {
      "nitro:50": nitro,
      "regular:50": regular,
    }, mine)[0][16]).toEqual([
      { variant: "nitro", limit: "50" },
      { variant: "nitro", limit: "100" },
    ]);
  });
});
