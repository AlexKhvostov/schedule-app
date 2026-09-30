import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTablePresetSelection, resolveTablePresetSelection, saveTablePresetSelection } from "./tablePresetSelection";

afterEach(() => vi.unstubAllGlobals());

describe("table preset selection", () => {
  it("keeps an existing local selection", () => {
    expect(resolveTablePresetSelection([10, 8, 6], 10, 6)).toEqual({ values: [10, 8, 6], active: 6 });
  });

  it("falls back to the compatible active value and then the first preset", () => {
    expect(resolveTablePresetSelection([10, 8, 6], 8, 12)).toEqual({ values: [10, 8, 6], active: 8 });
    expect(resolveTablePresetSelection([10, 8, 6], 12, 12)).toEqual({ values: [10, 8, 6], active: 10 });
  });

  it("normalizes a missing or damaged preset list", () => {
    expect(resolveTablePresetSelection([8, 8, 0, 6], 11, 0)).toEqual({ values: [8, 6], active: 8 });
    expect(resolveTablePresetSelection([], 35, 35)).toEqual({ values: [30], active: 30 });
  });

  it("stores the last choice per member and ignores a removed value", () => {
    const rows = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => rows.set(key, value),
    });

    saveTablePresetSelection("one", 6);
    saveTablePresetSelection("two", 12);
    expect(loadTablePresetSelection("one", [10, 8, 6], 10).active).toBe(6);
    expect(loadTablePresetSelection("two", [12, 9], 12).active).toBe(12);
    expect(loadTablePresetSelection("one", [10, 8], 10).active).toBe(10);
  });
});
