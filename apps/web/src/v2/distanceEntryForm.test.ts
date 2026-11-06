import { describe, expect, it } from "vitest";
import { readDistanceValues } from "./distanceEntryForm";

describe("distance editor numbers", () => {
  it("accepts empty cells, zero and grouped numbers without rounding", () => {
    expect(readDistanceValues({ "5": "", "10": "12 467", "25": "3\u00a0021", "50": "0" }))
      .toEqual({ numeric: { "5": 0, "10": 12467, "25": 3021, "50": 0 }, invalid: [], total: 15488, filled: 2 });
  });
  it("rejects negatives, fractions, exponent notation and database integer overflow", () => {
    expect(readDistanceValues({ "1": "-1", "2": "1.5", "5": "1e3", "10": "2147483648", "25": "abc", "50": "2147483647" }))
      .toEqual({ numeric: { "50": 2147483647 }, invalid: ["1", "2", "5", "10", "25"], total: 2147483647, filled: 1 });
  });
});
