import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deadTimeIntervalsEqual,
  deadTimeIntervalsFromRows,
  formatHalfTime,
  nextDeadTimeInterval,
  validateDeadTimeIntervals,
  loadDeadTimeIntervals,
  saveDeadTimeIntervals,
  subscribeDeadTimeIntervals,
  type DeadTimeInterval,
} from "./deadTime";
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

const interval = (overrides: Partial<DeadTimeInterval> = {}): DeadTimeInterval => ({
  id: "one",
  variant: "nitro",
  limit: "50",
  startHalf: 16,
  endHalf: 20,
  ...overrides,
});

describe("dead-time model", () => {
  it("adapts valid server rows and ignores malformed rows", () => {
    expect(deadTimeIntervalsFromRows([
      { id: "b", variant_id: "regular", limit_id: "100", start_half: 10, end_half: 12 },
      { id: "a", variant_id: "nitro", limit_id: "50", start_half: 2, end_half: 4 },
      { variant_id: "cash", limit_id: "50", start_half: 2, end_half: 4 },
    ])).toEqual([
      { id: "a", variant: "nitro", limit: "50", startHalf: 2, endHalf: 4 },
      { id: "b", variant: "regular", limit: "100", startHalf: 10, endHalf: 12 },
    ]);
  });

  it("rejects invalid bounds and overlap only inside the same pair", () => {
    expect(validateDeadTimeIntervals([interval({ endHalf: 16 })])).toBe("bounds");
    expect(validateDeadTimeIntervals([interval(), interval({ id: "two", startHalf: 19, endHalf: 21 })])).toBe("overlap");
    expect(validateDeadTimeIntervals([
      interval(),
      interval({ id: "two", variant: "regular", startHalf: 19, endHalf: 21 }),
      interval({ id: "three", limit: "100", startHalf: 19, endHalf: 21 }),
    ])).toBeNull();
    expect(validateDeadTimeIntervals([interval(), interval({ id: "two", startHalf: 20, endHalf: 21 })])).toBeNull();
  });

  it("finds the first free one-hour or half-hour gap", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new" });
    expect(nextDeadTimeInterval([interval({ startHalf: 0, endHalf: 3 })], "nitro", "50")).toMatchObject({
      id: "draft-new", startHalf: 3, endHalf: 5,
    });
    expect(nextDeadTimeInterval([interval({ startHalf: 0, endHalf: 47 })], "nitro", "50")).toMatchObject({
      startHalf: 47, endHalf: 48,
    });
    expect(nextDeadTimeInterval([interval({ startHalf: 0, endHalf: 48 })], "nitro", "50")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("compares logical values without ids or ordering", () => {
    expect(deadTimeIntervalsEqual(
      [interval(), interval({ id: "two", variant: "regular" })],
      [interval({ id: "new", variant: "regular" }), interval({ id: "other" })],
    )).toBe(true);
  });

  it("formats every day boundary", () => {
    expect(formatHalfTime(0)).toBe("00:00");
    expect(formatHalfTime(17)).toBe("08:30");
    expect(formatHalfTime(48)).toBe("24:00");
  });
});

describe("demo dead-time storage", () => {
  it("persists valid intervals and notifies same-page subscribers", async () => {
    demoStorage();
    const changed = vi.fn();
    const off = subscribeDeadTimeIntervals(changed);
    const intervals = [interval({ startHalf: 16, endHalf: 20 })];

    expect(await loadDeadTimeIntervals()).toEqual([]);
    expect((await saveDeadTimeIntervals(intervals)).error).toBeUndefined();
    expect(await loadDeadTimeIntervals()).toEqual(intervals);
    expect(changed).toHaveBeenCalledTimes(1);
    off();
  });

  it("rejects invalid writes and recovers from damaged storage", async () => {
    const rows = demoStorage();
    expect((await saveDeadTimeIntervals([interval({ startHalf: 20, endHalf: 20 })])).error).toBe("bounds");
    rows.set("redparty.demo.dead-time.v1", "{");
    expect(await loadDeadTimeIntervals()).toEqual([]);
  });
});
