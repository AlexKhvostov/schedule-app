import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleSync } from "./scheduleSync";
import { ScheduleMonthState } from "./scheduleMonthState";
import { emptyMonth, patchSeat } from "../../schedule/plan";
import { gridEdits } from "../../schedule/gridEdits";
import { ME } from "../../schedule/marks";
import { mergeScheduleSnapshot } from "../../schedule/mergeScheduleSnapshot";
import { decodeScheduleSnapshot, type ScheduleSnapshot } from "../../data/scheduleSnapshot";

const face = { ...ME, memberId: "owner", t: "AA" };
const data = (): ScheduleSnapshot => ({ year: 2026, month: 11, kinds: [
  { id: "n50", variant_id: "nitro", limit_id: "50" }, { id: "n100", variant_id: "nitro", limit_id: "100" },
], slots: [{ kind_id: "n50", day: 4, half: 10, level: 0, member_id: "owner", tables: 3 }], members: { owner: face } });
const target = { date: "2026-11-04", kind_id: "n50" };
const cleanups: (() => void)[] = [];
function start() {
  vi.useFakeTimers();
  const state = new ScheduleMonthState({ "nitro:50": emptyMonth(2026, 10), "nitro:100": emptyMonth(2026, 10) }, ["nitro", "regular"]);
  state.acceptSnapshot(state.startLoad(), data(), { targets: null });
  const load = vi.fn(async () => data());
  const error = vi.fn();
  const sync = new ScheduleSync(state, 2026, 11, load, error);
  cleanups.push(() => sync.stop());
  return { state, load, error, sync };
}
afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); vi.useRealTimers(); });

describe("compact schedule reconciliation", () => {
  it("replaces an emptied day without changing another day or limit", () => {
    const base = mergeScheduleSnapshot({}, data(), { targets: null });
    base["nitro:50"] = patchSeat(base["nitro:50"], 4, 10, 0, face);
    const next = mergeScheduleSnapshot(base, { ...data(), slots: [], members: {} }, { targets: [target] });
    expect(next["nitro:50"][3][10]).toEqual([]);
    expect(next["nitro:50"][4]).toBe(base["nitro:50"][4]);
    expect(next["nitro:100"]).toBe(base["nitro:100"]);
    expect(base["nitro:50"][3][10][0]?.t).toBe("AA");
  });

  it("updates shared faces without changing a slot's table count", () => {
    const base = mergeScheduleSnapshot({}, data(), { targets: null });
    const next = mergeScheduleSnapshot(base, { ...data(), slots: [], members: { owner: { ...face, t: "BB", tables: 9 } } }, { targets: null, directoryOnly: true });
    expect(next["nitro:50"][3][10][0]).toMatchObject({ t: "BB", tables: 3 });
  });

  it("rejects missing owners or truncated snapshots instead of painting a partial month", () => {
    const raw = { ...data(), version: 1, slot_count: 1, members: [] };
    expect(() => decodeScheduleSnapshot(raw, 2026, 11)).toThrow();
    expect(() => decodeScheduleSnapshot({ ...raw, slots: [] }, 2026, 11)).toThrow();
  });

  it("coalesces a burst and ignores other months", async () => {
    const { sync, load } = start();
    for (let n = 0; n < 30; n++) sync.invalidate(target);
    sync.invalidate({ ...target, date: "2026-12-04" });
    await vi.advanceTimersByTimeAsync(100);
    expect(load).toHaveBeenCalledExactlyOnceWith({ targets: [target] }, expect.any(AbortSignal));
  });

  it("keeps an event received during an in-flight read for the next read", async () => {
    const { sync, load } = start();
    let resolve!: (value: ScheduleSnapshot) => void;
    load.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    sync.invalidate(target);
    await vi.advanceTimersByTimeAsync(100);
    sync.invalidate(target);
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(1);
    resolve(data());
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("waits for a pending edit and invalidates only its day and kind", async () => {
    const { sync, state, load } = start();
    let resolve!: (error?: string) => void;
    const before = state.snapshot.grids["nitro:50"];
    const task = state.edit("nitro:50", gridEdits(before, patchSeat(before, 3, 11, 0, face)), () => new Promise((done) => { resolve = done; }));
    sync.invalidate(target);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).not.toHaveBeenCalled();
    resolve(); await task;
    await vi.advanceTimersByTimeAsync(100);
    expect(load).toHaveBeenCalledExactlyOnceWith({ targets: [target] }, expect.any(AbortSignal));
  });

  it("retries a failed patch without clearing visible marks", async () => {
    const { sync, state, load, error } = start();
    load.mockRejectedValueOnce(new Error("offline"));
    sync.invalidate(target);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.snapshot.grids["nitro:50"][3][10][0]?.t).toBe("AA");
    expect(error).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(state.snapshot.error).toBe(false);
  });

  it("does not let a read started before a local edit erase that edit", async () => {
    const { sync, state, load } = start();
    let finishRead!: (value: ScheduleSnapshot) => void;
    load.mockImplementationOnce(() => new Promise((done) => { finishRead = done; }));
    sync.invalidate(target);
    await vi.advanceTimersByTimeAsync(100);
    const before = state.snapshot.grids["nitro:50"];
    await state.edit("nitro:50", gridEdits(before, patchSeat(before, 3, 11, 0, face)), async () => undefined);
    finishRead(data());
    await vi.advanceTimersByTimeAsync(0);
    expect(state.snapshot.grids["nitro:50"][3][11][0]?.t).toBe("AA");
    const fresh = data();
    fresh.slots.push({ ...fresh.slots[0], half: 11 });
    load.mockResolvedValueOnce(fresh);
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledTimes(2);
    expect(state.snapshot.grids["nitro:50"][3][11][0]?.t).toBe("AA");
  });

  it("reconnect supersedes queued patches with a full month and disposal ignores a late response", async () => {
    const { sync, state, load } = start();
    sync.invalidate(target); sync.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(load).toHaveBeenCalledExactlyOnceWith({ targets: null }, expect.any(AbortSignal));
    let resolve!: (value: ScheduleSnapshot) => void;
    load.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    sync.invalidate(target); await vi.advanceTimersByTimeAsync(100);
    sync.stop(); resolve({ ...data(), slots: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.snapshot.grids["nitro:50"][3][10][0]?.t).toBe("AA");
  });
});
