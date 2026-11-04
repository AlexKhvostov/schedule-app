import { afterEach, expect, it, vi } from "vitest";
import { createRosterRefresh } from "./rosterRefresh";
afterEach(() => vi.useRealTimers());

it("coalesces bursts, never overlaps reads, and replays invalidation during a read once", async () => {
  vi.useFakeTimers(); let finish!: () => void;
  const read = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const loop = createRosterRefresh(read, () => true);
  loop.request(); loop.request(true); loop.request();
  await vi.advanceTimersByTimeAsync(100); expect(read).toHaveBeenCalledTimes(1);
  loop.request(); loop.request(true); loop.request(true);
  await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(100); expect(read).toHaveBeenCalledTimes(2);
  finish(); await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(2); loop.dispose();
});
it("does not poll hidden/closed views and refreshes on visibility restoration", async () => {
  vi.useFakeTimers(); let visible = false; const read = vi.fn(async () => {});
  const loop = createRosterRefresh(read, () => visible);
  loop.request(true); await vi.advanceTimersByTimeAsync(30000); expect(read).not.toHaveBeenCalled();
  visible = true; loop.request(); visible = false;
  await vi.advanceTimersByTimeAsync(100); expect(read).not.toHaveBeenCalled();
  visible = true; loop.request(); await vi.advanceTimersByTimeAsync(100); expect(read).toHaveBeenCalledTimes(1);
  loop.request(); loop.dispose(); await vi.advanceTimersByTimeAsync(30000); expect(read).toHaveBeenCalledTimes(1);
});
