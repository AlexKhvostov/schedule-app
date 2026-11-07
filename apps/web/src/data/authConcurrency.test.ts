import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  session: true, fresh: false, blocked: false, fail: "", starts: [] as string[],
  holds: new Map<string, Promise<void>>(),
  async read(name: string) {
    this.starts.push(name);
    await this.holds.get(name);
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.fail === name ? { message: "unavailable", status: 503 } : null;
  },
}));

vi.mock("./config", () => ({ isLiveData: () => true }));
vi.mock("./client", () => ({ getSupabase: () => ({
  auth: {
    getSession: async () => ({ data: { session: fake.session ? {} : null }, error: null }),
    getUser: async () => ({ data: { user: { id: "user", user_metadata: { provider_id: "discord-id" } } }, error: await fake.read("auth") }),
  },
  functions: { invoke: async () => {
    const error = await fake.read("freshDiscord");
    // A fresh check may update the stored access state.
    fake.blocked = true;
    return { data: { present: false, hasRequiredRole: false }, error };
  } },
  from: (table: string) => {
    let fields = "";
    const query = {
      select: (value: string) => { fields = value; return query; },
      eq: () => query, in: () => query, order: () => query, limit: () => query, abortSignal: () => query,
      maybeSingle: async () => {
        const name = table === "discord_members" ? (fields.includes("present") ? "snapshot" : "display") : table;
        const error = await fake.read(name);
        const data = table === "members" ? { id: "member", public_code: "Self", access_status: fake.blocked ? "blocked" : "active" }
          : table === "identities" ? { provider: "discord", provider_uid: "discord-id" }
          : table === "club_settings" ? { required_discord_role_id: "required" }
          : table === "discord_members" ? { present: true, roles: [{ id: "required" }], global_name: "Self" } : null;
        return { data, error };
      },
    };
    return query;
  },
  rpc: (name: string) => ({ abortSignal: async () => ({
    error: await fake.read(name),
    data: { permissions: ["schedule"], hasRequiredRole: !fake.blocked, blockReason: fake.blocked ? "discord_left" : null },
  }) }),
}) }));

import { loadLiveEntry } from "./auth";

beforeEach(() => {
  vi.useFakeTimers();
  fake.session = true; fake.fresh = false; fake.blocked = false; fake.fail = ""; fake.starts = []; fake.holds.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: () => fake.fresh ? "1" : null,
    removeItem: () => { fake.fresh = false; },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("restores access in four network rounds while retaining all seven remote reads", async () => {
  const start = Date.now();
  const result = loadLiveEntry();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ kind: "member", session: { permissions: ["schedule"] } });
  expect(Date.now() - start).toBe(400);
  expect(fake.starts.sort()).toEqual(["auth", "club_settings", "display", "identities", "member_access_context", "members", "snapshot"].sort());
});

it("does not perform any remote checks for a signed-out visitor", async () => {
  fake.session = false;
  await expect(loadLiveEntry()).resolves.toEqual({ kind: "none" });
  expect(fake.starts).toEqual([]);
});

it("does not admit a member while the parallel Discord snapshot is still pending", async () => {
  let release!: () => void;
  fake.holds.set("snapshot", new Promise(resolve => { release = resolve; }));
  let finished = false;
  const result = loadLiveEntry().then(value => { finished = true; return value; });
  await vi.runAllTimersAsync();
  expect(fake.starts).toContain("display");
  expect(finished).toBe(false);
  release();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ kind: "member" });
});

it.each(["snapshot", "club_settings", "member_access_context"])("fails closed when parallel %s fails", async name => {
  fake.fail = name;
  const result = loadLiveEntry();
  const rejected = expect(result).rejects.toMatchObject({ status: 503 });
  await vi.runAllTimersAsync();
  await rejected;
});

it("waits for a fresh Discord check before reading its updated blocked profile", async () => {
  fake.fresh = true;
  let release!: () => void;
  fake.holds.set("freshDiscord", new Promise(resolve => { release = resolve; }));
  const result = loadLiveEntry();
  await vi.runAllTimersAsync();
  expect(fake.starts).toEqual(["auth", "freshDiscord"]);
  release();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ kind: "gate", reason: "discord_left", canRequest: false });
});

it("does not start membership reads when cancelled during the fresh Discord check", async () => {
  fake.fresh = true;
  const controller = new AbortController();
  let release!: () => void;
  fake.holds.set("freshDiscord", new Promise(resolve => { release = resolve; }));
  const result = loadLiveEntry(controller.signal);
  const rejected = expect(result).rejects.toBeDefined();
  await vi.runAllTimersAsync();
  controller.abort(); release();
  await vi.runAllTimersAsync();
  await rejected;
  expect(fake.starts).toEqual(["auth", "freshDiscord"]);
});
