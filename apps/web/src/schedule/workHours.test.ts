import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_HOURS,
  clipWorkRun,
  halfTimeLabel,
  normalizeWorkHours,
  workHalfSlots,
  workHourSegments,
  workTrackProgress,
} from "./workHours";

describe("working-time display range", () => {
  it("keeps a valid same-day half-hour range", () => {
    expect(normalizeWorkHours(17, 36)).toEqual({ startHalf: 17, endHalf: 36 });
    expect(workHalfSlots(17, 36)).toHaveLength(19);
    expect(workHalfSlots(17, 36)).toEqual(expect.arrayContaining([17, 35]));
  });

  it("accepts the full day and formats its boundaries", () => {
    expect(normalizeWorkHours(0, 48)).toEqual(DEFAULT_WORK_HOURS);
    expect(halfTimeLabel(0)).toBe("00:00");
    expect(halfTimeLabel(17)).toBe("08:30");
    expect(halfTimeLabel(48)).toBe("24:00");
  });

  it("rejects reversed, empty, fractional, and out-of-day ranges", () => {
    expect(normalizeWorkHours(36, 17)).toEqual(DEFAULT_WORK_HOURS);
    expect(normalizeWorkHours(17, 17)).toEqual(DEFAULT_WORK_HOURS);
    expect(normalizeWorkHours(17.5, 36)).toEqual(DEFAULT_WORK_HOURS);
    expect(normalizeWorkHours(-1, 36)).toEqual(DEFAULT_WORK_HOURS);
    expect(normalizeWorkHours(17, 49)).toEqual(DEFAULT_WORK_HOURS);
  });

  it("builds clipped hour headings and current-time progress", () => {
    expect(workHourSegments(17, 36)).toEqual([
      { hour: 8, startHalf: 17, span: 1 },
      ...Array.from({ length: 9 }, (_, index) => ({ hour: 9 + index, startHalf: 18 + index * 2, span: 2 })),
    ]);
    expect(workTrackProgress(17, 0, 17, 36)).toBe(0);
    expect(workTrackProgress(26, 0.5, 17, 36)).toBe(0.5);
    expect(workTrackProgress(8, 0, 17, 36)).toBeNull();
  });

  it("clips runs without changing their source coordinates", () => {
    expect(clipWorkRun(16, 20, 17, 36)).toEqual({ start: 17, end: 20 });
    expect(clipWorkRun(36, 40, 17, 36)).toBeNull();
  });
});
