import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import {
  clubGridSettingsFromRow,
  loadScheduleSettings,
  normalizeScheduleFilterLimits,
  saveCountTables,
  saveScheduleFilterLimits,
  subscribeScheduleSettings,
  toggleScheduleFilterLimit,
} from "./scheduleSettings";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function demoStorage() {
  const rows = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => key === "v2-dev-sandbox" ? "1" : null });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => rows.set(key, value),
  });
  vi.stubGlobal("window", {
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
    addEventListener: (type: string, listener: EventListener) => {
      const group = listeners.get(type) ?? new Set<EventListener>();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener: (type: string, listener: EventListener) => listeners.get(type)?.delete(listener),
  });
  return rows;
}

describe("schedule filter limit normalization", () => {
  it("keeps valid catalog limits in their server order and removes duplicates", () => {
    expect(normalizeScheduleFilterLimits(["50", "25", "50", "unknown", 100])).toEqual(["50", "25"]);
  });

  it("falls back to every catalog limit for missing or unusable server data", () => {
    expect(normalizeScheduleFilterLimits(undefined)).toEqual(LIMIT_OPTIONS);
    expect(normalizeScheduleFilterLimits(["unknown"])).toEqual(LIMIT_OPTIONS);
  });
});

describe("schedule settings adapter", () => {
  it("keeps adjacent-slot merging off for old or missing rows", () => {
    expect(clubGridSettingsFromRow(null).mergeAdjacentSlots).toBe(false);
    expect(clubGridSettingsFromRow({}).mergeAdjacentSlots).toBe(false);
  });

  it("reads the persisted adjacent-slot flag", () => {
    expect(clubGridSettingsFromRow({ merge_adjacent_slots: true }).mergeAdjacentSlots).toBe(true);
  });
});

describe("schedule filter limit selection", () => {
  const initial = { nitro: ["50", "100"], regular: ["25"] };

  it("changes Nitro and Regular independently and keeps catalog order", () => {
    expect(toggleScheduleFilterLimit(initial, "nitro", "25")).toEqual({
      nitro: ["25", "50", "100"],
      regular: ["25"],
    });
    expect(toggleScheduleFilterLimit(initial, "nitro", "50")).toEqual({
      nitro: ["100"],
      regular: ["25"],
    });
  });

  it("does not allow the last limit of a variant to be removed", () => {
    expect(toggleScheduleFilterLimit(initial, "regular", "25")).toBe(initial);
  });
});

describe("demo schedule settings", () => {
  it("persists the tables flag and notifies same-page subscribers", async () => {
    demoStorage();
    const changed = vi.fn();
    const off = subscribeScheduleSettings(changed);

    expect((await loadScheduleSettings()).countTables).toBe(false);
    expect((await saveCountTables(true)).error).toBeUndefined();
    expect((await loadScheduleSettings()).countTables).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);

    off();
  });

  it("normalizes saved filter limits and recovers from damaged storage", async () => {
    const rows = demoStorage();
    await saveScheduleFilterLimits({ nitro: ["50"], regular: ["100", "100", "bogus"] });
    expect((await loadScheduleSettings()).filterLimits).toEqual({ nitro: ["50"], regular: ["100"] });

    rows.set("redparty.demo.schedule-settings.v1", "{");
    expect((await loadScheduleSettings()).countTables).toBe(false);
  });
});
