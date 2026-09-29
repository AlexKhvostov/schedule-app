import { describe, expect, it } from "vitest";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { normalizeScheduleFilterLimits } from "./scheduleSettings";

describe("schedule filter limit normalization", () => {
  it("keeps valid catalog limits in their server order and removes duplicates", () => {
    expect(normalizeScheduleFilterLimits(["50", "25", "50", "unknown", 100])).toEqual(["50", "25"]);
  });

  it("falls back to every catalog limit for missing or unusable server data", () => {
    expect(normalizeScheduleFilterLimits(undefined)).toEqual(LIMIT_OPTIONS);
    expect(normalizeScheduleFilterLimits(["unknown"])).toEqual(LIMIT_OPTIONS);
  });
});
