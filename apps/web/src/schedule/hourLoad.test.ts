import { describe, expect, it } from "vitest";
import { emptyLoadRow, hourLoadKey, hourLoadSegments, isHourLoadMap, isHourLoadRow, legacyLoadRow, sameLoadRow, validLoadKey } from "./hourLoad";

describe("hour load by tournament kind and limit", () => {
  it("validates keys and only 24 known tone IDs (never CSS)", () => {
    expect(hourLoadKey("regular", "50")).toBe("regular:50");
    expect(validLoadKey("nitro:50")).toBe(true);
    for (const key of ["50", "nitro:50:", "other:50", "nitro:51", "nitro:050"]) expect(validLoadKey(key)).toBe(false);
    expect(isHourLoadMap({ "nitro:50": emptyLoadRow() })).toBe(true);
    for (const value of [null, [], { "50": emptyLoadRow() }, { "nitro:50": ["peach"] }]) expect(isHourLoadMap(value)).toBe(false);
    expect(isHourLoadRow(Array(24).fill("rgba(250,196,150,.22)"))).toBe(false);
  });
  it("never aliases rows or leaks the same limit across tournament kinds", () => {
    const nitro = emptyLoadRow();
    const regular = emptyLoadRow();
    nitro[3] = "peach";
    expect(regular[3]).toBeNull();
    expect(sameLoadRow(nitro, regular)).toBe(false);
    expect(sameLoadRow(nitro, nitro.slice())).toBe(true);
  });
  it("merges adjacent colors but splits at hidden hours and missing capacity", () => {
    const row = emptyLoadRow();
    row[2] = row[3] = row[4] = "peach";
    row[5] = "lemon";
    expect(hourLoadSegments(row, [4,5,6,7,8,9,10,11])).toEqual([
      { startHalf: 4, endHalf: 10, tone: "peach" }, { startHalf: 10, endHalf: 12, tone: "lemon" },
    ]);
    expect(hourLoadSegments(row, [4,5,8,9], (half) => half !== 9)).toEqual([
      { startHalf: 4, endHalf: 6, tone: "peach" }, { startHalf: 8, endHalf: 9, tone: "peach" },
    ]);
    expect(hourLoadSegments(undefined, [4,5])).toEqual([]);
  });
  it("imports legacy RGB colors without copying unknown CSS or selecting a kind", () => {
    expect(legacyLoadRow({ "50": ["rgba(250, 196, 150, 0.14)", "url(bad)"] }, "50")?.slice(0,2)).toEqual(["peach", null]);
    expect(legacyLoadRow({ "50": ["red"] }, "50")).toBeNull();
    expect(legacyLoadRow({ "50": ["rgba(250, 196, 150, 0.22)"] }, "100")).toBeNull();
  });
});
