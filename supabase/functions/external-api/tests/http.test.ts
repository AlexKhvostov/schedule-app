import { pageFixture } from "./helpers.ts";
import { deepStrictEqual as equal, ok, rejects, strictEqual } from "node:assert/strict";
import { createApp } from "../app.ts";
import { ApiError } from "../core/errors.ts";
import { keyHash } from "../core/auth.ts";
import { repository } from "../core/repository.ts";
import type { ScheduleRow } from "../v1/schedule/types.ts";

const testKey = "rp_" + "1".repeat(64); // Synthetic, never installed in any database.
function request(path = "/v1/schedule?date=2026-11-03&days=3", method = "GET", key = testKey) {
  return new Request(`http://localhost${path}`, { method, headers: { "X-API-Key": key } });
}

Deno.test("HTTP: routing prefixes, complete empty response, no public cache", async () => {
  const app = createApp(() => Promise.resolve(pageFixture()));
  for (const prefix of ["", "/external-api", "/functions/v1/external-api"]) {
    const result = await app(request(`${prefix}/v1/schedule?date=2026-11-03&days=3`));
    strictEqual(result.status, 200);
    strictEqual(result.headers.get("cache-control"), "no-store");
    strictEqual((await result.json()).days.length, 3);
  }
});

Deno.test("HTTP: missing key, malformed key, invalid input, method, route never call database", async () => {
  let calls = 0;
  const app = createApp(() => {
    calls++;
    return Promise.resolve(pageFixture());
  });
  strictEqual((await app(request(undefined, "GET", ""))).status, 401);
  strictEqual((await app(request(undefined, "GET", "not-a-key"))).status, 401);
  strictEqual((await app(request("/v1/schedule?date=2026-11-03&days=32"))).status, 400);
  const post = await app(request(undefined, "POST"));
  strictEqual(post.status, 405);
  strictEqual(post.headers.get("allow"), "GET");
  strictEqual((await app(request("/v2/schedule"))).status, 404);
  strictEqual((await app(request("/evil/v1/schedule"))).status, 404);
  strictEqual(calls, 0);
});

Deno.test("HTTP: only a digest reaches repository; errors and logs redact secrets", async () => {
  const logs: unknown[] = [];
  const app = createApp(async (hash) => {
    strictEqual(hash, await keyHash(request()));
    ok(hash !== testKey);
    ok(/^[a-f0-9]{64}$/.test(hash));
    throw new Error(`database password and ${testKey}`);
  }, (log) => logs.push(log));
  const response = await app(request());
  strictEqual(response.status, 503);
  const text = await response.text();
  ok(!text.includes(testKey));
  ok(!text.includes("password"));
  ok(!JSON.stringify(logs).includes(testKey));
  strictEqual(logs.length, 1);
});

Deno.test("HTTP: 401/403/429 are distinct; rate-limit supplies Retry-After", async () => {
  for (
    const [status, code] of [[401, "invalid_api_key"], [403, "insufficient_scope"], [
      429,
      "rate_limited",
    ]] as const
  ) {
    const response = await createApp(() =>
      Promise.reject(new ApiError(status, code, undefined, 12))
    )(request());
    strictEqual(response.status, status);
    strictEqual((await response.json()).error.code, code);
    if (status === 429) strictEqual(response.headers.get("retry-after"), "12");
  }
});

Deno.test("HTTP: oversized JSON produces an explicit error, never partial success", async () => {
  const row: ScheduleRow = {
    id: "slot",
    date: "2026-11-03",
    half: 0,
    level: 0,
    kind_id: "kind",
    variant: "nitro",
    limit: "50",
    limit_sort: 8,
    room: "winamax",
    tables: null,
    mark: { text: "AB", background: null, foreground: null },
    owner: {
      member_id: "member",
      display_name: "x".repeat(5 * 1024 * 1024),
      profile_name: null,
      discord_id: null,
      discord_username: null,
      discord_global_name: null,
      discord_guild_nick: null,
      game_nick: null,
    },
  };
  const app = createApp(() => Promise.resolve(pageFixture([row])));
  const response = await app(request());
  strictEqual(response.status, 422);
  const body = await response.json();
  strictEqual(body.error.code, "response_too_large");
  strictEqual(body.days, undefined);
});

Deno.test("HTTP: cursor-only requests preserve stored query and snapshot metadata", async () => {
  const cursor = "22222222-2222-4222-8222-222222222222";
  const snapshot = pageFixture(
    [],
    { date: "2026-12-31", days: 3, limit: "50", variant: "regular" },
    {
      page_number: 2,
      total_pages: 2,
      total_slots: 1000,
    },
  );
  const app = createApp((_hash, query) => {
    equal(query, { cursor });
    return Promise.resolve(snapshot);
  });
  const result = await app(request(`/v1/schedule?cursor=${cursor}`));
  strictEqual(result.status, 200);
  const body = await result.json();
  strictEqual(body.date_from, "2026-12-31");
  equal(body.filters, { limit: "50", variant: "regular" });
  equal(body.pagination, snapshot.pagination);
  strictEqual(body.complete, undefined);
});

Deno.test("HTTP: malformed, duplicate and mixed cursor queries are rejected before database", async () => {
  let calls = 0;
  const app = createApp(() => {
    calls++;
    return Promise.resolve(pageFixture());
  });
  const cursor = "22222222-2222-4222-8222-222222222222";
  for (
    const query of [
      "cursor=",
      "cursor=garbage",
      `cursor=${cursor}&days=3`,
      `cursor=${cursor}&date=2026-11-03`,
      `cursor=${cursor}&limit=50`,
      `cursor=${cursor}&cursor=${cursor}`,
    ]
  ) {
    strictEqual((await app(request(`/v1/schedule?${query}`))).status, 400);
  }
  strictEqual(calls, 0);
});

Deno.test("repository: cursor is forwarded alone; expired and creation-throttled snapshots map correctly", async () => {
  const query = { cursor: "22222222-2222-4222-8222-222222222222" };
  for (const [code, status] of [["snapshot_unavailable", 410], ["snapshot_limit", 429]] as const) {
    const load = repository("http://localhost", "server", (_url, init) => {
      equal(JSON.parse(String(init?.body)), { p_key_hash: "hash", p_cursor: query.cursor });
      return Promise.resolve(Response.json({ error: { code, retry_after: 30 } }));
    });
    await rejects(
      () => load("hash", query),
      (e: unknown) => e instanceof ApiError && e.status === status,
    );
  }
});

Deno.test("repository: server key stays upstream; allow-listed SQL errors, no leaked SQL details", async () => {
  const query = { date: "2026-11-03", days: 3, limit: null, variant: null };
  let posted: Record<string, unknown> = {};
  const load = repository("http://127.0.0.1:55481", "sb_secret_synthetic", (url, init) => {
    strictEqual(String(url), "http://127.0.0.1:55481/rest/v1/rpc/external_api_schedule");
    strictEqual(new Headers(init?.headers).get("apikey"), "sb_secret_synthetic");
    strictEqual(new Headers(init?.headers).get("authorization"), null);
    posted = JSON.parse(String(init?.body));
    return Promise.resolve(Response.json(pageFixture()));
  });
  equal(await load("digest", query), pageFixture());
  equal(posted, {
    p_key_hash: "digest",
    p_date: query.date,
    p_days: 3,
    p_limit: null,
    p_variant: null,
  });
  const failure = repository(
    "http://localhost",
    "server",
    () => Promise.resolve(Response.json({ error: { code: "internal sql detail" } })),
  );
  await rejects(
    () => failure("hash", query),
    (e: unknown) => e instanceof ApiError && e.code === "schedule_unavailable",
  );
});
