import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMIT_OPTIONS, applyHours, defaultCapacity, hoursOf, lanesForDay, loadCapacity, resetLimit, saveCapacity, setEqualize, setRuleFlags, slotsOf } from "./capacity";
import { columnFill, fieldFill } from "./analytics";
import { shownLevels } from "./plan";
import { readCet } from "./cet";

afterEach(() => vi.unstubAllGlobals());
const hours = (n: number) => Array(24).fill(n) as number[];
const mark = { discord: "QA", room: "", t: "QA", bg: "#000000", fg: "#ffffff", tables: 1 };

describe("capacity rules for every tournament pair", () => {
  it.each(LIMIT_OPTIONS)("keeps Nitro and Regular %s independent through Demo save/reload", limit => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    const nitro = applyHours(defaultCapacity(), limit, hours(2), "month", [5]);
    const regular = applyHours(defaultCapacity(), limit, hours(4), "month", [5]);
    saveCapacity(nitro, "nitro"); saveCapacity(regular, "regular");
    expect(slotsOf(hoursOf(loadCapacity("nitro"), limit, 5))).toBe(96);
    expect(slotsOf(hoursOf(loadCapacity("regular"), limit, 5))).toBe(192);
    saveCapacity(resetLimit(regular, limit), "regular");
    expect(slotsOf(hoursOf(loadCapacity("regular"), limit, 5))).toBe(48);
    expect(slotsOf(hoursOf(loadCapacity("nitro"), limit, 5))).toBe(96);
  });

  it("combines enabled week/month rules per hour and retains disabled overrides", () => {
    let map = applyHours(defaultCapacity(), "50", hours(4), "month", [5]);
    const week = hours(2); week[10] = 6;
    map = applyHours(map, "50", week, "week", [4]);
    const combined = hoursOf(map, "50", 5, 4);
    expect(combined[9]).toBe(2); expect(combined[10]).toBe(4);
    expect(slotsOf(combined)).toBe(100);
    expect(hoursOf(setRuleFlags(map, "50", { weekOn: false, monthOn: true }), "50", 5, 4)).toEqual(hours(4));
    const disabled = setRuleFlags(map, "50", { weekOn: false, monthOn: false });
    expect(hoursOf(disabled, "50", 5, 4)).toEqual(hours(1));
    expect(disabled["50"].weekdays["4"]).toEqual(week);
  });

  it("equalization adds ghost lanes without extra available slots", () => {
    const map = setEqualize(applyHours(defaultCapacity(), "50", hours(6), "month", [6]), "50", true);
    expect(lanesForDay(map, "50", 5, 2026, 10)).toBe(6);
    expect(slotsOf(hoursOf(map, "50", 5, 4))).toBe(48);
    expect(shownLevels(6, hours(1))).toEqual(Array.from({ length: 6 }, (_, level) => ({ level, ghost: level > 0 })));
  });

  it("keeps marks above reduced capacity visible without counting them as open seats", () => {
    const row = Array.from({ length: 48 }, () => [null, null, null, null, null, null] as (typeof mark | null)[]);
    row[20][5] = mark;
    expect(shownLevels(1, hours(1), row)).toHaveLength(6);
    expect(shownLevels(1, hours(1), row)[5]).toEqual({ level: 5, ghost: false });
    expect(shownLevels(1, hours(1), Array.from({ length: 48 }, () => Array(6).fill(null)))).toHaveLength(1);
    expect(fieldFill([row], 2026, 10, readCet(new Date("2026-11-01T00:00:00Z")), "50", undefined, defaultCapacity())).toMatchObject({ seats: 48, taken: 0 });
    expect(columnFill({ "50": [row] }, ["50"], defaultCapacity(), 2026, 10)[20]).toBe(0);
  });
});
