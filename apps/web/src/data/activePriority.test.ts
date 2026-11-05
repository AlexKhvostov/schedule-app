import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoActivePriority, setActivePriority, DEMO_ACTIVE_PRIORITY_KEY } from "./activePriority";
import { isPriorityPeriod } from "../schedule/priorities";

const mock = vi.hoisted(() => ({ live: false, rpc: vi.fn(), notify: vi.fn() }));
vi.mock("./config", () => ({ isLiveData: () => mock.live }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mock.rpc }) }));
vi.mock("./priorityRefresh", () => ({ notifyPriorityDistanceChanged: mock.notify }));
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  mock.live = false; mock.rpc.mockReset(); mock.notify.mockClear();
});
describe("active priority selection", () => {
  it("starts in August and only an authorized explicit write changes it", async () => {
    expect(demoActivePriority()).toEqual({ activePeriod: "2026-08-01", activeRevision: 0 });
    expect((await setActivePriority("2026-11-01", 0, false)).error).toBe("forbidden");
    expect(demoActivePriority().activePeriod).toBe("2026-08-01");
    expect((await setActivePriority("2026-11-01", 0, true)).error).toBeNull();
    expect(demoActivePriority()).toEqual({ activePeriod: "2026-11-01", activeRevision: 1 });
    expect(mock.notify).toHaveBeenCalledTimes(1);
    expect((await setActivePriority("2026-05-01", 0, true)).error).toBe("priority-active-conflict");
    expect(demoActivePriority().activePeriod).toBe("2026-11-01");
  });
  it("does not silently replace corrupt settings with a calendar-based period", () => {
    localStorage.setItem(DEMO_ACTIVE_PRIORITY_KEY, JSON.stringify({ activePeriod: "2026-09-01", activeRevision: 0 }));
    expect(() => demoActivePriority()).toThrow("priority-invalid-active");
  });
  it("validates quarterly periods and sends the expected revision to the authorized RPC", async () => {
    for (const value of [null, "2026-09-01", "2026-08-02", "1999-11-01", "2101-02-01"]) expect(isPriorityPeriod(value)).toBe(false);
    for (const value of ["2000-02-01", "2026-05-01", "2026-08-01", "2100-11-01"]) expect(isPriorityPeriod(value)).toBe(true);
    mock.live = true; mock.rpc.mockResolvedValue({ error: null });
    await setActivePriority("2026-11-01", 7, false);
    expect(mock.rpc).toHaveBeenCalledWith("set_active_priority", { p_period_start: "2026-11-01", p_expected_revision: 7 });
    mock.rpc.mockResolvedValue({ error: { message: "forbidden" } });
    expect((await setActivePriority("2026-08-01", 8, true)).error).toBe("forbidden");
    expect(mock.notify).toHaveBeenCalledTimes(1);
  });
});
