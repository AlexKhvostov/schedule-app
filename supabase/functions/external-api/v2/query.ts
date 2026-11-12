import { ApiError } from "../core/errors.ts";
import { parseQuery, type ScheduleQuery } from "../v1/schedule/query.ts";

export type SyncRequest = ScheduleQuery | { cursor: string } | { page: string };
export function parseSyncRequest(params: URLSearchParams): SyncRequest {
  for (const field of ["cursor", "page"] as const) {
    if (!params.has(field)) continue;
    const value = params.get(field) ?? "";
    if (
      Array.from(params.keys()).length !== 1 ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
    ) {
      throw new ApiError(400, "validation_error", field);
    }
    return field === "cursor" ? { cursor: value } : { page: value };
  }
  return parseQuery(params);
}
