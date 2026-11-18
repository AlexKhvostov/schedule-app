import { expect, it, vi } from "vitest";
import type { FillOffer } from "../schedule/fillQueue";
import { confirmFill } from "./fillQueue";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("./config", () => ({ isLiveData: () => true }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mock.rpc, functions: { invoke: mock.invoke } }) }));

it.each([false, true])("passes Discord consent %s to the server and only invokes the worker with consent", async notify => {
  vi.clearAllMocks();
  mock.rpc.mockResolvedValue({ data: { id: "completion" }, error: null });
  mock.invoke.mockResolvedValue({});
  const offer: FillOffer = {
    mode: "complete", member: "first", name: "First", next: "second", nextName: "Second",
    channel: "999990000000000099", dm: true,
  };

  await confirmFill("2026-11-01", "nitro", "first", offer, notify);

  expect(mock.rpc).toHaveBeenCalledWith("confirm_fill_completion", {
    p_month: "2026-11-01", p_queue: "nitro", p_member: "first", p_expected: offer, p_notify: notify,
  });
  if (notify) expect(mock.invoke).toHaveBeenCalledWith("notify-fill-queue", { body: { id: "completion" } });
  else expect(mock.invoke).not.toHaveBeenCalled();
});
