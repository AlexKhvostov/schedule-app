import { describe, expect, it, vi } from "vitest";
import { emptyMonth } from "../schedule/plan";
import {
  gridsForVariant,
  loadMultiMonthGrids,
  monthGridKey,
  replaceVariantGrids,
  type MonthGridsResult,
  type ScheduleVariant,
} from "./slots";

describe("multi-variant month grids", () => {
  it("uses unambiguous variant and limit keys", () => {
    const nitro = emptyMonth(2026, 8);
    const regular = emptyMonth(2026, 8);
    const store = replaceVariantGrids(
      replaceVariantGrids({}, "nitro", { "50": nitro }),
      "regular",
      { "50": regular },
    );

    expect(monthGridKey("nitro", "50")).toBe("nitro:50");
    expect(store["nitro:50"]).toBe(nitro);
    expect(store["regular:50"]).toBe(regular);
    expect(gridsForVariant(store, "nitro", ["50"])).toEqual({ "50": nitro });
    expect(gridsForVariant(store, "regular", ["50"])).toEqual({ "50": regular });
  });

  it("loads each selected variant exactly once and keeps their data separate", async () => {
    const calls: ScheduleVariant[] = [];
    const loader = vi.fn(async (_year: number, _month: number, variant: ScheduleVariant): Promise<MonthGridsResult> => {
      calls.push(variant);
      return { grids: { "50": emptyMonth(variant === "nitro" ? 2026 : 2027, 8) } };
    });

    const result = await loadMultiMonthGrids(2026, 8, ["regular", "nitro", "regular"], ["50"], loader);

    expect(calls).toEqual(["regular", "nitro"]);
    expect(result.loaded).toEqual(["regular", "nitro"]);
    expect(result.errors).toEqual({});
    expect(result.grids["regular:50"]).not.toBe(result.grids["nitro:50"]);
  });

  it("reports one failed variant without presenting it as an empty successful grid", async () => {
    const loader = vi.fn(async (_year: number, _month: number, variant: ScheduleVariant): Promise<MonthGridsResult> =>
      variant === "nitro"
        ? { grids: { "50": emptyMonth(2026, 8) } }
        : { grids: { "50": emptyMonth(2026, 8) }, error: "regular unavailable" },
    );

    const result = await loadMultiMonthGrids(2026, 8, ["nitro", "regular"], ["50"], loader);

    expect(result.loaded).toEqual(["nitro"]);
    expect(result.errors).toEqual({ regular: "regular unavailable" });
    expect(result.grids["nitro:50"]).toBeDefined();
    expect(result.grids["regular:50"]).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
