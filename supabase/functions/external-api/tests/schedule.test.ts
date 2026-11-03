import { pageFixture } from "./helpers.ts";
import { deepStrictEqual as equal, strictEqual, throws } from "node:assert/strict";
import { parseQuery } from "../v1/schedule/query.ts";
import { addDays, timeResolver } from "../v1/schedule/time.ts";
import { scheduleResponse } from "../v1/schedule/response.ts";
import type { ScheduleRow } from "../v1/schedule/types.ts";

export function fixture(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: "slot-1",
    date: "2026-11-03",
    half: 36,
    level: 0,
    kind_id: "kind-n50",
    variant: "nitro",
    limit: "50",
    limit_sort: 8,
    room: "winamax",
    tables: null,
    mark: { text: "AB", background: "#123456", foreground: "#ffffff" },
    owner: {
      member_id: "owner",
      display_name: "Example",
      profile_name: null,
      discord_id: "123456789012345678",
      discord_username: null,
      discord_global_name: null,
      discord_guild_nick: null,
      game_nick: null,
    },
    ...overrides,
  };
}

Deno.test("query: inclusive 1..31 days and optional independent filters", () => {
  equal(parseQuery(new URLSearchParams("date=2026-11-03&days=3")), {
    date: "2026-11-03",
    days: 3,
    limit: null,
    variant: null,
  });
  equal(parseQuery(new URLSearchParams("date=2028-02-29&days=31&limit=0.50&variant=regular")), {
    date: "2028-02-29",
    days: 31,
    limit: "0.50",
    variant: "regular",
  });
});

for (
  const query of [
    "days=3",
    "date=2026-11-03",
    "date=2026-02-29&days=1",
    "date=2026-04-31&days=1",
    "date=2026-1-01&days=1",
    "date=today&days=1",
    "date=0000-01-01&days=1",
    "date=9999-12-31&days=1",
    "date=2026-11-03&days=0",
    "date=2026-11-03&days=32",
    "date=2026-11-03&days=-1",
    "date=2026-11-03&days=1.5",
    "date=2026-11-03&days=1e1",
    "date=2026-11-03&days=03",
    "date=2026-11-03&days=1&limit=",
    "date=2026-11-03&days=1&variant=",
    "date=2026-11-03&days=1&variant=Nitro",
    "date=2026-11-03&days=1&limit=50&limit=100",
    "date=2026-11-03&days=1&foo=bar",
    "date=2026-11-03&days=1&days=2",
    "date=2026-11-03&days=1&limit=50%27",
  ]
) Deno.test(`query rejects ${query}`, () => throws(() => parseQuery(new URLSearchParams(query))));

Deno.test("calendar crosses month, year and leap-day boundaries", () => {
  strictEqual(addDays("2026-11-30", 1), "2026-12-01");
  strictEqual(addDays("2026-12-31", 1), "2027-01-01");
  strictEqual(addDays("2028-02-28", 2), "2028-03-01");
});

Deno.test("Madrid time: winter, summer, midnight; canonical half-hours", () => {
  const resolve = timeResolver();
  strictEqual(resolve("2026-11-03", 36).start_at, "2026-11-03T17:00:00.000Z");
  strictEqual(resolve("2026-07-03", 36).start_at, "2026-07-03T16:00:00.000Z");
  equal(resolve("2026-12-31", 47), {
    start_local: "2026-12-31T23:30:00",
    end_local: "2027-01-01T00:00:00",
    start_at: "2026-12-31T22:30:00.000Z",
    end_at: "2026-12-31T23:00:00.000Z",
    time_resolution: "exact",
  });
});

Deno.test("DST gaps and overlaps never silently select a UTC instant", () => {
  const resolve = timeResolver();
  for (const half of [3, 4, 5]) {
    strictEqual(resolve("2026-03-29", half).time_resolution, "nonexistent");
    strictEqual(resolve("2026-10-25", half).time_resolution, "ambiguous");
    strictEqual(resolve("2026-03-29", half).start_at, null);
    strictEqual(resolve("2026-10-25", half).end_at, null);
  }
  strictEqual(resolve("2026-03-29", 6).time_resolution, "exact");
  strictEqual(resolve("2026-10-25", 6).time_resolution, "exact");
});

Deno.test("response groups deterministic lines, preserves empty days and owner fields", () => {
  const query = parseQuery(new URLSearchParams("date=2026-11-03&days=3"));
  const rows = [
    fixture({ id: "r", variant: "regular", kind_id: "kind-r50" }),
    fixture({ id: "later", half: 37 }),
    fixture(),
    fixture({ id: "line2", level: 1 }),
  ];
  const a = scheduleResponse(query, pageFixture(rows, query));
  equal(a, scheduleResponse(query, pageFixture([...rows].reverse(), query)));
  equal(a.days.map((d) => d.date), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  equal(a.days[0].lines.map((l) => l.name), ["N50 · 1", "N50 · 2", "E50 · 1"]);
  equal(a.days[0].lines[0].slots.map((s) => s.half), [36, 37]);
  strictEqual(a.days[0].lines[0].slots[0].owner.discord_id, "123456789012345678");
  equal(a.days[1].lines, []);
  strictEqual(a.slots_count, 4);
});

Deno.test("response returns a page of 1000 and refuses invalid snapshots", () => {
  const query = parseQuery(new URLSearchParams("date=2026-11-03&days=31"));
  const rows = Array.from({ length: 1000 }, (_, n) =>
    fixture({
      id: String(n),
      date: addDays(query.date, Math.floor(n / 48)),
      half: n % 48,
    }));
  const result = scheduleResponse(query, pageFixture(rows, query));
  strictEqual(result.slots_count, 1000);
  strictEqual(result.days.flatMap((d) => d.lines.flatMap((l) => l.slots)).length, 1000);
  throws(() => scheduleResponse(query, pageFixture([...rows, rows[0]], query)));
  throws(() => scheduleResponse(query, pageFixture([fixture({ date: "2027-01-01" })], query)));
});
