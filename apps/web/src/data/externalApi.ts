import { getSupabase } from "./client";
import { isLiveData, supabaseUrl } from "./config";

export type ApiClient = {
  id: string; name: string; contact: string; notes: string;
  created_at: string; expires_at: string | null; revoked_at: string | null;
  requests_per_minute: number; scopes: string[];
  guide_version: 1 | 2;
};
export type ApiClientDraft = Pick<ApiClient, "name" | "contact" | "notes" | "expires_at" | "requests_per_minute"> & { guide_version?: 1 | 2 };
export type ApiCredential = { id: string; key: string; hash: string };

// Demo records are deliberately ephemeral. No secret or hash is stored in browser storage.
let demoClients: ApiClient[] = [];
export async function generateApiCredential(): Promise<ApiCredential> {
  const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `rp_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
  const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))));
  return { id: crypto.randomUUID(), key, hash };
}

export function apiClientStatus(client: ApiClient, now = Date.now()): "active" | "expired" | "revoked" {
  if (client.revoked_at) return "revoked";
  return client.expires_at && Date.parse(client.expires_at) <= now ? "expired" : "active";
}

export function externalApiEndpoint(version: 1 | 2 = 2) {
  const base = isLiveData() ? supabaseUrl().replace(/\/$/, "") : "http://127.0.0.1:54321";
  return `${base}/functions/v1/external-api/v${version}/schedule`;
}

export async function listApiClients(): Promise<ApiClient[]> {
  const db = getSupabase();
  if (!db) return demoClients.map((row) => ({ ...row }));
  const { data, error } = await db.rpc("root_api_clients");
  if (error) throw new Error("api-management-unavailable");
  return data as ApiClient[];
}

export async function createApiClient(draft: ApiClientDraft, credential: ApiCredential): Promise<ApiClient> {
  const db = getSupabase();
  if (!db) {
    const existing = demoClients.find((row) => row.id === credential.id);
    if (existing) return existing;
    const row: ApiClient = { ...draft, guide_version: draft.guide_version ?? 1, id: credential.id, created_at: new Date().toISOString(), revoked_at: null, scopes: ["schedule:read"] };
    demoClients = [row, ...demoClients];
    return row;
  }
  const { data, error } = await db.rpc("root_api_clients", {
    p_action: "create", p_id: credential.id, p_input: { ...draft, key_hash: credential.hash },
  });
  if (error) throw new Error("api-management-failed");
  return (data as ApiClient[])[0];
}

export async function revokeApiClient(id: string): Promise<ApiClient> {
  const db = getSupabase();
  if (!db) {
    demoClients = demoClients.map((row) => row.id === id ? { ...row, revoked_at: row.revoked_at ?? new Date().toISOString() } : row);
    const row = demoClients.find((item) => item.id === id);
    if (!row) throw new Error("api-client-missing");
    return row;
  }
  const { data, error } = await db.rpc("root_api_clients", { p_action: "revoke", p_id: id });
  if (error) throw new Error("api-management-failed");
  return (data as ApiClient[])[0];
}
