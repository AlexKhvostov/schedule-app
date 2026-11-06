import { afterEach, describe, expect, it, vi } from "vitest";
import { distanceFiltersStorageKey, loadDistanceFilters, parseDistanceFilters, saveDistanceFilters } from "./distanceFilterPrefs";

afterEach(() => vi.unstubAllGlobals());
const defaults = parseDistanceFilters(null);

describe("distance filter preferences", () => {
  it("recovers invalid storage and validates every field without disabling both kinds", () => {
    for (const raw of [null, "{", "[]", "4", '"text"']) expect(parseDistanceFilters(raw)).toEqual(defaults);
    expect(parseDistanceFilters(JSON.stringify({ monthStart: "2026-13-01", roomSlug: [], query: 1,
      showNitro: false, showRegular: false, sort: "wrong", idFilter: "other", presenceFilter: "other",
      onlyRedParty: "true", hiddenLimits: ["0.50", "250", "250", 500, "no"] })))
      .toEqual({ ...defaults, hiddenLimits: ["0.50", "250"] });
  });
  it("restores all filters and hidden columns separately for accounts and environments", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const one = distanceFiltersStorageKey("one", "live"), two = distanceFiltersStorageKey("two", "live");
    const selected = { ...defaults, monthStart: "2026-10-01", roomSlug: "pokerstars", query: "211", showRegular: false,
      onlyRedParty: true, onlyActiveProfiles: true, idFilter: "set" as const, presenceFilter: "with" as const,
      sort: "distanceId" as const, hiddenLimits: ["10", "500"] };
    saveDistanceFilters(one, selected);
    expect(loadDistanceFilters(one)).toEqual(selected);
    expect(loadDistanceFilters(two)).toEqual(defaults);
    expect(loadDistanceFilters(distanceFiltersStorageKey("one", "demo"))).toEqual(defaults);
    saveDistanceFilters(two, { ...defaults, query: "other" });
    expect(loadDistanceFilters(one)).toEqual(selected);
  });
  it("does not save anonymously and survives storage denial", () => {
    const setItem = vi.fn(); vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });
    expect(distanceFiltersStorageKey(undefined, "demo")).toBeNull();
    saveDistanceFilters(null, defaults); expect(setItem).not.toHaveBeenCalled();
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("quota"); } });
    expect(loadDistanceFilters("key")).toEqual(defaults);
    expect(() => saveDistanceFilters("key", defaults)).not.toThrow();
  });
});
