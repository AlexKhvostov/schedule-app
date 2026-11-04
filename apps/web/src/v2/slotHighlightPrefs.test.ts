import { afterEach, expect, it, vi } from "vitest";
import { loadSlotHighlightDisabled, saveSlotHighlightDisabled, slotHighlightStorageKey } from "./slotHighlightPrefs";

afterEach(() => vi.unstubAllGlobals());

it("keeps the preference independent for each member and environment", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  const mine = slotHighlightStorageKey("one", "demo");
  expect(loadSlotHighlightDisabled(mine)).toBe(false);
  saveSlotHighlightDisabled(mine, true);
  expect(loadSlotHighlightDisabled(mine)).toBe(true);
  expect(loadSlotHighlightDisabled(slotHighlightStorageKey("two", "demo"))).toBe(false);
  expect(loadSlotHighlightDisabled(slotHighlightStorageKey("one", "live"))).toBe(false);
  saveSlotHighlightDisabled(mine, false);
  expect(loadSlotHighlightDisabled(mine)).toBe(false);
  expect(slotHighlightStorageKey(undefined, "demo")).toBeNull();
});

it("keeps the default for invalid or unavailable storage", () => {
  vi.stubGlobal("localStorage", { getItem: () => "yes" });
  expect(loadSlotHighlightDisabled("key")).toBe(false);
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("full"); } });
  expect(loadSlotHighlightDisabled("key")).toBe(false);
  expect(() => saveSlotHighlightDisabled("key", true)).not.toThrow();
});
