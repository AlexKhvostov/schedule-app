import { ApiError } from "../core/errors.ts";
import type { SyncRequest } from "./query.ts";

export type SyncResponse = {
  api_version: "2";
  mode: "full" | "delta" | "unchanged";
  items: unknown[];
  has_more: boolean;
  cursor: string | null;
  next_page: string | null;
  [key: string]: unknown;
};
export type SyncRepository = (hash: string, query: SyncRequest) => Promise<SyncResponse>;

export function syncRepository(url: string, serverKey: string, fetcher = fetch): SyncRepository {
  const base = new URL(url);
  if (
    base.protocol !== "https:" && !(base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "kong", "host.docker.internal"].includes(base.hostname))
  ) {
    throw new Error("invalid_server_configuration");
  }
  if (!serverKey) throw new Error("missing_server_configuration");
  return async (hash, query) => {
    const headers: Record<string, string> = {
      apikey: serverKey,
      "Content-Type": "application/json",
    };
    if (serverKey.startsWith("eyJ")) headers.Authorization = `Bearer ${serverKey}`;
    const response = await fetcher(new URL("/rest/v1/rpc/external_api_sync", base), {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        p_key_hash: hash,
        ...("cursor" in query
          ? { p_cursor: query.cursor }
          : "page" in query
          ? { p_page: query.page }
          : {
            p_date: query.date,
            p_days: query.days,
            p_limit: query.limit,
            p_variant: query.variant,
          }),
      }),
    });
    if (!response.ok) throw new ApiError(503, "schedule_unavailable");
    const body = await response.json();
    if (body.error) {
      const status = ({
        invalid_api_key: 401,
        insufficient_scope: 403,
        rate_limited: 429,
        validation_error: 400,
        response_too_large: 422,
        resync_required: 410,
        snapshot_limit: 429,
      } as Record<string, number>)[body.error.code];
      if (!status) throw new ApiError(503, "schedule_unavailable");
      throw new ApiError(status, body.error.code, body.error.field, body.error.retry_after);
    }
    if (
      body.api_version !== "2" || !["full", "delta", "unchanged"].includes(body.mode) ||
      !Array.isArray(body.items) || body.items.length > 1000 ||
      typeof body.has_more !== "boolean" ||
      (body.has_more
        ? body.cursor !== null || typeof body.next_page !== "string"
        : typeof body.cursor !== "string" || body.next_page !== null)
    ) {
      throw new ApiError(503, "schedule_unavailable");
    }
    return body as SyncResponse;
  };
}
