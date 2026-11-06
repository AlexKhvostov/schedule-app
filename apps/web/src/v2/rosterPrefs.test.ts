import { afterEach, expect, it, vi } from "vitest";
import { loadRosterTab, saveRosterTab } from "./rosterPrefs";

afterEach(() => vi.unstubAllGlobals());

it("restores every roster tab independently of the schedule kind", () => {
  let saved: string | null = null;
  vi.stubGlobal("localStorage", {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value; },
  });
  expect(loadRosterTab("regular")).toBe("regular");
  for (const tab of ["nitro", "regular", "both"] as const) {
    saveRosterTab(tab);
    expect(loadRosterTab("nitro")).toBe(tab);
  }
  saved = "invalid";
  expect(loadRosterTab("regular")).toBe("regular");
});

it("uses the current kind and allows switching when storage is blocked", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  });
  expect(loadRosterTab("nitro")).toBe("nitro");
  expect(() => saveRosterTab("both")).not.toThrow();
});
