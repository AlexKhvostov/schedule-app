import { paletteContrast } from "./limitPalette";

export type LockedSlotAppearance = { light: string; dark: string; short: string; long: string; merge: boolean };
export const DEFAULT_LOCKED_SLOT_APPEARANCE: LockedSlotAppearance = {
  light: "#d5dbe4", dark: "#343e50", short: "", long: "", merge: true,
};
export const LOCKED_SHORT_MAX = 12;
export const LOCKED_LONG_MAX = 120;

export function isLockedSlotAppearance(value: unknown): value is LockedSlotAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 5 && typeof v.merge === "boolean"
    && [v.light, v.dark].every(c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
    && typeof v.short === "string" && [...v.short].length <= LOCKED_SHORT_MAX
    && typeof v.long === "string" && [...v.long].length <= LOCKED_LONG_MAX;
}

export function normalizeLockedSlotAppearance(value: unknown): LockedSlotAppearance {
  const v = isLockedSlotAppearance(value) ? value : DEFAULT_LOCKED_SLOT_APPEARANCE;
  return { light: v.light.toLowerCase(), dark: v.dark.toLowerCase(), short: v.short, long: v.long, merge: v.merge };
}

export function sameLockedSlotAppearance(a: LockedSlotAppearance, b: LockedSlotAppearance) {
  return a.light.toLowerCase() === b.light.toLowerCase() && a.dark.toLowerCase() === b.dark.toLowerCase()
    && a.short === b.short && a.long === b.long && a.merge === b.merge;
}

export function lockedSlotInk(background: string) {
  return paletteContrast("#000000", background) >= paletteContrast("#ffffff", background) ? "#000000" : "#ffffff";
}

/** Called once per lane with only visible, empty, capacity-closed half-hours. */
export function lockedSlotSegments(halves: readonly number[], merge: boolean) {
  const segments: { startHalf: number; endHalf: number }[] = [];
  for (const half of halves) {
    const previous = segments.at(-1);
    if (merge && previous?.endHalf === half) previous.endHalf = half + 1;
    else segments.push({ startHalf: half, endHalf: half + 1 });
  }
  return segments;
}
