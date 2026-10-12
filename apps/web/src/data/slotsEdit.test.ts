import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, kindId } = vi.hoisted(() => ({ rpc: vi.fn(), kindId: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc }) }));
vi.mock("./kinds", () => ({ kindIdOf: kindId }));
import { applyOwnSlots, applyScheduleEdit, placeSlot, removeSlot } from "./slots";

describe("atomic schedule edit data contract", () => {
  beforeEach(() => { rpc.mockReset(); kindId.mockReset(); kindId.mockResolvedValue("kind"); });
  const input = {
    memberId: "self", limit: "50", variant: "nitro" as const, year: 2026, monthIndex: 9,
    place: [{ day: 21, half: 20, level: 0, tables: 3 }],
    remove: [{ day: 21, half: 21, level: 0 }],
    foreign: [{ date: "2026-10-21", half: 20, level: 0, memberId: "other" }],
  };
  it("sends all steps and expected owners in one RPC", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await applyScheduleEdit(input)).toEqual({ error: undefined });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("apply_schedule_edit", {
      p_kind_id: "kind", p_member_id: "self",
      p_place: [{ date: "2026-10-21", half: 20, level: 0, tables: 3 }],
      p_remove: [{ date: "2026-10-21", half: 21, level: 0, tables: undefined }],
      p_foreign: [{ date: "2026-10-21", half: 20, level: 0, member_id: "other" }],
    });
  });
  it("fails closed when the new RPC is unavailable", async () => {
    rpc.mockResolvedValue({ error: { message: "Could not find the function apply_schedule_edit" } });
    expect((await applyScheduleEdit(input)).error).toContain("Could not find");
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("routes the own-range API through the strict transaction and propagates expiry conflicts", async () => {
    rpc.mockResolvedValue({ error: { message: "schedule-conflict", code: "40001" } });
    expect((await applyOwnSlots({ ...input, remove: [] })).error).toBe("schedule-conflict");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("apply_schedule_edit", expect.objectContaining({
      p_place: [{ date: "2026-10-21", half: 20, level: 0, tables: 3 }], p_remove: [], p_foreign: [],
    }));
  });
  it("keeps one-seat convenience APIs atomic and never falls back when the strict RPC is missing", async () => {
    rpc.mockResolvedValue({ error: { message: "Could not find the function apply_schedule_edit" } });
    const seat = { ...input, day: 21, half: 20, level: 0, tables: 3 };
    expect((await placeSlot(seat)).error).toContain("Could not find");
    expect((await removeSlot(seat)).error).toContain("Could not find");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["apply_schedule_edit", "apply_schedule_edit"]);
    expect(rpc).toHaveBeenLastCalledWith("apply_schedule_edit", expect.objectContaining({
      p_place: [], p_remove: [{ date: "2026-10-21", half: 20, level: 0, tables: undefined }], p_foreign: [],
    }));
  });
});
