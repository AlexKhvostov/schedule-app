import { describe, expect, it, vi } from "vitest";
import { gridEdits } from "../../schedule/gridEdits";
import { ME } from "../../schedule/marks";
import { emptyMonth, patchSeat } from "../../schedule/plan";
import { ScheduleMonthState } from "./scheduleMonthState";

const blank = (month = 9) => ({ "nitro:50": emptyMonth(2026, month), "regular:50": emptyMonth(2026, month) });
const state = (month = 9) => new ScheduleMonthState(blank(month), ["nitro", "regular"]);
const face = { ...ME, memberId: "self" };
function deferred() {
  let resolve!: (error: string | undefined) => void;
  return { promise: new Promise<string | undefined>((done) => { resolve = done; }), resolve: (error?: string) => resolve(error) };
}

describe("month snapshot and pending writes", () => {
  it("keeps a failed new month blank and uneditable, then retries", () => {
    const october = state();
    october.replaceLocal({ ...blank(), "nitro:50": patchSeat(blank()["nitro:50"], 20, 2, 0, face) });
    const november = state(10);
    november.acceptLoad(november.startLoad(), { grids: {}, loaded: [], errors: { nitro: "network", regular: "network" } });
    expect(november.snapshot).toMatchObject({ ready: false, loading: false, error: true });
    expect(november.snapshot.grids["nitro:50"]).toHaveLength(30);
    expect(november.snapshot.grids["nitro:50"][20][2][0]).toBeNull();
    november.updateLocal(november.snapshot.grids);
    expect(november.snapshot.ready).toBe(false);
    november.acceptLoad(november.startLoad(), { grids: blank(10), loaded: ["nitro", "regular"], errors: {} });
    expect(november.snapshot.ready).toBe(true);
  });

  it("requires both variants before editing but retains same-month data on refresh failure", () => {
    const month = state();
    month.acceptLoad(month.startLoad(), { grids: { "nitro:50": blank()["nitro:50"] }, loaded: ["nitro"], errors: { regular: "network" } });
    expect(month.snapshot.ready).toBe(false);
    month.acceptLoad(month.startLoad(), { grids: { "regular:50": blank()["regular:50"] }, loaded: ["regular"], errors: { nitro: "network" } });
    expect(month.snapshot.ready).toBe(true);
  });

  it("settles a late failed write only in its original month", async () => {
    const october = state();
    october.replaceLocal(blank());
    const november = state(10);
    november.replaceLocal(blank(10));
    const write = deferred();
    const old = october.snapshot.grids["nitro:50"];
    const task = october.edit("nitro:50", gridEdits(old, patchSeat(old, 20, 2, 0, face)), () => write.promise);
    write.resolve("network");
    await task;
    expect(november.snapshot.grids["nitro:50"]).toHaveLength(30);
    expect(november.snapshot.grids["nitro:50"][20][2][0]).toBeNull();
  });

  it("rolls back only the failed gesture and preserves a later successful edit", async () => {
    const month = state();
    month.replaceLocal(blank());
    const original = month.snapshot.grids["nitro:50"];
    const firstGrid = patchSeat(original, 20, 2, 0, face);
    const first = deferred();
    const task = month.edit("nitro:50", gridEdits(original, firstGrid), () => first.promise);
    const secondGrid = patchSeat(firstGrid, 20, 3, 0, face);
    const secondWrite = vi.fn(async () => undefined);
    const second = month.edit("nitro:50", gridEdits(firstGrid, secondGrid), secondWrite);
    await Promise.resolve();
    expect(secondWrite).not.toHaveBeenCalled();
    first.resolve("network");
    await task;
    await second;
    expect(month.snapshot.grids["nitro:50"][20][2][0]).toBeNull();
    expect(month.snapshot.grids["nitro:50"][20][3][0]?.memberId).toBe("self");
  });

  it("rejects a read that started before a write and accepts a fresh own-member update", async () => {
    const month = state();
    month.replaceLocal(blank());
    const generation = month.startLoad();
    const old = month.snapshot.grids["nitro:50"];
    await month.edit("nitro:50", gridEdits(old, patchSeat(old, 20, 2, 0, face)), async () => undefined);
    expect(month.acceptLoad(generation, { grids: blank(), loaded: ["nitro", "regular"], errors: {} })).toBe(false);
    expect(month.snapshot.grids["nitro:50"][20][2][0]?.memberId).toBe("self");
    const remote = patchSeat(month.snapshot.grids["nitro:50"], 20, 3, 0, face);
    month.acceptLoad(month.startLoad(), { grids: { ...blank(), "nitro:50": remote }, loaded: ["nitro", "regular"], errors: {} });
    expect(month.snapshot.grids["nitro:50"][20][3][0]?.memberId).toBe("self");
  });

  it("does not show a confirmed foreign replacement before its transaction succeeds", async () => {
    const month = state();
    const foreign = { ...ME, t: "BB", memberId: "other" };
    month.replaceLocal({ ...blank(), "nitro:50": patchSeat(blank()["nitro:50"], 20, 2, 0, foreign) });
    const before = month.snapshot.grids["nitro:50"];
    const write = deferred();
    const task = month.edit("nitro:50", gridEdits(before, patchSeat(before, 20, 2, 0, face)), () => write.promise, false);
    expect(month.snapshot.grids["nitro:50"][20][2][0]?.memberId).toBe("other");
    write.resolve("schedule-conflict");
    await task;
    expect(month.snapshot.grids["nitro:50"][20][2][0]?.memberId).toBe("other");
  });

  it("does not fold pending marks into the base when changing a toolbar filter", async () => {
    const month = state();
    month.replaceLocal(blank());
    const before = month.snapshot.grids["nitro:50"];
    const write = deferred();
    const task = month.edit("nitro:50", gridEdits(before, patchSeat(before, 20, 2, 0, face)), () => write.promise);
    month.updateLocal((store) => store);
    write.resolve("network");
    await task;
    expect(month.snapshot.grids["nitro:50"][20][2][0]).toBeNull();
  });
});
