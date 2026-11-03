// Requires a DISPOSABLE local Supabase with the fixtures described in README.md.
// No cloud hosts allowed, even if environment variables are accidentally copied.
import { deepStrictEqual as equal, ok, strictEqual } from "node:assert/strict";

const endpoint = new URL(
  Deno.env.get("EXTERNAL_API_TEST_URL") ??
    "http://127.0.0.1:54321/functions/v1/external-api/v1/schedule",
);
if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(endpoint.hostname)) {
  throw new Error("Integration tests require a disposable loopback HTTP endpoint");
}
const key = Deno.env.get("EXTERNAL_API_TEST_KEY");
const limitedKey = Deno.env.get("EXTERNAL_API_TEST_LIMITED_KEY");
if (!key || !limitedKey) throw new Error("Both local test keys must be supplied");

async function get(query: string, token = key) {
  const url = new URL(endpoint);
  url.search = query;
  const response = await fetch(url, { headers: { "X-API-Key": token! } });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

Deno.test("real Edge HTTP: 1106 entries in 1000+106 pages from one replayable snapshot", async () => {
  const full = await get("date=2098-11-01&days=31");
  strictEqual(full.status, 200);
  strictEqual(full.body.slots_count, 1000);
  strictEqual(full.body.pagination.total_slots, 1106);
  strictEqual(full.body.pagination.has_more, true);
  const next = await get(`cursor=${full.body.pagination.next_cursor}`);
  strictEqual(next.status, 200);
  strictEqual(next.body.slots_count, 106);
  strictEqual(next.body.pagination.has_more, false);
  strictEqual(next.body.pagination.next_cursor, null);
  strictEqual(next.body.pagination.snapshot_id, full.body.pagination.snapshot_id);
  strictEqual(next.body.generated_at, full.body.generated_at);
  equal((await get(`cursor=${full.body.pagination.next_cursor}`)).body, next.body);
  const ids = [full, next].flatMap((result) =>
    result.body.days.flatMap(
      (day: { date: string; lines: { id: string; slots: { start: string }[] }[] }) =>
        day.lines.flatMap((line) =>
          line.slots.map((slot) => `${day.date}/${line.id}/${slot.start}`)
        ),
    )
  );
  strictEqual(new Set(ids).size, 1106);
  strictEqual(full.body.days.length, 31);
  strictEqual(full.body.timezone, "Europe/Madrid");
  const owner = full.body.days[0].lines[1].slots[0].owner;
  strictEqual(owner.discord_id, "123456789012345678");
  equal(Object.keys(owner).sort(), ["discord_id", "name"]);
  ok(typeof owner.name === "string" && owner.name.length > 0);
  const three = await get("date=2098-11-01&days=3&limit=50&variant=nitro");
  strictEqual(three.status, 200);
  strictEqual(three.body.slots_count, 144);
  equal(three.body.days.map((d: { date: string }) => d.date), [
    "2098-11-01",
    "2098-11-02",
    "2098-11-03",
  ]);
});

Deno.test("real Edge HTTP: unknown cursor and changed parameters are explicit errors", async () => {
  const cursor = "99999999-9999-4999-8999-999999999999";
  const missing = await get(`cursor=${cursor}`);
  strictEqual(missing.status, 410);
  strictEqual(missing.body.error.code, "snapshot_unavailable");
  const mixed = await get(`cursor=${cursor}&date=2098-11-01&days=31`);
  strictEqual(mixed.status, 400);
});

Deno.test("real Edge HTTP: independent filters and empty days", async () => {
  const limit = await get("date=2098-11-01&days=3&limit=50");
  const variant = await get("date=2098-11-01&days=3&variant=nitro");
  strictEqual(limit.status, 200);
  strictEqual(variant.status, 200);
  strictEqual(limit.body.slots_count, 145);
  strictEqual(variant.body.slots_count, 145);
  const empty = await get("date=2098-12-31&days=3");
  strictEqual(empty.status, 200);
  equal(empty.body.days, [
    { date: "2098-12-31", lines: [] },
    { date: "2099-01-01", lines: [] },
    { date: "2099-01-02", lines: [] },
  ]);
});

Deno.test("real Edge HTTP: bad key, no key, bad filters, excess days", async () => {
  for (const token of ["", "rp_" + "f".repeat(64)]) {
    const result = await get("date=2098-11-01&days=3", token);
    strictEqual(result.status, 401);
    strictEqual(result.body.error.code, "invalid_api_key");
  }
  for (
    const query of [
      "date=2098-11-01&days=32",
      "date=2098-02-29&days=1",
      "date=2098-11-01&days=3&limit=999",
    ]
  ) {
    const result = await get(query);
    strictEqual(result.status, 400);
    strictEqual(result.body.error.code, "validation_error");
  }
});

Deno.test("real concurrent HTTP: shared database quota permits only two requests", async () => {
  // Avoid a bucket rollover during this short burst; the key is freshly seeded.
  if (new Date().getSeconds() >= 57) await new Promise((resolve) => setTimeout(resolve, 4000));
  const results = await Promise.all(
    Array.from({ length: 10 }, () => get("date=2098-12-01&days=1", limitedKey)),
  );
  strictEqual(results.filter((r) => r.status === 200).length, 2);
  strictEqual(results.filter((r) => r.status === 429).length, 8);
  for (const result of results.filter((r) => r.status === 429)) {
    ok(Number(result.headers.get("retry-after")) >= 1);
  }
});
