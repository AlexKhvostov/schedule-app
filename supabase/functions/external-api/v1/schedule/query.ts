import { ApiError } from "../../core/errors.ts";

export type ScheduleQuery = {
  date: string;
  days: number;
  limit: string | null;
  variant: "nitro" | "regular" | null;
};

export type ScheduleRequest = ScheduleQuery | { cursor: string };

export function parseRequest(params: URLSearchParams): ScheduleRequest {
  if (!params.has("cursor")) return parseQuery(params);
  const cursor = params.get("cursor") ?? "";
  if (
    Array.from(params.keys()).length !== 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(cursor)
  ) {
    throw new ApiError(400, "validation_error", "cursor");
  }
  return { cursor };
}

export function parseQuery(params: URLSearchParams): ScheduleQuery {
  const allowed = new Set(["date", "days", "limit", "variant"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new ApiError(400, "validation_error", key);
    }
  }
  const date = params.get("date") ?? "";
  // Four-digit positive years only; also leave room for the exclusive range end.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiError(400, "validation_error", "date");
  }
  const days = params.get("days") ?? "";
  if (!/^(?:[1-9]|[12]\d|3[01])$/.test(days)) {
    throw new ApiError(400, "validation_error", "days");
  }
  if (new Date(parsed.getTime() + Number(days) * 86400000).getUTCFullYear() > 9999) {
    throw new ApiError(400, "validation_error", "date");
  }
  const variant = params.get("variant");
  if (variant !== null && variant !== "nitro" && variant !== "regular") {
    throw new ApiError(400, "validation_error", "variant");
  }
  const limit = params.get("limit");
  if (limit !== null && !/^\d{1,4}(?:\.\d{1,2})?$/.test(limit)) {
    throw new ApiError(400, "validation_error", "limit");
  }
  return { date, days: Number(days), limit, variant };
}
