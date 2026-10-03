import { describe, expect, it } from "vitest";
import { readCet } from "./cet";
import { visibleMonthDays } from "./displayRange";

const cet = (year: number, monthIndex: number, day: number) => ({ year, monthIndex, day });

describe("schedule display ranges", () => {
  it("builds forward day ranges and clips them at the end of the month", () => {
    expect(visibleMonthDays(2026, 8, "day", cet(2026, 8, 29))).toEqual([29]);
    expect(visibleMonthDays(2026, 8, "threeDays", cet(2026, 8, 29))).toEqual([29, 30]);
    expect(visibleMonthDays(2026, 8, "sevenDays", cet(2026, 8, 27))).toEqual([27, 28, 29, 30]);
  });

  it("uses the current Monday-to-Sunday week and clips month boundaries", () => {
    expect(visibleMonthDays(2026, 8, "week", cet(2026, 8, 30))).toEqual([28, 29, 30]);
    expect(visibleMonthDays(2026, 2, "week", cet(2026, 2, 1))).toEqual([1]);
    expect(visibleMonthDays(2026, 5, "week", cet(2026, 5, 1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns the full viewed month outside the current CET month, including a year change", () => {
    expect(visibleMonthDays(2026, 11, "day", cet(2027, 0, 1))).toHaveLength(31);
    expect(visibleMonthDays(2026, 9, "sevenDays", cet(2026, 8, 30))).toHaveLength(31);
    expect(visibleMonthDays(2024, 1, "month", cet(2024, 1, 29))).toHaveLength(29);
  });

  it("uses the CET calendar date around a UTC month boundary", () => {
    const stamp = readCet(new Date("2026-03-31T22:30:00.000Z"));
    expect(stamp).toMatchObject({ year: 2026, monthIndex: 3, day: 1 });
    expect(visibleMonthDays(2026, 2, "day", stamp)).toHaveLength(31);
    expect(visibleMonthDays(2026, 3, "day", stamp)).toEqual([1]);
  });
});
