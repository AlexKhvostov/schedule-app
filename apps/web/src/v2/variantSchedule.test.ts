import { describe, expect, it } from "vitest";
import { emptyMonth } from "../schedule/plan";
import { gridsByVariantLabel, schedulePairRows, variantGridItems } from "./variantSchedule";

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

describe("schedule filter pairs", () => {
  it("keeps enabled pairs independent and restores an occupied disabled pair", () => {
    const nitro50 = emptyMonth(2026, 8);
    const nitro100 = emptyMonth(2026, 8);
    nitro100[0][0][0] = { t: "AA", discord: "Alex", room: "Player", bg: "#000", fg: "#fff", tables: 1 };
    expect(schedulePairRows(
      { nitro: ["50"], regular: ["100"] },
      ["nitro", "regular"],
      ["50", "100"],
      { "nitro:50": nitro50, "nitro:100": nitro100, "regular:50": emptyMonth(2026, 8), "regular:100": emptyMonth(2026, 8) },
    )).toEqual([
      { variant: "nitro", limit: "50", disabled: false },
      { variant: "nitro", limit: "100", disabled: true },
      { variant: "regular", limit: "100", disabled: false },
    ]);
  });
});
