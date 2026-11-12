import { deepStrictEqual as equal, rejects, strictEqual } from "node:assert/strict";
import { createApp } from "../app.ts";
import { ApiError } from "../core/errors.ts";
import { parseSyncRequest } from "../v2/query.ts";
import { syncRepository, type SyncResponse } from "../v2/repository.ts";
import { pageFixture } from "./helpers.ts";

const token = "11111111-1111-4111-8111-111111111111";
const key = "rp_" + "1".repeat(64);
const idle: SyncResponse = {
  api_version: "2",
  mode: "unchanged",
  items: [],
  has_more: false,
  next_page: null,
  cursor: token,
};
Deno.test("v2: full filters and exclusive opaque cursor/page parameters", () => {
  equal(parseSyncRequest(new URLSearchParams("date=2026-11-01&days=30")), {
    date: "2026-11-01",
    days: 30,
    limit: null,
    variant: null,
  });
  equal(parseSyncRequest(new URLSearchParams(`cursor=${token}`)), { cursor: token });
  equal(parseSyncRequest(new URLSearchParams(`page=${token}`)), { page: token });
  for (
    const input of [
      "cursor=",
      "page=x",
      `cursor=${token}&date=2026-11-01`,
      `cursor=${token}&page=${token}`,
      `page=${token}&page=${token}`,
      "date=2026-02-30&days=1",
    ]
  ) {
    let error: unknown;
    try {
      parseSyncRequest(new URLSearchParams(input));
    } catch (e) {
      error = e;
    }
    strictEqual(error instanceof ApiError && error.status, 400, input);
  }
});
Deno.test("v2: explicit routing, same key auth, no-store and isolated v1 loader", async () => {
  let calls = 0;
  const logs: { api_version?: string; response_bytes?: number }[] = [];
  const app = createApp(
    () => Promise.reject(new Error("v1 must not run")),
    (event) => logs.push(event),
    (hash, query) => {
      calls++;
      strictEqual(hash.length, 64);
      equal(query, { cursor: token });
      return Promise.resolve(idle);
    },
  );
  for (const prefix of ["", "/external-api", "/functions/v1/external-api"]) {
    const response = await app(
      new Request(`http://localhost${prefix}/v2/schedule?cursor=${token}`, {
        headers: { "X-API-Key": key },
      }),
    );
    strictEqual(response.status, 200);
    strictEqual(response.headers.get("cache-control"), "no-store");
    equal(await response.json(), idle);
  }
  strictEqual(calls, 3);
  strictEqual(logs[0].api_version, "2");
  strictEqual(logs[0].response_bytes, new TextEncoder().encode(JSON.stringify(idle)).length);
  strictEqual((await app(new Request("http://localhost/v2/schedule"))).status, 401);
  const v1 = createApp(() => Promise.resolve(pageFixture()), () => {}, () => Promise.resolve(idle));
  strictEqual(
    (await v1(
      new Request("http://localhost/v1/schedule?date=2026-11-01&days=1", {
        headers: { "X-API-Key": key },
      }),
    )).status,
    200,
  );
});
Deno.test("v2: RPC forwarding, resync and corrupt pagination fail closed", async () => {
  const loader = syncRepository(
    "https://example.supabase.co",
    "server-secret",
    (url, init) => {
      strictEqual(String(url), "https://example.supabase.co/rest/v1/rpc/external_api_sync");
      equal(JSON.parse(String(init?.body)), { p_key_hash: "digest", p_page: token });
      return Promise.resolve(Response.json(idle));
    },
  );
  equal(await loader("digest", { page: token }), idle);
  for (
    const body of [{ error: { code: "resync_required" } }, { ...idle, has_more: true }, {
      ...idle,
      cursor: null,
    }, { ...idle, items: Array(1001).fill(null) }]
  ) {
    const load = syncRepository(
      "https://example.supabase.co",
      "server-secret",
      () => Promise.resolve(Response.json(body)),
    );
    await rejects(
      () => load("digest", { cursor: token }),
      (error: unknown) =>
        error instanceof ApiError && error.status === ("error" in body ? 410 : 503),
    );
  }
});
