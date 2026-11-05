import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMIT_OPTIONS, defaultCapacity } from "../schedule/capacity";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), kinds: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("./kinds", () => ({ loadKinds: mocks.kinds }));
import { loadCapacityLive, saveCapacityLive } from "./capacityLive";

const kinds = ["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant}:${limit}`, variantId: variant, limitId: limit })));
beforeEach(() => { vi.resetAllMocks(); mocks.kinds.mockResolvedValue(kinds); });

describe("live capacity", () => {
  it("loads all 22 pairs with variant-specific ids, rules and flags", async () => {
    const queries: string[][] = [];
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ in: (_column: string, ids: string[]) => {
      queries.push(ids);
      return Promise.resolve({ error: null, data: ids.map(id => table === "capacity_flags"
        ? { kind_id: id, equalize: id.startsWith("regular"), week_on: false, month_on: true }
        : { kind_id: id, layer: "base", hours: Array(24).fill(id.startsWith("regular") ? 4 : 2) }) });
    } }) }));
    const [nitro, regular] = await Promise.all([loadCapacityLive("nitro"), loadCapacityLive("regular")]);
    for (const limit of LIMIT_OPTIONS) {
      expect(nitro![limit].hours).toEqual(Array(24).fill(2));
      expect(regular![limit].hours).toEqual(Array(24).fill(4));
      expect(regular![limit]).toMatchObject({ equalize: true, weekOn: false, monthOn: true });
    }
    expect(queries).toHaveLength(4);
    expect(queries.every(ids => ids.length === 11 && ids.every(id => id.split(":")[0] === ids[0].split(":")[0]))).toBe(true);
  });

  it.each(["capacity_flags", "capacity_rules"])("does not turn a failed %s read into default capacity", async table => {
    mocks.from.mockImplementation((name: string) => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: name === table ? { message: "offline" } : null }) }) }));
    await expect(loadCapacityLive("regular")).rejects.toThrow("capacity-load-failed");
  });

  it("rejects a missing kind catalog and preserves save errors", async () => {
    mocks.kinds.mockResolvedValue([]);
    await expect(loadCapacityLive("regular")).rejects.toThrow("capacity-kinds-unavailable");
    mocks.rpc.mockResolvedValue({ error: { message: "forbidden" } });
    const map = { "50": defaultCapacity()["50"] };
    expect(await saveCapacityLive("regular", map)).toEqual({ error: "forbidden" });
    expect(mocks.rpc).toHaveBeenCalledWith("save_capacity_profiles", { p_variant: "regular", p_profiles: map });
  });
});
