import { describe, expect, it } from "vitest";
import { emptyMonth } from "../schedule/plan";
import { gridsByVariantLabel, variantGridItems } from "./variantSchedule";

describe("variant schedule projection", () => {
  it("keeps Nitro and Regular of the same limit separate", () => {
    const nitro = emptyMonth(2026, 8);
    const regular = emptyMonth(2026, 8);
    const items = variantGridItems(
      { "nitro:50": nitro, "regular:50": regular },
      ["nitro", "regular"],
      ["50"],
    );

    expect(items.map((item) => item.label)).toEqual(["N50", "E50"]);
    expect(gridsByVariantLabel(items)).toEqual({ N50: nitro, E50: regular });
  });
});
