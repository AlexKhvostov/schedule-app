import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  today: "2026-11-07", live: true,
  changes: vi.fn(), connections: vi.fn(), offChange: vi.fn(), offConnection: vi.fn(),
}));
vi.mock("../schedule/priorities", () => ({ priorityToday: () => mocks.today }));
vi.mock("./config", () => ({ isLiveData: () => mocks.live }));
vi.mock("./appRealtime", () => ({ subscribeAppChanges: mocks.changes, subscribeAppConnection: mocks.connections }));
import { subscribePriorityUpdates } from "./priorityUpdates";

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.today = "2026-11-07"; mocks.live = true;
  vi.stubGlobal("window", { setInterval, clearInterval });
  mocks.changes.mockReturnValue(mocks.offChange);
  mocks.connections.mockReturnValue(mocks.offConnection);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("priority update sources", () => {
  it("does not request data periodically and checks only a date transition", () => {
    const changed = vi.fn(); const stop = subscribePriorityUpdates(changed);
    vi.advanceTimersByTime(12 * 60 * 60_000);
    expect(changed).not.toHaveBeenCalled();
    mocks.today = "2026-11-08";
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    mocks.today = "2026-11-09";
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.offChange).toHaveBeenCalledOnce();
    expect(mocks.offConnection).toHaveBeenCalledOnce();
  });
  it("closes initial admission gaps and reloads relevant changes and reconnect", () => {
    const changed = vi.fn(); const stop = subscribePriorityUpdates(changed);
    const event = mocks.changes.mock.calls[0][0];
    const connection = mocks.connections.mock.calls[0][0];
    connection("connecting");
    event({ domain: "slots" }); event({ domain: "config" });
    expect(changed).not.toHaveBeenCalled();
    connection("online");
    expect(changed).toHaveBeenCalledTimes(1);
    event({ domain: "directory" }); event({ domain: "access" }); event({ domain: "priorities" });
    connection("offline"); connection("connecting"); connection("online");
    expect(changed).toHaveBeenCalledTimes(5);
    stop();
  });
  it("keeps Demo disconnected from Supabase", () => {
    mocks.live = false;
    const stop = subscribePriorityUpdates(vi.fn());
    expect(mocks.changes).not.toHaveBeenCalled();
    expect(mocks.connections).not.toHaveBeenCalled();
    stop();
  });
});
