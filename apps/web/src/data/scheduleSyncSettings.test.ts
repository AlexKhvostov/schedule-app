import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ demo: false, rpc: vi.fn(), load: vi.fn(), invalidate: vi.fn() }));
vi.mock("./config", () => ({ isDevSandboxEnabled: () => mocks.demo }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("./scheduleConfiguration", () => ({ loadScheduleConfiguration: mocks.load, invalidateScheduleConfiguration: mocks.invalidate, subscribeConfigurationChanged: vi.fn() }));
import { loadScheduleSyncSettings, reloadScheduleSyncSettings, saveScheduleSyncSettings, validScheduleSyncSettings } from "./scheduleSyncSettings";

beforeEach(() => { vi.clearAllMocks(); mocks.demo = false; });
describe("safety version-check settings", () => {
  it.each([0, -1, 61, 1.5, NaN, Infinity])("rejects invalid minutes %s before saving", async intervalMinutes => {
    expect(validScheduleSyncSettings({ enabled: true, intervalMinutes })).toBe(false);
    expect(await saveScheduleSyncSettings({ enabled: true, intervalMinutes }, { enabled: false, intervalMinutes: 5 })).toEqual({ error: "invalid-sync-settings" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not turn a failed or malformed read into editable defaults", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ settings: {} });
    await expect(loadScheduleSyncSettings()).rejects.toThrow("offline");
    await expect(loadScheduleSyncSettings()).rejects.toThrow("invalid-sync-settings");
  });

  it("bypasses cached settings on an explicit reload after a conflict", async () => {
    mocks.load.mockResolvedValue({ settings: { sync_fallback_enabled: true, sync_fallback_minutes: 15 } });
    expect(await reloadScheduleSyncSettings()).toEqual({ enabled: true, intervalMinutes: 15 });
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("saves with a comparison against the loaded values and preserves conflicts", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "sync-settings-conflict" } });
    const expected = { enabled: false, intervalMinutes: 5 };
    const value = { enabled: true, intervalMinutes: 10 };
    expect(await saveScheduleSyncSettings(value, expected)).toEqual({});
    expect(mocks.rpc).toHaveBeenCalledWith("save_schedule_sync", { p_enabled: true, p_minutes: 10, p_expected_enabled: false, p_expected_minutes: 5 });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(await saveScheduleSyncSettings(value, expected)).toEqual({ error: "sync-settings-conflict" });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
