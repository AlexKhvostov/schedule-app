import { describe, expect, it } from "vitest";
import {
  MOBILE_EDIT_PERCENT_MIN,
  clampScheduleCellWidth,
  fitScheduleCellWidth,
  scheduleZoomCanEdit,
  scheduleZoomScrollLeft,
  stepScheduleCellWidth,
} from "./scheduleZoom";

describe("schedule mobile zoom", () => {
  it("fits all 48 half-hours into a narrow viewport", () => {
    expect(fitScheduleCellWidth(390)).toBeCloseTo(304 / (48 + 47 * 0.15));
  });

  it("keeps the cell width inside supported bounds", () => {
    expect(clampScheduleCellWidth(-10)).toBe(3);
    expect(clampScheduleCellWidth(100)).toBe(32);
  });

  it("only enables editing at a touch-safe zoom", () => {
    expect(MOBILE_EDIT_PERCENT_MIN).toBe(75);
    expect(scheduleZoomCanEdit(14.89)).toBe(false);
    expect(scheduleZoomCanEdit(14.91)).toBe(true);
  });

  it("keeps the pinch focal point aligned with the measured fixed column", () => {
    expect(scheduleZoomScrollLeft(12, 10, 86, 120)).toBeCloseTo(104);
    expect(scheduleZoomScrollLeft(1, 3, 70, 100)).toBe(0);
  });

  it("steps fractional fit zoom to round ten-percent values", () => {
    expect(stepScheduleCellWidth(15.8, 1)).toBe(16);
    expect(stepScheduleCellWidth(17.8, 1)).toBe(18);
    expect(stepScheduleCellWidth(19.8, 1)).toBe(20);
    expect(stepScheduleCellWidth(19.8, -1)).toBe(18);
  });

  it("keeps the fit zoom as a reversible step between round percentages", () => {
    const fit = 5.2;
    expect(stepScheduleCellWidth(fit, 1, fit)).toBe(6);
    expect(stepScheduleCellWidth(6, -1, fit)).toBe(fit);
    expect(stepScheduleCellWidth(fit, -1, fit)).toBe(4);
    expect(stepScheduleCellWidth(4, 1, fit)).toBe(fit);
  });

  it("steps down through percentages above 100 without sticking at 110", () => {
    expect(stepScheduleCellWidth(26, -1)).toBe(24);
    expect(stepScheduleCellWidth(24, -1)).toBe(22);
    expect(stepScheduleCellWidth(22, -1)).toBe(20);
  });
});
