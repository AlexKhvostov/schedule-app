import { describe, expect, it } from "vitest";
import { formatVariantLimit } from "./capacity";

describe("schedule variant labels", () => {
  it("uses N for Nitro and E for Regular without the cash-game NL prefix", () => {
    expect(formatVariantLimit("nitro", "50")).toBe("N50");
    expect(formatVariantLimit("regular", "100")).toBe("E100");
  });
});
