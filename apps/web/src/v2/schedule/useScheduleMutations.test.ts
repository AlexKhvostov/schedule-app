import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { ME } from "../../schedule/marks";
import { emptyMonth, patchSeat } from "../../schedule/plan";
import type { OverwriteAsk } from "../optFieldModel";
import { ScheduleMonthState } from "./scheduleMonthState";
import type { useScheduleMonth } from "./useScheduleMonth";

const mocks = vi.hoisted(() => ({ ask: null as OverwriteAsk | null, stateIndex: 0, own: vi.fn(), atomic: vi.fn(), notify: vi.fn(), toast: vi.fn() }));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useEffect: vi.fn(),
  useState: (initial: unknown) => [mocks.stateIndex++ === 0 ? mocks.ask : initial, vi.fn()],
}));
vi.mock("../../data/config", () => ({ isLiveData: () => true }));
vi.mock("../../data/notifyMark", () => ({ notifyMarkRemoved: mocks.notify }));
vi.mock("../../data/slots", () => ({
  monthGridKey: (variant: string, limit: string) => `${variant}:${limit}`,
  applyOwnSlots: mocks.own, applyScheduleEdit: mocks.atomic,
}));
vi.mock("../V2Toast", () => ({ showV2Toast: mocks.toast }));
import { useScheduleMutations } from "./useScheduleMutations";

const self = { ...ME, memberId: "self" };
const other = { ...ME, t: "BB", memberId: "other" };
function StartMutations(controller: ScheduleMonthState, actingRef = { current: "self" as string | undefined }) {
  mocks.stateIndex = 0;
  return useScheduleMutations({ year: 2026, monthIndex: 9,
    month: { controller } as ReturnType<typeof useScheduleMonth>,
    selfIdRef: { current: "self" }, actingRef,
    accessRef: { current: new Set(["nitro:50"]) }, selectedPlayPairsRef: { current: new Set(["nitro:50"]) },
    filterLimits: { nitro: ["50"], regular: ["50"] }, t: ((key: string) => key) as TFunction, language: "ru",
  });
}
function controller(grid = emptyMonth(2026, 9)) {
  const month = new ScheduleMonthState({ "nitro:50": grid }, ["nitro"]);
  month.replaceLocal({ "nitro:50": grid });
  return month;
}
function foreignAsk() {
  const before = patchSeat(emptyMonth(2026, 9), 20, 2, 0, other);
  const next = patchSeat(before, 20, 2, 0, self);
  mocks.ask = { kind: "place", year: 2026, monthIndex: 9, variant: "nitro", limit: "50", before, next,
    slots: [{ date: "2026-10-21", half: 2, level: 0 }], people: [], memberIds: ["other"] };
  return before;
}
afterEach(() => { mocks.ask = null; mocks.own.mockReset(); mocks.atomic.mockReset(); mocks.notify.mockReset(); mocks.toast.mockReset(); vi.useRealTimers(); });

describe("schedule mutation orchestration", () => {
  it("does not put or persist an empty brush", () => {
    const month = controller();
    StartMutations(month).onGridChange("nitro", "50", patchSeat(month.snapshot.grids["nitro:50"], 20, 2, 0, { ...self, t: "" }));
    expect(month.snapshot.grids["nitro:50"][20][2][0]).toBeNull();
    expect(mocks.own).not.toHaveBeenCalled();
    expect(mocks.atomic).not.toHaveBeenCalled();
  });

  it("captures the painter at the gesture instead of reading a later brush", async () => {
    mocks.atomic.mockResolvedValue({});
    const month = controller();
    const acting = { current: "self" as string | undefined };
    StartMutations(month, acting).onGridChange("nitro", "50", patchSeat(month.snapshot.grids["nitro:50"], 20, 2, 0, self));
    acting.current = "other";
    await vi.waitFor(() => expect(mocks.atomic).toHaveBeenCalledWith(expect.objectContaining({ memberId: "self", foreign: [] })));
    expect(mocks.own).not.toHaveBeenCalled();
  });

  it("rolls back a queued ordinary range that expires before the atomic write and never reports its success", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T07:59:59Z"));
    let release!: (result: { error?: string }) => void;
    mocks.atomic.mockReturnValueOnce(new Promise<{ error?: string }>((resolve) => { release = resolve; }))
      .mockResolvedValueOnce({ error: "schedule-conflict" });
    const month = controller();
    const mutations = StartMutations(month);
    mutations.onGridChange("nitro", "50", patchSeat(month.snapshot.grids["nitro:50"], 20, 22, 0, self));
    await vi.waitFor(() => expect(mocks.atomic).toHaveBeenCalledOnce());
    mutations.onGridChange("nitro", "50", patchSeat(patchSeat(month.snapshot.grids["nitro:50"], 20, 19, 0, self), 20, 20, 0, self));
    expect(month.pendingCount).toBe(2);
    expect(mocks.toast).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-21T08:00:01Z"));
    release({});
    await vi.waitFor(() => expect(month.pendingCount).toBe(0));
    expect(mocks.atomic).toHaveBeenNthCalledWith(2, expect.objectContaining({
      place: [{ day: 21, half: 19, level: 0, tables: self.tables }, { day: 21, half: 20, level: 0, tables: self.tables }],
      remove: [], foreign: [],
    }));
    expect(month.snapshot.grids["nitro:50"][20][22][0]?.memberId).toBe("self");
    expect(month.snapshot.grids["nitro:50"][20][19][0]).toBeNull();
    expect(month.snapshot.grids["nitro:50"][20][20][0]).toBeNull();
    expect(mocks.own).not.toHaveBeenCalled();
    expect(mocks.toast.mock.calls).toEqual([["ok", "schedule.toastPlaced"], ["err", "schedule.toastConflict"]]);
  });

  it("restores every own shift when an ordinary removal conflicts, even with another painter selected", async () => {
    mocks.atomic.mockResolvedValue({ error: "schedule-conflict" });
    const before = patchSeat(patchSeat(emptyMonth(2026, 9), 20, 19, 0, self), 20, 20, 0, self);
    const month = controller(before);
    StartMutations(month, { current: "other" }).onGridChange("nitro", "50", patchSeat(patchSeat(before, 20, 19, 0, null), 20, 20, 0, null));
    await vi.waitFor(() => expect(month.pendingCount).toBe(0));
    expect(mocks.atomic).toHaveBeenCalledWith(expect.objectContaining({ memberId: "self", place: [],
      remove: [{ day: 21, half: 19, level: 0 }, { day: 21, half: 20, level: 0 }], foreign: [] }));
    expect(month.snapshot.grids["nitro:50"][20][19][0]?.memberId).toBe("self");
    expect(month.snapshot.grids["nitro:50"][20][20][0]?.memberId).toBe("self");
    expect(mocks.toast.mock.calls).toEqual([["err", "schedule.toastConflict"]]);
    expect(mocks.own).not.toHaveBeenCalled();
  });

  it("confirms a foreign replacement with one atomic write and then notifies", async () => {
    mocks.atomic.mockResolvedValue({});
    const month = controller(foreignAsk());
    StartMutations(month).confirmOverwrite("wipe");
    await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    expect(mocks.atomic).toHaveBeenCalledOnce();
    expect(mocks.own).not.toHaveBeenCalled();
    expect(mocks.atomic).toHaveBeenCalledWith(expect.objectContaining({
      foreign: [{ date: "2026-10-21", half: 2, level: 0, memberId: "other" }],
    }));
    expect(month.snapshot.grids["nitro:50"][20][2][0]?.memberId).toBe("self");
  });

  it("keeps the foreign shift and sends no notification on transaction failure", async () => {
    mocks.atomic.mockResolvedValue({ error: "schedule-player-limit-not-selected" });
    const month = controller(foreignAsk());
    StartMutations(month).confirmOverwrite("wipe");
    await vi.waitFor(() => expect(month.pendingCount).toBe(0));
    expect(month.snapshot.grids["nitro:50"][20][2][0]?.memberId).toBe("other");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
