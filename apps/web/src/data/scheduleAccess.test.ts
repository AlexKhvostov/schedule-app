import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabase: () => ({ rpc }) }));
import { loadScheduleAccess } from "./scheduleAccess";
afterEach(() => rpc.mockReset());
it("passes the selected member to the server and preserves a legitimate empty result", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await loadScheduleAccess("other", true)).toEqual([]);
  expect(rpc).toHaveBeenCalledWith("effective_schedule_access", { p_member_ids: ["other"] });
});
it("does not disguise a brush access query failure as no permissions", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  await expect(loadScheduleAccess("other", true)).rejects.toEqual({ message: "offline" });
});
