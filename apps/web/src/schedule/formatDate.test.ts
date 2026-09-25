import { describe, expect, it } from "vitest";
import { formatDayLong, monthName, monthTitle, weekdayLabelsMonFirst } from "./formatDate";

describe("localized schedule labels", () => {
  it("formats Russian month forms", () => {
    expect(monthName(0, "ru", "long")).toBe("январь");
    expect(monthName(0, "ru", "gen")).toBe("января");
    expect(monthTitle(2026, 0, "ru")).toBe("Январь 2026");
  });

  it("formats English labels", () => {
    expect(monthTitle(2026, 8, "en")).toBe("September 2026");
    expect(formatDayLong(2026, 8, 24, "en")).toBe("Thursday, 24 September");
  });

  it("starts weekday headers on Monday", () => {
    expect(weekdayLabelsMonFirst("en")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});
