import { describe, expect, it } from "vitest";
import { defaultPointsFilters, filtersKey, matchesAudience, parsePlayerNames, validFilters } from "./pointsFilters";
import { clockLabel, madridDay, shiftDay, validDay } from "./time";
import { buildTimeline, timelineSpeed } from "./pointsTimeline";
import { initialPointsState, pointsReducer } from "../state/pointsState";
import type { PlayerSeries } from "../contracts/points";
import ru from "../locales/ru.json";
import en from "../locales/en.json";

describe("Points filters and screen state", () => {
  it("uses Madrid calendar dates, including month/year and DST boundaries", () => {
    expect(madridDay(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
    expect(madridDay(new Date("2026-06-05T22:30:00Z"))).toBe("2026-06-06");
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(validDay("2026-02-30")).toBe(false);
    expect(validDay("")).toBe(false);
    expect(defaultPointsFilters(new Date("2026-11-05T23:30:00Z")).day).toBe("2026-11-06");
  });
  it("normalizes names, keeps exact nicknames and ignores ordering for query equality", () => {
    expect(parsePlayerNames(" A ; B\nA,, C & / ")).toEqual(["A", "B", "C & /"]);
    const filters = defaultPointsFilters();
    expect(filtersKey({ ...filters, players: ["B", "A"] })).toBe(filtersKey({ ...filters, players: ["A", "B"] }));
    expect(validFilters({ ...filters, players: ["x".repeat(101)] })).toBe(false);
    expect(validFilters({ ...filters, players: Array.from({ length: 101 }, (_, i) => String(i)) })).toBe(false);
  });
  it("treats exclusions as complements and an empty positive regular group as empty", () => {
    const sides = ["ours", "theirs", null] as const;
    expect(sides.filter(side => matchesAudience(side, "ours"))).toEqual(["ours"]);
    expect(sides.filter(side => matchesAudience(side, "not_ours"))).toEqual(["theirs", null]);
    expect(sides.filter(side => matchesAudience(side, "not_theirs"))).toEqual(["ours", null]);
    expect(sides.filter(side => matchesAudience(side, "regs"))).toEqual(["ours", "theirs"]);
    expect(sides.filter(side => matchesAudience(side, "nonregs"))).toEqual([null]);
    expect(matchesAudience(null, "ours")).toBe(false);
  });
  it("does not apply drafts or reapply identical filters; reset updates all controls coherently", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    let state = initialPointsState(now);
    const applied = state.applied;
    state = pointsReducer(state, { type: "edit", value: { day: "2026-11-04", limit: "16-25" } });
    state = pointsReducer(state, { type: "players", value: "Demo 02, Demo 01" });
    expect(state.applied).toBe(applied);
    state = pointsReducer(state, { type: "controls", value: { top: "all", sort: "speed" } });
    expect(state.applied).toBe(applied);
    state = pointsReducer(state, { type: "apply" });
    expect(state.applied.players).toEqual(["Demo 01", "Demo 02"]);
    expect(state.applied.limit).toBe("16-25");
    expect(pointsReducer(state, { type: "apply" })).toBe(state);
    state = pointsReducer(state, { type: "reset", now });
    expect(state.applied).toEqual(defaultPointsFilters(now));
    expect(state.controls).toEqual({ top: "10", sort: "points" });
    expect(state.playersText).toBe("");
  });
  it("gives returning selections a new request identity, while draft rollback does not refetch", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    let state = initialPointsState(now);
    state = pointsReducer(state, { type: "edit", value: { limit: "100" } });
    state = pointsReducer(state, { type: "apply" });
    const second = state.revision;
    state = pointsReducer(state, { type: "reset", now });
    expect(state.revision).toBeGreaterThan(second);
    const revision = state.revision;
    state = pointsReducer(state, { type: "players", value: "Demo 01" });
    state = pointsReducer(state, { type: "reset", now });
    expect(state.revision).toBe(revision);
  });
  it("does not apply an invalid date or name list", () => {
    const state = pointsReducer(initialPointsState(), { type: "edit", value: { day: "2026-02-30" } });
    expect(pointsReducer(state, { type: "apply" })).toBe(state);
  });
  it("has matching translation paths in both languages", () => {
    const keys = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === "object" ? keys(item, `${prefix}${key}.`) : [`${prefix}${key}`]);
    expect(keys(ru).sort()).toEqual(keys(en).sort());
  });
});

describe("Reference-compatible six-minute timeline", () => {
  it("keeps MAX within the bucket, preserves zero, isolates day/limit and carries only after first sample", () => {
    const series: PlayerSeries[] = [{ name: "Synthetic", points: [
      { at: "2026-11-05 05:00:00", points: 0, limit: "50" },
      { at: "2026-11-05T05:06:00Z", points: 5, limit: "50" },
      { at: "2026-11-05T05:08:00Z", points: 9, limit: "50" },
      { at: "2026-11-04T05:08:00Z", points: 999, limit: "50" },
      { at: "2026-11-05T05:09:00Z", points: 999, limit: "100" },
    ] }];
    const values = buildTimeline(series, "2026-11-05", "50", new Date("2026-11-05T05:12:00Z"))[0].values;
    expect(values).toHaveLength(240);
    expect(values[59].value).toBeNull();
    expect(values[60].value).toBe(0);
    expect(values[61].value).toBe(9);
    expect(values[62].value).toBe(9);
    expect(values[63].value).toBeNull();
  });
  it("continues the last known value through missing samples like the reference", () => {
    const values = buildTimeline([{ name: "Synthetic", points: [{ at: "2026-11-05T04:54:00Z", points: 20, limit: "50" }] }], "2026-11-05", "50", new Date("2026-11-06T12:00:00Z"))[0].values;
    expect(values[59].value).toBe(20);
    expect(values[60].value).toBe(20);
    expect(values[69].value).toBe(20);
    expect(values[70].value).toBe(20);
  });
  it("keeps legacy 24-hour wall-clock buckets during the repeated DST hour", () => {
    const values = buildTimeline([{ name: "Synthetic", points: [
      { at: "2026-10-25T00:06:00Z", points: 10, limit: "50" },
      { at: "2026-10-25T01:06:00Z", points: 15, limit: "50" },
    ] }], "2026-10-25", "50", new Date("2026-10-26T00:00:00Z"))[0].values;
    expect(values[21].value).toBe(15);
    expect(values).toHaveLength(240);
    expect(clockLabel(1440)).toBe("24:00");
  });
  it("retains the reference speed preference and missing-window behaviour", () => {
    const values = Array.from({ length: 12 }, (_, i) => ({ minute: i * 6, value: i * 3 }));
    expect(timelineSpeed(values, 5)).toBe(30);
    expect(timelineSpeed(values, 2)).toBeNull();
  });
});
