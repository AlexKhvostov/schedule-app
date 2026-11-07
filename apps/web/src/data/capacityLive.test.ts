import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMIT_OPTIONS, emptyProfile } from "../schedule/capacity";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), config: vi.fn(), invalidate: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("./scheduleConfiguration", () => ({ loadScheduleConfiguration: mocks.config, invalidateScheduleConfiguration: mocks.invalidate }));
import { loadCapacityLive, saveCapacityLive } from "./capacityLive";
const kinds = (["nitro", "regular"] as const).flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant}:${limit}`, variant_id: variant, limit_id: limit })));
const fixture = () => ({ settings: {}, revision: "1", kinds, deadTimeIntervals: [], capacityFlags: [], capacityRules: [] });
beforeEach(() => { vi.resetAllMocks(); });
describe("live capacity", () => {
  it("decodes all 22 pairs from shared configuration", async () => {
    mocks.config.mockResolvedValue({ ...fixture(), capacityFlags: kinds.map(k => ({ kind_id: k.id, equalize: k.variant_id === "regular", week_on: false, month_on: true })), capacityRules: kinds.map(k => ({ kind_id: k.id, layer: "base", hours: Array(24).fill(k.variant_id === "regular" ? 4 : 2) })) });
    const [nitro, regular] = await Promise.all([loadCapacityLive("nitro"), loadCapacityLive("regular")]);
    for (const limit of LIMIT_OPTIONS) {
      expect(nitro![limit].hours).toEqual(Array(24).fill(2));
      expect(regular![limit].hours).toEqual(Array(24).fill(4));
      expect(regular![limit]).toMatchObject({ equalize: true, weekOn: false, monthOn: true });
    }
  });
  it("does not turn a failed read or missing catalog into default capacity", async () => {
    mocks.config.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...fixture(), kinds: [] });
    await expect(loadCapacityLive("regular")).rejects.toThrow("offline");
    await expect(loadCapacityLive("regular")).rejects.toThrow("capacity-kinds-unavailable");
  });
  it("preserves existing empty-profile defaults when rules are absent", async () => {
    mocks.config.mockResolvedValue(fixture());
    const result = await loadCapacityLive("regular");
    for (const limit of LIMIT_OPTIONS) expect(result![limit]).toEqual(emptyProfile());
  });
  it("invalidates only successful saves", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "forbidden" } }).mockResolvedValueOnce({ error: null });
    const map = { "50": emptyProfile() };
    expect(await saveCapacityLive("regular", map)).toEqual({ error: "forbidden" });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    await saveCapacityLive("regular", map);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("save_capacity_profiles", { p_variant: "regular", p_profiles: map });
  });
});
