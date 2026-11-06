import { afterEach, expect, it, vi } from "vitest";
import { ScheduleMonthState } from "./scheduleMonthState";
import { ScheduleSync } from "./scheduleSync";
import type { ScheduleSnapshot } from "../../data/scheduleSnapshot";

const data: ScheduleSnapshot = { year: 2026, month: 11, kinds: [], slots: [], members: {} };
const stops: (() => void)[] = [];
function start() {
  vi.useFakeTimers();
  const state = new ScheduleMonthState({}, ["nitro", "regular"], true);
  const load = vi.fn(async () => data);
  const sync = new ScheduleSync(state, 2026, 11, load, vi.fn());
  stops.push(() => sync.stop());
  sync.requireRefresh({ connected: true });
  return { state, load, sync };
}
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); });

it("requires both an established channel and a full check before editing", async () => {
  const { state, sync } = start();
  expect(state.canEdit).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(state.canEdit).toBe(true);
  sync.requireRefresh({ connected: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.canEdit).toBe(false); // Healthy HTTP alone is insufficient.
  sync.requireRefresh({ connected: true });
  expect(state.canEdit).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(state.canEdit).toBe(true);
});

it("blocks immediately on hide, discards an old read and waits for the resume check", async () => {
  const { state, sync, load } = start();
  await vi.advanceTimersByTimeAsync(0);
  let late!: (data: ScheduleSnapshot) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { late = resolve; }));
  sync.refresh(); await vi.advanceTimersByTimeAsync(0);
  sync.requireRefresh({ hidden: true });
  expect(state.canEdit).toBe(false);
  late(data); await vi.advanceTimersByTimeAsync(100);
  expect(state.canEdit).toBe(false);
  sync.requireRefresh({ hidden: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.canEdit).toBe(true);
});

it("times out a stuck initial read, retries and ignores its eventual response", async () => {
  const { state, load } = start();
  let late!: (data: ScheduleSnapshot) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { late = resolve; }));
  await vi.advanceTimersByTimeAsync(15000);
  expect(state.snapshot.error).toBe(true); expect(state.canEdit).toBe(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(2); expect(state.canEdit).toBe(true);
  const checked = state.snapshot.health.lastChecked;
  late(data); await vi.advanceTimersByTimeAsync(10);
  expect(state.snapshot.health.lastChecked).toBe(checked);
});

it("rejects queued writes after a connection loss without replaying them", async () => {
  const { state, sync } = start(); await vi.advanceTimersByTimeAsync(0);
  let settle!: () => void;
  const first = vi.fn(() => new Promise<undefined>(resolve => { settle = () => resolve(undefined); }));
  const second = vi.fn(async () => undefined);
  const a = state.edit("nitro:50", [], first), b = state.edit("nitro:50", [], second);
  await vi.advanceTimersByTimeAsync(0); sync.requireRefresh({ connected: false });
  settle(); await a; expect(await b).toBe("schedule-stale");
  expect(second).not.toHaveBeenCalled();
});

it("keeps an unconfirmed write pending, blocks new edits and never retries the write", async () => {
  const { state } = start(); await vi.advanceTimersByTimeAsync(0);
  let settle!: () => void;
  const write = vi.fn(() => new Promise<undefined>(resolve => { settle = () => resolve(undefined); }));
  const result = state.edit("nitro:50", [], write);
  await vi.advanceTimersByTimeAsync(20000);
  expect(state.snapshot.health.uncertain).toBe(true); expect(state.canEdit).toBe(false);
  expect(await state.edit("nitro:50", [], write)).toBe("schedule-stale");
  expect(write).toHaveBeenCalledTimes(1);
  settle(); await result; expect(state.snapshot.health.verified).toBe(false);
});

it("expires editing permission even if browser timers have been suspended", async () => {
  const { state } = start(); await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(Date.now() + 60001);
  expect(state.canEdit).toBe(false);
});
