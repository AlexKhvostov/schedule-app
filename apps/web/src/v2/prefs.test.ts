import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, SCHEDULE_PREFS_VERSION, normalizeSchedulePrefs, parseSchedulePrefs } from "./prefs";

describe("schedule preferences", () => {
  it("returns independent defaults for missing or damaged storage", () => {
    const missing = parseSchedulePrefs(null);
    const damaged = parseSchedulePrefs("{broken");

    expect(missing).toEqual(DEFAULT_PREFS);
    expect(damaged).toEqual(DEFAULT_PREFS);
    expect(missing.limits).not.toBe(DEFAULT_PREFS.limits);
  });

  it("migrates the legacy unversioned shape and validates every field", () => {
    expect(normalizeSchedulePrefs({
      limits: ["100", "50", "50", "invalid", 25],
      kind: "regular",
      month: "pin",
      pin: "2025-01",
      editPulse: false,
      showExtraTz: false,
      busyHint: true,
    })).toEqual({
      ...DEFAULT_PREFS,
      version: SCHEDULE_PREFS_VERSION,
      limits: ["50", "100"],
      kind: "regular",
      editPulse: false,
      showExtraTz: false,
      busyHint: true,
    });
  });

  it("keeps valid display flags and replaces invalid values", () => {
    const prefs = normalizeSchedulePrefs({
      version: 999,
      limits: [],
      dimPast: false,
      hidePastDays: true,
      hideTables: true,
      showTip: false,
      editPulse: "no",
    });

    expect(prefs).toMatchObject({
      version: SCHEDULE_PREFS_VERSION,
      limits: ["50"],
      dimPast: false,
      hidePastDays: true,
      hideTables: true,
      showTip: false,
      editPulse: true,
    });
  });
});
