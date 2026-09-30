import { describe, expect, it } from "vitest";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { clubGridSettingsFromRow, normalizeScheduleFilterLimits, toggleScheduleFilterLimit } from "./scheduleSettings";

describe("schedule filter limit normalization", () => {
  it("keeps valid catalog limits in their server order and removes duplicates", () => {
    expect(normalizeScheduleFilterLimits(["50", "25", "50", "unknown", 100])).toEqual(["50", "25"]);
  });

  it("falls back to every catalog limit for missing or unusable server data", () => {
    expect(normalizeScheduleFilterLimits(undefined)).toEqual(LIMIT_OPTIONS);
    expect(normalizeScheduleFilterLimits(["unknown"])).toEqual(LIMIT_OPTIONS);
  });
});

describe("schedule settings adapter", () => {
  it("keeps adjacent-slot merging off for old or missing rows", () => {
    expect(clubGridSettingsFromRow(null).mergeAdjacentSlots).toBe(false);
    expect(clubGridSettingsFromRow({}).mergeAdjacentSlots).toBe(false);
  });

  it("reads the persisted adjacent-slot flag", () => {
    expect(clubGridSettingsFromRow({ merge_adjacent_slots: true }).mergeAdjacentSlots).toBe(true);
  });
});

describe("schedule filter limit selection", () => {
  const initial = { nitro: ["50", "100"], regular: ["25"] };

  it("changes Nitro and Regular independently and keeps catalog order", () => {
    expect(toggleScheduleFilterLimit(initial, "nitro", "25")).toEqual({
      nitro: ["25", "50", "100"],
      regular: ["25"],
    });
    expect(toggleScheduleFilterLimit(initial, "nitro", "50")).toEqual({
      nitro: ["100"],
      regular: ["25"],
    });
  });

  it("does not allow the last limit of a variant to be removed", () => {
    expect(toggleScheduleFilterLimit(initial, "regular", "25")).toBe(initial);
  });
});
