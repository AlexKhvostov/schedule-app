import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCKED_SLOT_APPEARANCE as defaults } from "../schedule/lockedSlotAppearance";
import { loadLockedSlotAppearance, LOCKED_APPEARANCE_KEY, saveLockedSlotAppearance } from "./lockedSlotAppearance";

const mock = vi.hoisted(() => ({ demo: false, config: vi.fn(), rpc: vi.fn() }));
vi.mock("./config", () => ({ isDevSandboxEnabled: () => mock.demo }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mock.rpc }) }));
vi.mock("./scheduleConfiguration", () => ({ loadScheduleConfiguration: mock.config, invalidateScheduleConfiguration: vi.fn(), subscribeConfigurationChanged: () => () => {} }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); mock.demo = false; });

describe("club closed-slot persistence", () => {
  it("persists all fields together in Demo, preserves other settings and rejects stale writes", async () => {
    mock.demo = true;
    const store = new Map<string, string>([["v2-capacity", "unchanged"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal("window", new EventTarget());
    const next = { ...defaults, short: "Закрыто", long: "Нет ёмкости", dark: "#ABCDEF", merge: false };
    expect(await saveLockedSlotAppearance(next, defaults)).toEqual({});
    expect((await loadLockedSlotAppearance()).appearance).toEqual({ ...next, dark: "#abcdef" });
    expect((await saveLockedSlotAppearance(defaults, defaults)).error).toBe("locked-appearance-conflict");
    expect(store.get("v2-capacity")).toBe("unchanged");
    store.set(LOCKED_APPEARANCE_KEY, "{");
    expect((await loadLockedSlotAppearance()).error).toBeTruthy();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("reports unavailable/invalid loads so fallback cannot silently overwrite saved appearance", async () => {
    mock.config.mockRejectedValue(new Error("missing column"));
    expect((await loadLockedSlotAppearance()).error).toBe("missing column");
    mock.config.mockResolvedValue({ settings: { locked_slot_appearance: {} } });
    expect((await loadLockedSlotAppearance()).error).toBe("invalid-locked-appearance");
  });
  it("uses only the protected appearance RPC and propagates conflicts and network errors", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "locked-appearance-conflict" } });
    expect(await saveLockedSlotAppearance({ ...defaults, short: "X" }, defaults)).toEqual({ error: "locked-appearance-conflict" });
    expect(mock.rpc).toHaveBeenCalledWith("save_schedule_locked_appearance", { p_appearance: { ...defaults, short: "X" }, p_expected: defaults });
    mock.rpc.mockRejectedValue(new Error("offline"));
    expect((await saveLockedSlotAppearance(defaults, defaults)).error).toBe("network-error");
  });
});
