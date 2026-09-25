import { describe, expect, it } from "vitest";
import { demoMonthPlan } from "./demoPlan";

describe("demoMonthPlan", () => {
  it("creates deterministic local marks without changing the month shape", () => {
    const first = demoMonthPlan(2026, 8, "nitro", "50");
    const second = demoMonthPlan(2026, 8, "nitro", "50");
    const marks = first.flat(2).filter(Boolean);

    expect(first).toHaveLength(30);
    expect(first.every((day) => day.length === 48)).toBe(true);
    expect(marks.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});
