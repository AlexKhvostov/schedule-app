import { describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ rpc: vi.fn(), connection: vi.fn(), account: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: shared.rpc }) }));
vi.mock("./appRealtime", () => ({
  getAppAccount: async () => "a",
  getAppAccountKey: () => "a",
  subscribeAppAccount: shared.account,
  subscribeAppChanges: vi.fn(),
  subscribeAppConnection: shared.connection,
}));
import { createConfigurationCache, decodeScheduleConfiguration, loadScheduleConfiguration } from "./scheduleConfiguration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("account configuration cache", () => {
  it("shares a single read and caches the result", async () => {
    const next = deferred<string>();
    const read = vi.fn<(signal: AbortSignal) => Promise<string>>().mockImplementation(() => next.promise);
    const cache = createConfigurationCache(read);
    const a = cache.load("a"), b = cache.load("a");
    expect(read).toHaveBeenCalledTimes(1);
    next.resolve("snapshot");
    expect(await Promise.all([a, b])).toEqual(["snapshot", "snapshot"]);
    expect(await cache.load("a")).toBe("snapshot");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("replays invalidation received while reading, without parallel requests", async () => {
    const first = deferred<string>(), second = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const cache = createConfigurationCache<string>(read);
    const result = cache.load("a");
    cache.invalidate();
    const joined = cache.load("a");
    expect(read).toHaveBeenCalledTimes(1);
    first.resolve("old");
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    second.resolve("new");
    expect(await Promise.all([result, joined])).toEqual(["new", "new"]);
  });

  it("rejects a late response from a previous account", async () => {
    const first = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue("b");
    const cache = createConfigurationCache<string>(read);
    const old = cache.load("a");
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    expect(await cache.load("b")).toBe("b");
    expect(read.mock.calls[0][0].aborted).toBe(true);
    first.resolve("private a");
    await rejected;
    expect(await cache.load("b")).toBe("b");
  });

  it("does not abort other consumers when one view unmounts", async () => {
    const next = deferred<string>();
    const read = vi.fn<(signal: AbortSignal) => Promise<string>>().mockImplementation(() => next.promise);
    const cache = createConfigurationCache(read);
    const controller = new AbortController();
    const stopped = cache.load("a", controller.signal), active = cache.load("a");
    controller.abort();
    await expect(stopped).rejects.toMatchObject({ name: "AbortError" });
    expect(read.mock.calls[0][0].aborted).toBe(false);
    next.resolve("okay");
    expect(await active).toBe("okay");
  });

  it("retries failed reads and rejects malformed wire data", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("okay");
    const cache = createConfigurationCache<string>(read);
    await expect(cache.load("a")).rejects.toThrow("offline");
    expect(await cache.load("a")).toBe("okay");
    expect(() => decodeScheduleConfiguration({ settings: {} })).toThrow("invalid-schedule-configuration");
  });

  it("closes the initial HTTP-to-SUBSCRIBED gap even with safety checks off", async () => {
    const first = deferred<unknown>();
    const wire = (revision: string) => ({ settings: {}, revision, kinds: [], deadTimeIntervals: [], capacityFlags: [], capacityRules: [] });
    shared.rpc.mockReturnValueOnce({ abortSignal: () => first.promise })
      .mockReturnValueOnce({ abortSignal: async () => ({ data: wire("new"), error: null }) });
    const pending = loadScheduleConfiguration();
    await Promise.resolve();
    expect(shared.rpc).toHaveBeenCalledTimes(1);
    shared.connection.mock.calls[0][0]("online");
    first.resolve({ data: wire("before-subscription"), error: null });
    expect((await pending).revision).toBe("new");
    expect(shared.rpc).toHaveBeenCalledTimes(2);
    expect((await loadScheduleConfiguration()).revision).toBe("new");
    expect(shared.rpc).toHaveBeenCalledTimes(2);
  });
});
