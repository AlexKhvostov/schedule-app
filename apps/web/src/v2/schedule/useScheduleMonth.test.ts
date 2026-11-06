import { afterEach, describe, expect, it, vi } from "vitest";
import { patchSeat } from "../../schedule/plan";
import { gridEdits } from "../../schedule/gridEdits";
import { ME } from "../../schedule/marks";

const harness = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  change: undefined as undefined | ((change: { date: string; kind_id: string }) => void),
  load: vi.fn(),
}));
// Run the hook's subscriptions with deterministic timers and network responses.
// Rendering/layout remains covered by Playwright; month transitions by the state tests.
vi.mock("react", () => ({
  useMemo: (create: () => unknown) => create(),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
}));
vi.mock("../../data/scheduleContext", () => ({ loadScheduleContext: vi.fn(async () => ({})) }));
vi.mock("../../data/scheduleSettings", () => ({ subscribeScheduleSettings: () => vi.fn() }));
vi.mock("../../data/deadTime", () => ({ subscribeDeadTimeIntervals: () => vi.fn() }));
vi.mock("../../data/config", () => ({ isLiveData: () => true }));
vi.mock("../../data/slots", () => ({
  monthGridKey: (variant: string, limit: string) => `${variant}:${limit}`,
}));
vi.mock("../../data/scheduleSnapshot", () => ({
  loadScheduleSnapshot: harness.load,
  subscribeScheduleChanges: (change: typeof harness.change, _directory: unknown, status: (connected: boolean) => void) => {
    harness.change = change; status(true); return vi.fn();
  },
}));
vi.mock("../V2Toast", () => ({ showV2Toast: vi.fn() }));
import { useScheduleMonth } from "./useScheduleMonth";
import type { TFunction } from "i18next";

const cleanups: (() => void)[] = [];
function StartHarness() {
  vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  harness.load.mockResolvedValue({ year: 2026, month: 10, kinds: [{ id: "n50", variant_id: "nitro", limit_id: "50" }], slots: [], members: {} });
  const month = useScheduleMonth({ year: 2026, monthIndex: 9, selfId: "self", actingId: "self", actingRef: { current: "self" }, t: ((key: string) => key) as TFunction });
  harness.effects.splice(0).forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return month;
}
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); harness.load.mockReset(); harness.change = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("schedule realtime reconciliation", () => {
  it("loads the compact month after subscription and makes it ready", async () => {
    vi.useFakeTimers();
    const month = StartHarness();
    expect(month.controller.snapshot.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.load).toHaveBeenCalledExactlyOnceWith(2026, 9, { targets: null }, expect.any(AbortSignal));
    expect(month.controller.snapshot.ready).toBe(true);
  });

  it("reloads an own-member event from another session", async () => {
    vi.useFakeTimers();
    StartHarness();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.change?.({ date: "2026-10-21", kind_id: "n50" });
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(2);
  });

  it("defers reads until pending writes settle and coalesces events", async () => {
    vi.useFakeTimers();
    const month = StartHarness();
    await vi.advanceTimersByTimeAsync(0);
    let settle!: (error: string | undefined) => void;
    const before = month.controller.snapshot.grids["nitro:50"];
    const task = month.controller.edit("nitro:50", gridEdits(before, patchSeat(before, 20, 2, 0, { ...ME, memberId: "self" })),
      () => new Promise((done) => { settle = done; }));
    await vi.advanceTimersByTimeAsync(0);
    harness.change?.({ date: "2026-10-21", kind_id: "n50" });
    harness.change?.({ date: "2026-10-21", kind_id: "n50" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.load).toHaveBeenCalledTimes(1);
    settle(undefined);
    await task;
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(2);
  });

  it("ignores a different month's event and clears the pending timer on unmount", async () => {
    vi.useFakeTimers();
    StartHarness();
    await vi.advanceTimersByTimeAsync(0);
    harness.change?.({ date: "2026-11-21", kind_id: "n50" });
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.change?.({ date: "2026-10-21", kind_id: "n50" });
    cleanups.splice(0).forEach((cleanup) => cleanup());
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
  });
});
