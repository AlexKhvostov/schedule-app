import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  SCHEDULE_PREFS_VERSION,
  normalizeScheduleKinds,
  normalizeSchedulePrefs,
  parseSchedulePrefs,
} from "./prefs";

describe("schedule preferences", () => {
  it("returns independent defaults for missing or damaged storage", () => {
    const missing = parseSchedulePrefs(null);
    const damaged = parseSchedulePrefs("{broken");

    expect(missing).toEqual(DEFAULT_PREFS);
    expect(damaged).toEqual(DEFAULT_PREFS);
    expect(missing.limits).not.toBe(DEFAULT_PREFS.limits);
    expect(missing.kinds).not.toBe(DEFAULT_PREFS.kinds);
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
      kinds: ["regular"],
      editPulse: false,
      showExtraTz: false,
      busyHint: true,
    });
  });

  it("normalizes one or two kinds in a stable order and never returns an empty selection", () => {
    expect(normalizeScheduleKinds(["regular", "nitro", "regular", "other"])).toEqual(["nitro", "regular"]);
    expect(normalizeScheduleKinds(["regular"])).toEqual(["regular"]);
    expect(normalizeScheduleKinds([])).toEqual(["nitro"]);
  });

  it("migrates the previous single-kind preference", () => {
    expect(normalizeSchedulePrefs({ version: 2, kind: "regular" }).kinds).toEqual(["regular"]);
    expect(normalizeSchedulePrefs({ version: 2, kind: "invalid" }).kinds).toEqual(["nitro"]);
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
