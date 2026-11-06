import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ storedError: null as unknown, authError: null as unknown, failure: "", missing: false, blocked: false, discord: false, selfCreateError: null as unknown, rpc: vi.fn() }));
vi.mock("./config", () => ({ isLiveData: () => true }));
vi.mock("./client", () => ({ getSupabase: () => ({
  auth: {
    getSession: async () => ({ data: { session: {} }, error: fake.storedError }),
    getUser: async () => ({ data: { user: { id: "auth-self", user_metadata: fake.discord ? { provider_id: "discord-self" } : {} } }, error: fake.authError }),
  },
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
      abortSignal: () => query,
      maybeSingle: async () => ({
        data: table === "members" ? (fake.missing ? null : { id: "self", public_code: "Self", access_status: fake.blocked ? "blocked" : "active" }) : table === "discord_members" ? { present: true, roles: [{ id: "role" }] } : table === "club_settings" ? { required_discord_role_id: "role" } : null,
        error: fake.failure === table ? { message: "service unavailable", status: 503 } : null,
      }),
    }; return query;
  },
  rpc: (name: string) => {
    fake.rpc(name);
    return { abortSignal: async () => ({ data: { permissions: ["schedule"], hasRequiredRole: true, blockReason: fake.blocked ? "manual" : null }, error: name === "self_create_profile" ? fake.selfCreateError : fake.failure === name ? { message: "service unavailable" } : null }) };
  },
}) }));
import { loadLiveEntry } from "./auth";
beforeEach(() => { fake.authError = null; fake.storedError = null; fake.failure = ""; fake.missing = false; fake.blocked = false; fake.discord = false; fake.selfCreateError = null; fake.rpc.mockClear(); });

it.each(["members", "identities", "member_access_context"])("throws %s errors instead of removing or recreating membership", async failure => {
  fake.failure = failure;
  await expect(loadLiveEntry()).rejects.toBeDefined();
  expect(fake.rpc).not.toHaveBeenCalledWith("self_create_profile");
});
it("does not turn an Auth outage into a signed-out visitor", async () => {
  fake.authError = { name: "AuthRetryableFetchError", status: 504 };
  await expect(loadLiveEntry()).rejects.toEqual(fake.authError);
  fake.storedError = fake.authError;
  await expect(loadLiveEntry()).rejects.toEqual(fake.authError);
});
it("returns none only for a confirmed auth rejection", async () => {
  fake.authError = { code: "session_not_found", status: 401 };
  await expect(loadLiveEntry()).resolves.toEqual({ kind: "none" });
});
it("preserves active and blocked access distinctions", async () => {
  await expect(loadLiveEntry()).resolves.toMatchObject({ kind: "member", session: { role: "member", permissions: ["schedule"] } });
  fake.blocked = true;
  await expect(loadLiveEntry()).resolves.toMatchObject({ kind: "gate", canRequest: false, reason: "manual" });
});
it("fails closed on a gate lookup error and cancels abandoned reads", async () => {
  fake.blocked = true; fake.failure = "club_join_requests";
  await expect(loadLiveEntry()).rejects.toBeDefined();
  const abort = new AbortController(); abort.abort(); fake.rpc.mockClear();
  await expect(loadLiveEntry(abort.signal)).rejects.toBeDefined();
  expect(fake.rpc).not.toHaveBeenCalled();
});

it("a disabled self-registration policy still opens the request gate; outages do not", async () => {
  fake.missing = true; fake.discord = true;
  fake.selfCreateError = { code: "42501", message: "self-create-disabled" };
  await expect(loadLiveEntry()).resolves.toMatchObject({ kind: "gate", requestKind: "join", canRequest: true });
  fake.selfCreateError = { code: "57014", message: "query cancelled" };
  await expect(loadLiveEntry()).rejects.toEqual(fake.selfCreateError);
});

it.each(["discord_members", "club_settings"])("Discord snapshot errors (%s) cannot recreate a profile", async failure => {
  fake.missing = true; fake.discord = true; fake.failure = failure;
  await expect(loadLiveEntry()).rejects.toBeDefined();
  expect(fake.rpc).not.toHaveBeenCalledWith("self_create_profile");
});
