import { describe, expect, it } from "vitest";
import type { DeadTimeInterval } from "../data/deadTime";
import { deadTimeBreakdown, deadTimeBreakdownsByMember, isDeadTimeHalf, type ScheduledHalf } from "./deadTimeStats";
import { emptyMonth } from "./plan";

const rule = (overrides: Partial<DeadTimeInterval> = {}): DeadTimeInterval => ({
  id: "rule",
  variant: "nitro",
  limit: "50",
  startHalf: 16,
  endHalf: 18,
  ...overrides,
});

const slot = (overrides: Partial<ScheduledHalf> = {}): ScheduledHalf => ({
  day: 1,
  half: 16,
  variant: "nitro",
  limit: "50",
  ...overrides,
});

describe("dead-time statistics", () => {
  it("uses an inclusive start and exclusive end for the matching pair", () => {
    const intervals = [rule()];
    expect(isDeadTimeHalf(slot({ half: 15 }), intervals)).toBe(false);
    expect(isDeadTimeHalf(slot({ half: 16 }), intervals)).toBe(true);
    expect(isDeadTimeHalf(slot({ half: 17 }), intervals)).toBe(true);
    expect(isDeadTimeHalf(slot({ half: 18 }), intervals)).toBe(false);
    expect(isDeadTimeHalf(slot({ variant: "regular" }), intervals)).toBe(false);
    expect(isDeadTimeHalf(slot({ limit: "100" }), intervals)).toBe(false);
  });

  it("does not double-count the same physical half-hour in the grand total", () => {
    const intervals = [rule(), rule({ id: "n100", limit: "100" }), rule({ id: "e50", variant: "regular" })];
    const result = deadTimeBreakdown([
      slot(),
      slot({ limit: "100" }),
      slot({ variant: "regular" }),
      slot(),
    ], intervals);
    expect(result).toEqual({ byPair: { N50: 0.5, N100: 0.5, E50: 0.5 }, total: 0.5 });
  });

  it("counts a half-hour as dead when another simultaneous pair is ordinary", () => {
    const result = deadTimeBreakdown(
      [slot(), slot({ limit: "100" })],
      [rule()],
    );
    expect(result).toEqual({ byPair: { N50: 0.5 }, total: 0.5 });
  });

  it("keeps different days and halves unique and returns zero without matches", () => {
    expect(deadTimeBreakdown([
      slot(), slot({ day: 2 }), slot({ day: 2, half: 17 }),
    ], [rule()])).toEqual({ byPair: { N50: 1.5 }, total: 1.5 });
    expect(deadTimeBreakdown([slot()], [])).toEqual({ byPair: {}, total: 0 });
  });

  it("aggregates several players in one pass and deduplicates stacked levels", () => {
    const n50 = emptyMonth(2026, 8);
    const n100 = emptyMonth(2026, 8);
    const alex = { t: "AL", discord: "alex", room: "A", bg: "#fff", fg: "#000", tables: 8, memberId: "alex" };
    const bob = { t: "BO", discord: "bob", room: "B", bg: "#fff", fg: "#000", tables: 8, memberId: "bob" };
    n50[0][16] = [alex, alex];
    n50[0][17] = [bob];
    n100[0][16] = [alex];

    expect(deadTimeBreakdownsByMember([
      { variant: "nitro", limit: "50", grid: n50 },
      { variant: "nitro", limit: "100", grid: n100 },
    ], [rule(), rule({ id: "n100", limit: "100" })])).toEqual({
      alex: { byPair: { N50: 0.5, N100: 0.5 }, total: 0.5 },
      bob: { byPair: { N50: 0.5 }, total: 0.5 },
    });
  });
});
