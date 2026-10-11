import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyMonth, patchSeat } from "../../schedule/plan";
import { gridEdits } from "../../schedule/gridEdits";
import { ME } from "../../schedule/marks";

const harness = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  change: undefined as undefined | ((change: { slotDate?: string; memberId?: string }) => void),
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
vi.mock("../../data/config", () => ({ isLiveData: () => true }));
vi.mock("../../data/slots", () => ({
  monthGridKey: (variant: string, limit: string) => `${variant}:${limit}`,
  loadMultiMonthGrids: harness.load,
  loadMemberOccupiedSlots: async () => [],
  ymRange: () => ({ from: "2026-10-01", to: "2026-10-31" }),
  subscribeOccupancy: (change: typeof harness.change) => { harness.change = change; return vi.fn(); },
}));
vi.mock("../V2Toast", () => ({ showV2Toast: vi.fn() }));
import { useScheduleMonth } from "./useScheduleMonth";
import type { TFunction } from "i18next";

const cleanups: (() => void)[] = [];
function StartHarness() {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  harness.load.mockResolvedValue({ grids: { "nitro:50": emptyMonth(2026, 9), "regular:50": emptyMonth(2026, 9) }, loaded: ["nitro", "regular"], errors: {} });
  const month = useScheduleMonth({ year: 2026, monthIndex: 9, selfId: "self", actingId: "self", actingRef: { current: "self" }, t: ((key: string) => key) as TFunction });
  harness.effects.splice(0).forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return month;
}
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); harness.load.mockReset(); harness.change = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("schedule realtime reconciliation", () => {
  it("reloads an own-member event from another session", async () => {
    vi.useFakeTimers();
    StartHarness();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.change?.({ slotDate: "2026-10-21", memberId: "self" });
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
    harness.change?.({ slotDate: "2026-10-21", memberId: "self" });
    harness.change?.({ slotDate: "2026-10-21", memberId: "other" });
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
    harness.change?.({ slotDate: "2026-11-21", memberId: "self" });
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.change?.({ slotDate: "2026-10-21", memberId: "self" });
    cleanups.splice(0).forEach((cleanup) => cleanup());
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
  });
});
