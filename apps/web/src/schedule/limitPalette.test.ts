import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT_PALETTE, PALETTE_BACKGROUNDS, PALETTE_LIMITS, isLimitPalette, normalizeLimitPalette, paletteContrast, paletteCssVars, palettePaint, sameLimitPalette } from "./limitPalette";

describe("club limit palette", () => {
  it("accepts exactly six complete color pairs, never arbitrary CSS", () => {
    expect(isLimitPalette(DEFAULT_LIMIT_PALETTE)).toBe(true);
    for (const bad of [null, [], {}, { ...DEFAULT_LIMIT_PALETTE, "999": DEFAULT_LIMIT_PALETTE["50"] },
      { ...DEFAULT_LIMIT_PALETTE, "50": { light: "red", dark: "#000000" } },
      { ...DEFAULT_LIMIT_PALETTE, "25": { light: "#abc", dark: "#000000" } },
      { ...DEFAULT_LIMIT_PALETTE, "25": { light: "#ffffff", dark: "var(--primary)" } },
      { ...DEFAULT_LIMIT_PALETTE, "100": null }]) expect(isLimitPalette(bad)).toBe(false);
  });
  it("normalizes case, clones defaults and recovers from corrupt persisted settings", () => {
    const next = normalizeLimitPalette({ ...DEFAULT_LIMIT_PALETTE, "50": { light: "#ABCDEF", dark: "#FEDCBA" } });
    expect(next["50"]).toEqual({ light: "#abcdef", dark: "#fedcba" });
    const fallback = normalizeLimitPalette({ broken: true });
    fallback["50"].dark = "#123456";
    expect(DEFAULT_LIMIT_PALETTE["50"].dark).toBe("#5ba8ff");
    expect(sameLimitPalette(next, { ...next, "50": { light: "#ABCDEF", dark: "#FEDCBA" } })).toBe(true);
  });
  it("uses the same saved colors for CSS and paint, including 5 and neutral 100", () => {
    const palette = normalizeLimitPalette(null);
    palette["50"].dark = "#123456";
    expect(paletteCssVars(palette)["--club-limit-50-dark"]).toBe("#123456");
    expect(palettePaint("50", "dark", palette)).toBe("#123456");
    expect(palettePaint("100", "light")).toBe("#343b46");
    expect(palettePaint("unknown", "dark")).toBe("#d8dee9");
    expect(Object.keys(paletteCssVars(palette))).toHaveLength(12);
  });
  it("provides readable defaults in both themes and detects low contrast", () => {
    expect(paletteContrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(paletteContrast("#ffffff", "#ffffff")).toBe(1);
    for (const limit of PALETTE_LIMITS) for (const theme of ["light", "dark"] as const) {
      expect(paletteContrast(DEFAULT_LIMIT_PALETTE[limit][theme], PALETTE_BACKGROUNDS[theme])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
