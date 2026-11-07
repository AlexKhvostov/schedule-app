import { afterEach, describe, expect, it, vi } from "vitest";
import { patchSeat } from "../../schedule/plan";
import { gridEdits } from "../../schedule/gridEdits";
import { ME } from "../../schedule/marks";

const harness = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  change: undefined as undefined | ((change: { domain: string; target?: {date: string; kind_id: string} }) => void),
  connection: undefined as undefined | ((status: "online" | "offline" | "connecting") => void),
  configuration: undefined as undefined | (() => void),
  versions: vi.fn(),
  context: vi.fn(),
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
vi.mock("../../data/scheduleContext", () => ({ loadScheduleContext: harness.context }));
vi.mock("../../data/scheduleConfiguration", () => ({ invalidateScheduleConfiguration: vi.fn(), subscribeConfigurationChanged: (listener: () => void) => { harness.configuration = listener; return vi.fn(); } }));
vi.mock("../../data/appRealtime", () => ({ getAppConnection: () => "online", notifyAppDataChanged: vi.fn(), subscribeAppChanges: (listener: typeof harness.change) => { harness.change = listener; return vi.fn(); }, subscribeAppConnection: (listener: NonNullable<typeof harness.connection>) => { harness.connection = listener; listener("online"); return vi.fn(); } }));
vi.mock("../../data/scheduleSettings", () => ({ subscribeScheduleSettings: () => vi.fn() }));
vi.mock("../../data/deadTime", () => ({ subscribeDeadTimeIntervals: () => vi.fn() }));
vi.mock("../authAvailability", () => ({ useAuthAvailability: () => ({ unavailable: false, retry: vi.fn() }) }));
vi.mock("../../data/config", () => ({ isLiveData: () => true }));
vi.mock("../../data/slots", () => ({
  monthGridKey: (variant: string, limit: string) => `${variant}:${limit}`,
}));
vi.mock("../../data/scheduleSnapshot", () => ({
  loadScheduleSnapshot: harness.load,
  loadScheduleVersions: harness.versions,
}));
vi.mock("../V2Toast", () => ({ showV2Toast: vi.fn() }));
import { useScheduleMonth } from "./useScheduleMonth";
import type { TFunction } from "i18next";

const cleanups: (() => void)[] = [];
const revisions = {version: 1, targets: [], config: "1", directory: "1", priorities: "1", access: "1"};
function StartHarness() {
  vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  harness.context.mockResolvedValue({ syncSettings: {enabled: false, intervalMinutes: 5}, configurationRevision: "1" });
  harness.versions.mockResolvedValue(revisions);
  harness.load.mockResolvedValue({ revisions, year: 2026, month: 10, kinds: [{ id: "n50", variant_id: "nitro", limit_id: "50" }], slots: [], members: {} });
  const month = useScheduleMonth({ year: 2026, monthIndex: 9, selfId: "self", actingId: "self", actingRef: { current: "self" }, t: ((key: string) => key) as TFunction });
  harness.effects.splice(0).forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return month;
}
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); harness.load.mockReset(); harness.context.mockReset(); harness.versions.mockReset(); harness.change = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("schedule realtime reconciliation", () => {
  it("does no idle reads with the safety option disabled", async () => {
    vi.useFakeTimers(); StartHarness(); await vi.advanceTimersByTimeAsync(24 * 60 * 60000);
    expect(harness.load).toHaveBeenCalledTimes(1); expect(harness.versions).not.toHaveBeenCalled();
    expect(harness.context).toHaveBeenCalledTimes(1);
  });

  it("applies a live safety setting change, checks only versions and stops immediately when disabled", async () => {
    vi.useFakeTimers(); StartHarness(); await vi.advanceTimersByTimeAsync(0);
    harness.context.mockResolvedValue({syncSettings:{enabled:true,intervalMinutes:5},configurationRevision:"1"});
    harness.configuration?.(); await vi.advanceTimersByTimeAsync(100);
    expect(harness.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300001); expect(harness.versions).toHaveBeenCalledTimes(1);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.context.mockResolvedValue({syncSettings:{enabled:false,intervalMinutes:5},configurationRevision:"1"});
    harness.configuration?.(); await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(3600000); expect(harness.versions).toHaveBeenCalledTimes(1);
  });

  it("can save with HTTP verified after websocket loss without background full reads", async () => {
    vi.useFakeTimers(); const month = StartHarness(); await vi.advanceTimersByTimeAsync(0);
    harness.connection?.("offline"); expect(month.controller.canEdit).toBe(false);
    await vi.advanceTimersByTimeAsync(0); expect(month.controller.canEdit).toBe(true);
    expect(month.controller.snapshot.health.connection).toBe("offline");
    await vi.advanceTimersByTimeAsync(3600000);
    expect(harness.versions).toHaveBeenCalledTimes(1); expect(harness.load).toHaveBeenCalledTimes(1);
  });
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
    harness.change?.({ domain: "slots", target: {date: "2026-10-21", kind_id: "n50" } });
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
    harness.change?.({ domain: "slots", target: {date: "2026-10-21", kind_id: "n50" } });
    harness.change?.({ domain: "slots", target: {date: "2026-10-21", kind_id: "n50" } });
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
    harness.change?.({ domain: "slots", target: {date: "2026-11-21", kind_id: "n50" } });
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
    harness.change?.({ domain: "slots", target: {date: "2026-10-21", kind_id: "n50" } });
    cleanups.splice(0).forEach((cleanup) => cleanup());
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.load).toHaveBeenCalledTimes(1);
  });
});
