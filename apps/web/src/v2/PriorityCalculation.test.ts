import { describe, expect, it } from "vitest";
import { priorityNumber, priorityPoints } from "./PriorityCalculation";

describe("priority point formatting", () => {
  it("keeps exactly one decimal for zero, whole and half points in Russian", () => {
    expect([0, 125, 125.5].map((value) => priorityPoints(value, "ru"))).toEqual(["0,0", "125,0", "125,5"]);
  });
  it("uses the English decimal separator with the same precision", () => {
    expect([0, 125, 125.5].map((value) => priorityPoints(value, "en"))).toEqual(["0.0", "125.0", "125.5"]);
  });
  it("preserves grouping and the separate integer/coefficient format", () => {
    expect(priorityPoints(12345, "ru")).toBe("12\u00a0345,0");
    expect(priorityPoints(12345, "en")).toBe("12,345.0");
    expect([0, 125, 0.5, 1].map((value) => priorityNumber(value, "ru"))).toEqual(["0", "125", "0,5", "1"]);
  });
});
