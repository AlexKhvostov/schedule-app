import { describe, expect, it } from "vitest";
import { createDistanceEntry, demoDistanceBook, distanceBookLimits, distanceBookCsv, distanceBookCsvFilename, filterDistancePeople, sortDistancePeople, updateDistanceEntry, type DistancePersonRow } from "./distanceBook";

function person(patch: Partial<DistancePersonRow> = {}): DistancePersonRow {
  return {
    key: "member:1", playerId: "101", nick: "DiscordNick", discordNick: "DiscordNick", gameNick: "RoomNick",
    discordId: "406139198957944843", memberId: "member-1", avatarUrl: null, onGuild: true, redParty: true, hasActiveProfile: true, orphan: false,
    slices: [{ id: "entry-1", key: "entry-1", variant: "nitro", part: 1, comment: "manual note", source: "manual",
      createdAt: "2026-09-25T10:00:00Z", updatedAt: "2026-09-25T11:00:00Z", createdBy: "Root", updatedBy: "Admin", byLimit: { "25": { id: "entry-1:25", hands: 120 } }, total: 120 }],
    at: { nitro: { "25": 120 }, regular: {} }, nitroTotal: 120, regularTotal: 0, total: 120,
    updatedAt: "2026-09-25T11:00:00Z", ...patch,
  };
}

const labels = { month: "Month", room: "Room", distanceId: "Distance ID", discordId: "Discord ID", discordNick: "Discord nick",
  gameNick: "Room nick", variant: "Kind", part: "Part", comment: "Comment", created: "Created", updated: "Updated", total: "Total" };

describe("distanceBookCsv", () => {
  it("distinguishes successive downloads of the same month by UTC time", () => {
    expect(distanceBookCsvFilename("winamax", "2026-10-01", new Date("2026-11-06T20:45:12.123+03:00")))
      .toBe("distance-control-winamax-2026-10_2026-11-06T17-45-12.123Z.csv");
  });

  it("keeps every part and distance ID, all limits and zero cards under the selected variants", () => {
    const first = person().slices[0];
    const member = person({ playerId: "211", distanceIds: ["211", "900"], slices: [
      { ...first, distanceId: "211" },
      { ...first, id: "part2", distanceId: "211", part: 2, byLimit: { "250": { id: "v2", hands: 123456 } }, total: 123456 },
      { ...first, id: "secondary", distanceId: "900", variant: "regular", byLimit: { "500": { id: "v3", hands: 9 } }, total: 9 },
    ] });
    const empty = person({ key: "empty", playerId: "000", slices: [] });
    const exportRows = (variants: ("nitro" | "regular")[]) => distanceBookCsv({ monthStart: "2026-10-01", roomTitle: "Winamax",
      people: [member, empty], limits: ["25", "250", "500"], variants, labels }).trim().split("\r\n").slice(1).map((line) => line.split(";"));
    const rows = exportRows(["nitro", "regular"]);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => [row[2], row[6], row[7]])).toEqual([
      ['"=""211"""', "nitro", "1"], ['"=""211"""', "nitro", "2"],
      ['"=""900"""', "regular", "1"], ['"=""000"""', "", ""],
    ]);
    expect([11, 12, 13, 14].map((index) => rows.reduce((sum, row) => sum + Number(row[index]), 0))).toEqual([120, 123456, 9, 123585]);
    expect(exportRows(["nitro"]).map((row) => row[14])).toEqual(["120", "123456", "0"]);
  });

  it("exports exact text IDs and the selected slices", () => {
    const csv = distanceBookCsv({ monthStart: "2026-08-01", roomTitle: "Winamax", people: [person()], limits: ["25"], variants: ["nitro"], labels });
    expect(csv).toContain('"=""101"""');
    expect(csv).toContain('"=""406139198957944843"""');
    expect(csv).toContain("manual note");
  });

  it("exports visible members without entries as a zero row", () => {
    const csv = distanceBookCsv({ monthStart: "2026-08-01", roomTitle: "Winamax", people: [person({ slices: [], at: { nitro: {}, regular: {} }, nitroTotal: 0, total: 0 })], limits: ["25"], variants: ["nitro"], labels });
    expect(csv.split("\r\n")[1]).toContain(";0;0");
  });

  it("neutralizes spreadsheet formulas from user text", () => {
    const csv = distanceBookCsv({ monthStart: "2026-08-01", roomTitle: "Winamax", people: [person({ discordNick: "=cmd" })], limits: ["25"], variants: ["nitro"], labels });
    expect(csv).toContain("'=cmd");
  });
});

describe("sortDistancePeople", () => {
  it("sorts numeric distance IDs and leaves missing IDs last", () => {
    const rows = [person({ key: "3", playerId: "" }), person({ key: "2", playerId: "20" }), person({ key: "1", playerId: "100" })];
    expect(sortDistancePeople(rows, "distanceId", ["nitro"], "ru").map((row) => row.playerId)).toEqual(["20", "100", ""]);
  });
});

describe("distance people filters", () => {
  const filters = { variants: ["nitro" as const], query: "", onlyRedParty: false, onlyActiveProfiles: false, id: "all" as const, presence: "all" as const };
  it("keeps RedParty history without an active profile unless the profile filter is enabled", () => {
    const rows = [person(), person({ key: "history", memberId: null, orphan: true, hasActiveProfile: false }), person({ key: "outsider", redParty: false })];
    expect(filterDistancePeople(rows, { ...filters, onlyRedParty: true }).map((row) => row.key)).toEqual(["member:1", "history"]);
    expect(filterDistancePeople(rows, { ...filters, onlyRedParty: true, onlyActiveProfiles: true }).map((row) => row.key)).toEqual(["member:1"]);
  });
  it("matches presence to selected tournament kinds and combines it with ID/search", () => {
    const rows = [person(), person({ key: "zero", playerId: "", gameNick: "Zero", slices: [] })];
    expect(filterDistancePeople(rows, { ...filters, variants: ["regular"], presence: "without" })).toHaveLength(2);
    expect(filterDistancePeople(rows, { ...filters, presence: "with" }).map((row) => row.key)).toEqual(["member:1"]);
    expect(filterDistancePeople(rows, { ...filters, presence: "without", id: "missing", query: " ZERO " }).map((row) => row.key)).toEqual(["zero"]);
  });
});

describe("demo distance book", () => {
  it("keeps a zero member and persists create/edit inside the demo session", async () => {
    const monthStart = "2099-01-01"; const book = demoDistanceBook(monthStart);
    const nina = book.people.find((row) => row.memberId === "RP-912");
    expect(nina?.slices).toHaveLength(0);

    expect((await createDistanceEntry({ memberId: "RP-912", roomSlug: "winamax", monthStart, variant: "nitro", part: 1,
      comment: "first", distanceExtId: "54321", values: { "10": 125, "25": 0 } })).error).toBeNull();
    expect(nina?.playerId).toBe("54321");
    expect(nina?.total).toBe(125);

    const entryId = nina?.slices[0]?.id ?? "";
    expect((await updateDistanceEntry({ entryId, comment: "fixed", values: { "10": 150 } })).error).toBeNull();
    expect(nina?.slices[0]?.comment).toBe("fixed");
    expect(nina?.total).toBe(150);
  });
});


describe("distance limit catalog", () => {
  it("includes all limits even with no player settings or partial server data", () => {
    const expected = ["0.25", "0.50", "1", "2", "5", "10", "25", "50", "100", "250", "500"];
    expect(distanceBookLimits()).toEqual(expected);
    expect(distanceBookLimits(["10", "25"])).toEqual(expected);
    expect(demoDistanceBook("2030-01-01").limits).toEqual(expected);
    expect(distanceBookLimits(["500", "1000"])).toEqual([...expected, "1000"]);
  });
});
