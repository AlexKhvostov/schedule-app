import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIMIT_PALETTE, normalizeLimitPalette } from "../schedule/limitPalette";
import { loadClubLimitPalette, saveClubLimitPalette } from "./limitPalette";

const mock = vi.hoisted(() => ({ demo: false, single: vi.fn(), rpc: vi.fn() }));
vi.mock("./config", () => ({ isDevSandboxEnabled: () => mock.demo }));
vi.mock("./client", () => ({ getSupabase: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: mock.single }) }) }), rpc: mock.rpc,
}) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); mock.demo = false; });

describe("shared palette persistence", () => {
  it("keeps a club-level Demo palette, rejects stale saves, recovers corrupt storage", async () => {
    mock.demo = true;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal("window", new EventTarget());
    const before = (await loadClubLimitPalette()).palette;
    const next = normalizeLimitPalette(before);
    next["50"].dark = "#ffffff";
    expect(await saveClubLimitPalette(next, before)).toEqual({});
    expect((await loadClubLimitPalette()).palette["50"].dark).toBe("#ffffff");
    expect((await saveClubLimitPalette(before, before)).error).toBe("palette-conflict");
    store.set("redparty.demo.limit-palette.v1", "{");
    expect((await loadClubLimitPalette()).palette).toEqual(DEFAULT_LIMIT_PALETTE);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("returns an explicit load failure instead of making fallback colors editable", async () => {
    mock.single.mockResolvedValue({ error: { message: "missing column" } });
    expect((await loadClubLimitPalette()).error).toBe("missing column");
    mock.single.mockRejectedValue(new Error("offline"));
    expect((await loadClubLimitPalette()).error).toBe("network-error");
  });
  it("saves palette and tint atomically in Demo and rejects a stale tint", async () => {
    mock.demo = true;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal("window", new EventTarget());
    const before = await loadClubLimitPalette();
    const next = normalizeLimitPalette(before.palette);
    next["50"].dark = "#abcdef";
    const tint = { enabled: false, strength: 22 };
    expect(await saveClubLimitPalette(next, before.palette, tint, before.tint)).toEqual({});
    expect(store.size).toBe(1);
    expect(await loadClubLimitPalette()).toEqual({ palette: next, tint });
    expect((await saveClubLimitPalette(before.palette, next, before.tint, before.tint)).error).toBe("palette-conflict");
    expect(await loadClubLimitPalette()).toEqual({ palette: next, tint });
    expect((await saveClubLimitPalette(next, next, { enabled: true, strength: 40 }, tint)).error).toBe("invalid-slot-tint");
  });
  it("uses one guarded RPC for both settings and surfaces missing migration errors", async () => {
    vi.stubGlobal("window", new EventTarget());
    mock.rpc.mockResolvedValue({ error: null });
    const tint = { enabled: false, strength: 15 };
    const expected = { enabled: true, strength: 8 };
    expect(await saveClubLimitPalette(DEFAULT_LIMIT_PALETTE, DEFAULT_LIMIT_PALETTE, tint, expected)).toEqual({});
    expect(mock.rpc).toHaveBeenCalledWith("save_schedule_appearance", {
      p_palette: DEFAULT_LIMIT_PALETTE, p_expected_palette: DEFAULT_LIMIT_PALETTE, p_tint: tint, p_expected_tint: expected,
    });
    mock.single.mockResolvedValue({ data: { limit_palette: DEFAULT_LIMIT_PALETTE, slot_tint: tint }, error: null });
    expect((await loadClubLimitPalette()).tint).toEqual(tint);
    mock.single.mockResolvedValue({ data: { limit_palette: DEFAULT_LIMIT_PALETTE }, error: null });
    expect((await loadClubLimitPalette()).error).toBe("invalid-palette");
  });
  it("saves only via the guarded RPC and preserves failures", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "palette-conflict" } });
    expect((await saveClubLimitPalette(DEFAULT_LIMIT_PALETTE, DEFAULT_LIMIT_PALETTE)).error).toBe("palette-conflict");
    expect(mock.rpc).toHaveBeenCalledWith("save_schedule_limit_palette", { p_palette: DEFAULT_LIMIT_PALETTE, p_expected: DEFAULT_LIMIT_PALETTE });
    mock.rpc.mockRejectedValue(new Error("offline"));
    expect((await saveClubLimitPalette(DEFAULT_LIMIT_PALETTE, DEFAULT_LIMIT_PALETTE)).error).toBe("network-error");
  });
});
