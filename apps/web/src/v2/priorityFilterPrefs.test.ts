import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIORITY_DEFAULT_ROLE_ID } from "../schedule/priorities";
import { loadPriorityFilters, parsePriorityFilters, priorityFiltersStorageKey, savePriorityFilters } from "./priorityFilterPrefs";

afterEach(() => vi.unstubAllGlobals());
const defaults = { roleIds: [PRIORITY_DEFAULT_ROLE_ID], active: true, scheduleActive: false };

describe("saved priority filters", () => {
  it("defaults to active RedParty profiles for missing, malformed or wrong-shaped storage", () => {
    for (const raw of [null, "{", "null", "5", "[]", '"bad"']) expect(parsePriorityFilters(raw)).toEqual(defaults);
  });
  it("validates fields independently, deduplicates roles and keeps unavailable IDs removable", () => {
    expect(parsePriorityFilters(JSON.stringify({ roleIds: ["rp", 4, " rp ", null, "", "old-role"], active: "true", scheduleActive: true })))
      .toEqual({ roleIds: ["rp", "old-role"], active: true, scheduleActive: true });
    expect(parsePriorityFilters('{"roleIds":{},"active":true}')).toEqual({ ...defaults, active: true });
    expect(parsePriorityFilters('{"roleIds":[],"active":false}')).toEqual({ roleIds: [], active: false, scheduleActive: false });
  });
  it("stores roles and both booleans independently for accounts and environments", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const one = priorityFiltersStorageKey("one", "live");
    const two = priorityFiltersStorageKey("two", "live");
    const demo = priorityFiltersStorageKey("one", "demo");
    const selected = { roleIds: ["rp"], active: true, scheduleActive: true };
    savePriorityFilters(one, selected);
    expect(loadPriorityFilters(one)).toEqual(selected);
    expect(loadPriorityFilters(two)).toEqual(defaults);
    expect(loadPriorityFilters(demo)).toEqual(defaults);
    savePriorityFilters(two, { ...defaults, active: true });
    savePriorityFilters(one, defaults);
    expect(loadPriorityFilters(one)).toEqual(defaults);
    expect(loadPriorityFilters(two).active).toBe(true);
  });
  it("does not create a shared anonymous preference record", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });
    expect(priorityFiltersStorageKey(undefined, "demo")).toBeNull();
    savePriorityFilters(null, defaults);
    expect(loadPriorityFilters(null)).toEqual(defaults);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("survives unavailable storage, read failures and full storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadPriorityFilters("key")).toEqual(defaults);
    expect(() => savePriorityFilters("key", defaults)).not.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } });
    expect(loadPriorityFilters("key")).toEqual(defaults);
    expect(() => savePriorityFilters("key", defaults)).not.toThrow();
  });
});
