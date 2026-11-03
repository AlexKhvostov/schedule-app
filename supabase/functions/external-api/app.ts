import { keyHash } from "./core/auth.ts";
import { ApiError, json } from "./core/errors.ts";
import type { ScheduleRepository } from "./core/repository.ts";
import { parseRequest } from "./v1/schedule/query.ts";
import { scheduleResponse } from "./v1/schedule/response.ts";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
type Audit = { request_id: string; status: number; duration_ms: number; slots_count?: number };

export function createApp(
  loadSchedule: ScheduleRepository,
  log: (event: Audit) => void = () => {},
) {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    const requestId = crypto.randomUUID();
    let status = 500, slotsCount: number | undefined;
    try {
      const url = new URL(request.url);
      const route = url.pathname.replace(/^\/functions\/v1\/external-api(?=\/|$)/, "")
        .replace(/^\/external-api(?=\/|$)/, "");
      // Explicit routes: no dynamic table names or wildcard resource access.
      if (route !== "/v1/schedule") throw new ApiError(404, "not_found");
      if (request.method !== "GET") throw new ApiError(405, "method_not_allowed");
      let hash: string;
      try {
        hash = await keyHash(request);
      } catch {
        throw new ApiError(401, "invalid_api_key");
      }
      const query = parseRequest(url.searchParams);
      const snapshot = await loadSchedule(hash, query);
      const body = scheduleResponse(snapshot.query, snapshot);
      const encoded = JSON.stringify(body);
      if (new TextEncoder().encode(encoded).byteLength > MAX_RESPONSE_BYTES) {
        throw new ApiError(422, "response_too_large");
      }
      status = 200;
      slotsCount = body.slots_count;
      return new Response(encoded, {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": requestId,
        },
      });
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError(503, "schedule_unavailable");
      status = err.status;
      return json(
        {
          error: { code: err.code, ...(err.field ? { field: err.field } : {}) },
          request_id: requestId,
        },
        status,
        {
          "X-Request-Id": requestId,
          ...(status === 405 ? { Allow: "GET" } : {}),
          ...(status === 429 ? { "Retry-After": String(err.retryAfter ?? 60) } : {}),
        },
      );
    } finally {
      // No key, URL/query string, names, database errors, or response bodies in logs.
      log({
        request_id: requestId,
        status,
        duration_ms: Math.round(performance.now() - started),
        ...(slotsCount !== undefined ? { slots_count: slotsCount } : {}),
      });
    }
  };
}
