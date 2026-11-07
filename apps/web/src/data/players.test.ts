import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "./client";
import { listLimitMarks, loadLimitMarks } from "./players";
import { isLiveData } from "./config";
import { SEED_MEMBERS } from "../schedule/members";

vi.mock("./client", () => ({ getSupabase: vi.fn() }));
vi.mock("./config", () => ({ isLiveData: vi.fn(() => true) }));
const rpc = vi.fn();
beforeEach(() => {
  rpc.mockReset();
  vi.mocked(isLiveData).mockReturnValue(true);
  vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as NonNullable<ReturnType<typeof getSupabase>>);
});

describe("checked roster directory", () => {
  it("also preserves the questionnaire name in Demo roster faces without database calls", async () => {
    vi.mocked(isLiveData).mockReturnValue(false);
    const result = await loadLimitMarks("nitro", ["50"]);
    expect(result.data?.length).toBeGreaterThan(0);
    for (const mark of result.data ?? []) expect(mark.profileName).toBe(SEED_MEMBERS.find(member => member.id === mark.memberId)?.name);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not confuse denied or failed directory access with a successful empty queue", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    expect(await loadLimitMarks("regular", ["50"])).toEqual({ data: null, error: "forbidden" });
    // The older picker contract remains unchanged.
    expect(await listLimitMarks("regular", ["50"])).toEqual([]);
  });
  it("keeps a valid empty queue distinguishable from an unavailable client", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadLimitMarks("nitro", ["100"])).toEqual({ data: [], error: null });
    vi.mocked(getSupabase).mockReturnValue(null);
    expect(await loadLimitMarks("nitro", ["100"])).toEqual({ data: null, error: "not-configured" });
  });
  it("requests only the selected kind and limits and preserves their VIP values", async () => {
    rpc.mockResolvedValue({ data: [{ member_id: "p1", public_code: "P1", vip_nitro: 3, vip_regular: 1, grid_priority: 99, avatar_url: "https://example.test/profile.png", discord_avatar_url: "https://cdn.discordapp.com/avatars/123/avatar.png", profile_name: "Profile Name" }], error: null });
    const result = await loadLimitMarks("regular", ["50", "100"]);
    expect(rpc).toHaveBeenCalledWith("schedule_player_directory", { p_variant: "regular", p_limit_ids: ["50", "100"] });
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({ memberId: "p1", vipNitro: 3, vipRegular: 1, avatarUrl: "https://cdn.discordapp.com/avatars/123/avatar.png", profileName: "Profile Name" });
  });
});
