import { describe, expect, it } from "vitest";
import { createDistanceEntry, demoDistanceBook, distanceBookCsv, sortDistancePeople, updateDistanceEntry, type DistancePersonRow } from "./distanceBook";

function person(patch: Partial<DistancePersonRow> = {}): DistancePersonRow {
  return {
    key: "member:1", playerId: "101", nick: "DiscordNick", discordNick: "DiscordNick", gameNick: "RoomNick",
    discordId: "406139198957944843", memberId: "member-1", avatarUrl: null, onGuild: true, redParty: true, orphan: false,
    slices: [{ id: "entry-1", key: "entry-1", variant: "nitro", part: 1, comment: "manual note", source: "manual",
      createdAt: "2026-09-25T10:00:00Z", updatedAt: "2026-09-25T11:00:00Z", createdBy: "Root", updatedBy: "Admin", byLimit: { "25": { id: "entry-1:25", hands: 120 } }, total: 120 }],
    at: { nitro: { "25": 120 }, regular: {} }, nitroTotal: 120, regularTotal: 0, total: 120,
    updatedAt: "2026-09-25T11:00:00Z", ...patch,
  };
}

const labels = { month: "Month", room: "Room", distanceId: "Distance ID", discordId: "Discord ID", discordNick: "Discord nick",
  gameNick: "Room nick", variant: "Kind", part: "Part", comment: "Comment", created: "Created", updated: "Updated", total: "Total" };

describe("distanceBookCsv", () => {
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
