import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSlotHistory } from "./slotHistory";
const { rpc, getDb } = vi.hoisted(() => ({ rpc: vi.fn(), getDb: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: getDb }));
const target = { date: "2026-11-28", half: 18, level: 2, variant: "nitro" as const, limit: "50" };
beforeEach(() => { vi.clearAllMocks(); getDb.mockReturnValue({ rpc }); });
describe("slot history data boundary", () => {
  it("keeps exact physical coordinates and pagination when requesting the server", async () => {
    rpc.mockResolvedValue({ data: { rows: [], has_more: false }, error: null });
    await loadSlotHistory(target, { at: "2026-11-28T09:00:00Z", id: "event-id" });
    expect(rpc).toHaveBeenCalledWith("slot_history", { p_date: target.date, p_half: 18, p_level: 2, p_variant: "nitro", p_limit: "50", p_before_at: "2026-11-28T09:00:00Z", p_before_id: "event-id" });
  });
  it("does not turn an inaccessible journal into an empty history", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(loadSlotHistory(target)).rejects.toThrow("slot-history-read-failed");
  });
  it("generates demo samples without database requests, including removed marks", async () => {
    getDb.mockReturnValue(null);
    const page = await loadSlotHistory(target);
    expect(page.rows.map(row => row.action)).toEqual(["remove", "place"]);
    expect(page.rows[0].actor.id).not.toBe(page.rows[0].member.id);
    expect(rpc).not.toHaveBeenCalled();
    expect(await loadSlotHistory(target, page.rows[0])).toEqual({ rows: [], has_more: false });
  });
});
