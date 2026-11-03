import { ApiError } from "./errors.ts";
import type { ScheduleRequest } from "../v1/schedule/query.ts";
import type { ScheduleSnapshot } from "../v1/schedule/types.ts";

export type ScheduleRepository = (
  hash: string,
  query: ScheduleRequest,
) => Promise<ScheduleSnapshot>;

export function repository(url: string, serverKey: string, fetcher = fetch): ScheduleRepository {
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
    const response = await fetcher(new URL("/rest/v1/rpc/external_api_schedule", base), {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(
        "cursor" in query ? { p_key_hash: hash, p_cursor: query.cursor } : {
          p_key_hash: hash,
          p_date: query.date,
          p_days: query.days,
          p_limit: query.limit,
          p_variant: query.variant,
        },
      ),
    });
    if (!response.ok) throw new ApiError(503, "schedule_unavailable");
    const result = await response.json();
    if (result.error) {
      const statuses: Record<string, number> = {
        invalid_api_key: 401,
        insufficient_scope: 403,
        rate_limited: 429,
        validation_error: 400,
        response_too_large: 422,
        snapshot_unavailable: 410,
        snapshot_limit: 429,
      };
      const status = statuses[result.error.code];
      if (!status) throw new ApiError(503, "schedule_unavailable");
      throw new ApiError(status, result.error.code, result.error.field, result.error.retry_after);
    }
    if (
      !Array.isArray(result.rows) || result.rows.length > 1000 ||
      typeof result.generated_at !== "string" || !result.query || !result.pagination ||
      result.pagination.page_size !== 1000
    ) {
      throw new ApiError(503, "schedule_unavailable");
    }
    return result as ScheduleSnapshot;
  };
}
