import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { apiClientStatus, createApiClient, externalApiEndpoint, generateApiCredential, listApiClients, revokeApiClient, type ApiClient } from "./externalApi";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), live: true }));
vi.mock("./client", () => ({ getSupabase: () => mocks.live ? { rpc: mocks.rpc } : null }));
vi.mock("./config", () => ({ isLiveData: () => mocks.live, supabaseUrl: () => "https://example.invalid" }));
const draft = { name: "Bot", contact: "Developer", notes: "Test", expires_at: null, requests_per_minute: 60 };

describe("API client management", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.live = true; });
  it("defaults the public endpoint to v2 and preserves explicit v1", () => {
    expect(externalApiEndpoint()).toBe("https://example.invalid/functions/v1/external-api/v2/schedule");
    expect(externalApiEndpoint(1)).toBe("https://example.invalid/functions/v1/external-api/v1/schedule");
  });
  it("persists the chosen guide version without changing the key or scope", async () => {
    mocks.live = false;
    const credential = await generateApiCredential();
    const row = await createApiClient({ ...draft, guide_version: 2 }, credential);
    expect(row.guide_version).toBe(2);
    expect((await listApiClients()).find((item) => item.id === row.id)?.guide_version).toBe(2);
    expect((await createApiClient({ ...draft, guide_version: 1 }, credential)).guide_version).toBe(2);
    expect(row.scopes).toEqual(["schedule:read"]);
  });
  it("generates independent 256-bit keys and hashes exactly what the API authenticates", async () => {
    const a = await generateApiCredential(); const b = await generateApiCredential();
    expect(a.key).toMatch(/^rp_[0-9a-f]{64}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(createHash("sha256").update(a.key).digest("hex"));
  });
  it("sends only the hash and reuses the client ID for a safe retry", async () => {
    const credential = await generateApiCredential();
    mocks.rpc.mockResolvedValue({ data: [{ ...draft, id: credential.id }], error: null });
    await createApiClient(draft, credential); await createApiClient(draft, credential);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith("root_api_clients", { p_action: "create", p_id: credential.id, p_input: { ...draft, key_hash: credential.hash } });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(credential.key);
  });
  it("never substitutes Demo records when live access fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(listApiClients()).rejects.toThrow();
  });
  it("runs Demo create/list/revoke without contacting Supabase or retaining credentials", async () => {
    mocks.live = false;
    const credential = await generateApiCredential();
    const row = await createApiClient(draft, credential);
    expect(apiClientStatus(row)).toBe("active");
    expect(apiClientStatus(await revokeApiClient(row.id))).toBe("revoked");
    expect(JSON.stringify(await listApiClients())).not.toContain(credential.key);
    expect(JSON.stringify(await listApiClients())).not.toContain(credential.hash);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("expires at the boundary and keeps revoked status after expiry", () => {
    const row = { ...draft, created_at: "", id: "", scopes: ["schedule:read"], revoked_at: null, expires_at: "2030-01-01T00:00:00Z" } as ApiClient;
    expect(apiClientStatus(row, Date.parse(row.expires_at!))).toBe("expired");
    expect(apiClientStatus({ ...row, revoked_at: row.expires_at }, Date.parse(row.expires_at!))).toBe("revoked");
  });
});
