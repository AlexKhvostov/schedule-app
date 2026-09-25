import { describe, expect, it } from "vitest";
import {
  clampUtcOffset,
  hourOffsetFromUtc,
  isNowSlot,
  isPastDay,
  isPastSlot,
  readCet,
  utcLabel,
} from "./cet";

describe("CET schedule time", () => {
  it("clamps configured UTC offsets", () => {
    expect(clampUtcOffset(-99)).toBe(-12);
    expect(clampUtcOffset(99)).toBe(14);
    expect(clampUtcOffset(2.6)).toBe(3);
    expect(clampUtcOffset(Number.NaN)).toBe(3);
    expect(utcLabel(0)).toBe("UTC±0");
    expect(utcLabel(3)).toBe("UTC+3");
  });

  it("accounts for Madrid daylight saving time", () => {
    expect(hourOffsetFromUtc(3, new Date("2026-01-15T12:00:00Z"))).toBe(2);
    expect(hourOffsetFromUtc(3, new Date("2026-07-15T12:00:00Z"))).toBe(1);
  });

  it("maps an instant to its half-hour CET slot", () => {
    const stamp = readCet(new Date("2026-01-15T12:45:30Z"));
    expect(stamp).toMatchObject({ year: 2026, monthIndex: 0, day: 15, hour: 13, half: 27 });
    expect(stamp.slotProgress).toBeCloseTo(15.5 / 30);
  });

  it("distinguishes past, current and future slots", () => {
    const stamp = readCet(new Date("2026-01-15T12:45:30Z"));
    expect(isPastDay(2026, 0, 14, stamp)).toBe(true);
    expect(isPastSlot(2026, 0, 15, 26, stamp)).toBe(true);
    expect(isPastSlot(2026, 0, 15, 27, stamp)).toBe(false);
    expect(isNowSlot(2026, 0, 15, 27, stamp)).toBe(true);
  });
});
