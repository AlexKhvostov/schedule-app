import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_HOURS,
  clampWorkRangeHalf,
  normalizeWorkHours,
  visibleWorkRuns,
  workGapBefore,
  workHalfSlots,
  workHourSegments,
  workTrackProgress,
} from "./workHours";

describe("working-hour display selection", () => {
  it("keeps sorted unique hours and expands each one to two half-hours", () => {
    expect(normalizeWorkHours([18, 0, 1, 18, 23])).toEqual([0, 1, 18, 23]);
    expect(workHalfSlots([0, 1, 18, 23])).toEqual([0, 1, 2, 3, 36, 37, 46, 47]);
  });

  it("falls back to the full day for an empty or invalid selection", () => {
    expect(normalizeWorkHours([])).toEqual(DEFAULT_WORK_HOURS);
    expect(normalizeWorkHours([24, -1, 1.5])).toEqual(DEFAULT_WORK_HOURS);
  });

  it("migrates a legacy half-hour range without hiding a previously visible half-hour", () => {
    expect(normalizeWorkHours(undefined, 17, 36)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(normalizeWorkHours(undefined, 36, 17)).toEqual(DEFAULT_WORK_HOURS);
  });

  it("builds compressed headings and current-time progress", () => {
    expect(workHourSegments([0, 1, 18])).toEqual([
      { hour: 0, startHalf: 0, span: 2, visibleStart: 0 },
      { hour: 1, startHalf: 2, span: 2, visibleStart: 2 },
      { hour: 18, startHalf: 36, span: 2, visibleStart: 4 },
    ]);
    expect(workTrackProgress(2, 0.5, [0, 1, 18])).toBe(2.5 / 6);
    expect(workTrackProgress(20, 0, [0, 1, 18])).toBeNull();
  });

  it("splits a shift around hidden hours and preserves compressed positions", () => {
    expect(visibleWorkRuns(1, 38, [0, 1, 18, 19])).toEqual([
      { start: 1, end: 4, visibleStart: 1, span: 3 },
      { start: 36, end: 38, visibleStart: 4, span: 2 },
    ]);
    expect(visibleWorkRuns(8, 12, [0, 1, 18])).toEqual([]);
  });

  it("marks a visual gap and stops a dragged range at its edge", () => {
    const visible = workHalfSlots([7, 9]);
    expect(workGapBefore(visible, 18)).toBe(true);
    expect(workGapBefore(visible, 19)).toBe(false);
    expect(clampWorkRangeHalf(15, 18, [7, 9])).toBe(15);
    expect(clampWorkRangeHalf(18, 15, [7, 9])).toBe(18);
    expect(clampWorkRangeHalf(18, 19, [7, 9])).toBe(19);
  });
});
