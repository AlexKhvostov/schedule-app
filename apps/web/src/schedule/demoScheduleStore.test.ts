import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMonth } from "./plan";
import { loadDemoSchedule, resetDemoSchedules, saveDemoSchedule } from "./demoScheduleStore";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("demo schedule storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("shares saved marks between demo sessions and can reset them", () => {
    const grid = emptyMonth(2026, 8);
    grid[2][18][0] = { t: "YO", discord: "you", room: "YouNick", bg: "#123456", fg: "#ffffff", tables: 4, memberId: "RP-415" };
    saveDemoSchedule(2026, 8, "nitro", "50", grid);

    const loaded = loadDemoSchedule(2026, 8, "nitro", "50", () => emptyMonth(2026, 8));
    expect(loaded[2][18][0]?.memberId).toBe("RP-415");

    resetDemoSchedules();
    const fallback = loadDemoSchedule(2026, 8, "nitro", "50", () => {
      const next = emptyMonth(2026, 8);
      next[0][0][0] = { t: "PL", discord: "polar", room: "PolarWin", bg: "#000000", fg: "#ffffff", tables: 1 };
      return next;
    });
    expect(fallback[0][0][0]?.t).toBe("PL");
  });
});
