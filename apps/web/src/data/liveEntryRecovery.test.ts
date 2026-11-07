import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveEntryRecovery } from "./liveEntryRecovery";
import type { LiveEntry } from "./auth";

const member: LiveEntry = { kind: "member", session: { nick: "Self", via: "email", access: "active", role: "member" } };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("retains the verified entry on failure and automatically recovers", async () => {
  const load = vi.fn().mockResolvedValueOnce(member).mockRejectedValueOnce(new Error("503")).mockResolvedValue(member);
  const recovery = new LiveEntryRecovery(load, vi.fn());
  await recovery.check(); await recovery.check();
  expect(recovery.state).toEqual({ entry: member, unavailable: true, checking: false });
  await vi.advanceTimersByTimeAsync(5000);
  expect(recovery.state).toEqual({ entry: member, unavailable: false, checking: false });
  recovery.stop();
});

it("bounds hanging reads, ignores their late results, and coalesces checks", async () => {
  let finish!: (entry: LiveEntry) => void;
  const load = vi.fn(() => new Promise<LiveEntry>(resolve => { finish = resolve; }));
  const recovery = new LiveEntryRecovery(load, vi.fn());
  const pending = recovery.check(); await recovery.check();
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000); await pending;
  expect(recovery.state).toEqual({ entry: null, unavailable: true, checking: false });
  finish(member); await Promise.resolve();
  expect(recovery.state.entry).toBeNull();
  recovery.stop(); await vi.advanceTimersByTimeAsync(60000);
  expect(load).toHaveBeenCalledTimes(1);
});

it("confirmed logout cancels recovery and prevents a late login from resurrecting access", async () => {
  let finish!: (entry: LiveEntry) => void;
  const recovery = new LiveEntryRecovery(() => new Promise(resolve => { finish = resolve; }), vi.fn());
  const pending = recovery.check(); recovery.signedOut(); finish(member); await pending;
  expect(recovery.state).toEqual({ entry: { kind: "none" }, unavailable: false, checking: false });
  await vi.advanceTimersByTimeAsync(60000);
  expect(recovery.state.entry).toEqual({ kind: "none" });
  recovery.stop();
});

it("a successfully verified access gate replaces the previous member", async () => {
  const gate: LiveEntry = { kind: "gate", nick: "Self", requestKind: "restore", requestStatus: null, canRequest: false, reason: "manual", avatarUrl: null };
  const load = vi.fn().mockResolvedValueOnce(member).mockResolvedValueOnce(gate);
  const recovery = new LiveEntryRecovery(load, vi.fn());
  await recovery.check(); await recovery.check();
  expect(recovery.state.entry).toBe(gate);
  recovery.stop();
});

it("coalesces access events and rechecks an event received during the current read", async () => {
  let finish!: (entry: LiveEntry) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise<LiveEntry>(resolve => { finish = resolve; })).mockResolvedValue({kind:"none"});
  const recovery = new LiveEntryRecovery(load, vi.fn());
  recovery.invalidate(); recovery.invalidate(); recovery.invalidate();
  await vi.advanceTimersByTimeAsync(0); expect(load).toHaveBeenCalledTimes(1);
  recovery.invalidate(); recovery.invalidate();
  await vi.advanceTimersByTimeAsync(1000); expect(load).toHaveBeenCalledTimes(1);
  finish(member); await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(2); expect(recovery.state.entry).toEqual({kind:"none"});
  recovery.stop();
});

it("cancels a queued access invalidation on logout or disposal", async () => {
  const load = vi.fn(async () => member); const recovery = new LiveEntryRecovery(load, vi.fn());
  recovery.invalidate(); recovery.signedOut(); await vi.advanceTimersByTimeAsync(1);
  expect(load).not.toHaveBeenCalled();
  recovery.invalidate(); recovery.stop(); await vi.advanceTimersByTimeAsync(1);
  expect(load).not.toHaveBeenCalled();
});
