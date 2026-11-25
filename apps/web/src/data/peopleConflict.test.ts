import { beforeEach, expect, it, vi } from "vitest";

const { rpc, notify } = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc }) }));
vi.mock("./priorityRefresh", () => ({ notifyPriorityDistanceChanged: notify }));
import { saveMemberDistanceId } from "./people";

beforeEach(() => { rpc.mockReset(); notify.mockReset(); });

it.each(["PT409", "40001"])("preserves the stale distance editor result for %s without retrying", async code => {
  rpc.mockResolvedValue({ error: { code, message: "distance-links-stale" } });
  expect(await saveMemberDistanceId("member", "123", ["122"])).toEqual({ error: "stale" });
  expect(rpc).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
});
