// Same disposable fixtures and key as local.test.ts. Never contact a cloud host.
import { deepStrictEqual as equal, strictEqual } from "node:assert/strict";

const endpoint = new URL(
  Deno.env.get("EXTERNAL_API_TEST_URL") ??
    "http://127.0.0.1:54321/functions/v1/external-api/v1/schedule",
);
if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(endpoint.hostname)) {
  throw new Error("Only a disposable loopback API is allowed");
}
endpoint.pathname = endpoint.pathname.replace(/\/v1\/schedule$/, "/v2/schedule");
const key = Deno.env.get("EXTERNAL_API_TEST_KEY");
async function get(query: string) {
  const url = new URL(endpoint);
  url.search = query;
  const response = await fetch(url, { headers: { "X-API-Key": key ?? "" } });
  return { status: response.status, body: await response.json() };
}
Deno.test("v2 local HTTP: full pages, replay and small unchanged response", async () => {
  const first = await get("date=2098-11-01&days=31");
  strictEqual(first.status, 200);
  strictEqual(first.body.api_version, "2");
  strictEqual(first.body.mode, "full");
  strictEqual(first.body.cursor, null);
  strictEqual(first.body.items.length, 1000);
  const last = await get(`page=${first.body.next_page}`);
  strictEqual(last.status, 200);
  strictEqual(last.body.has_more, false);
  const all = [...first.body.items, ...last.body.items];
  strictEqual(all.filter((x) => x.type === "cell").length, 1106);
  strictEqual(all.filter((x) => x.type === "person").length, 3);
  const people = all.filter((x) => x.type === "person");
  equal(people.map((x) => x.state.priority.order), [1, 2, 3]);
  strictEqual(
    people.every((x) =>
      x.state.priority.variant === "nitro" &&
      x.state.priority.limit_group === "50-100"
    ),
    true,
  );
  equal((await get(`page=${first.body.next_page}`)).body, last.body);
  const idle = await get(`cursor=${last.body.cursor}`);
  strictEqual(idle.status, 200);
  strictEqual(idle.body.mode, "unchanged");
  equal(idle.body.items, []);
  strictEqual(JSON.stringify(idle.body).length < 250, true);
});
Deno.test("v2 local HTTP: stale cursor and mixed filters never become full", async () => {
  const token = "99999999-9999-4999-8999-999999999999";
  const stale = await get(`cursor=${token}`);
  strictEqual(stale.status, 410);
  strictEqual(stale.body.error.code, "resync_required");
  strictEqual((await get(`page=${token}`)).status, 410);
  strictEqual((await get(`cursor=${token}&days=1`)).status, 400);
});
