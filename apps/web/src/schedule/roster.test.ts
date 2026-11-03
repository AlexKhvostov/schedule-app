import { describe, expect, it } from "vitest";
import type { Mark } from "./marks";
import { groupRosterRows, orderRosterRows, type RosterRow } from "./roster";
import type { PriorityPerson, PrioritySource } from "./priorities";

function row(id: string, n: number): RosterRow {
  const mark: Mark = { t: id.slice(0, 2).toUpperCase(), discord: id, room: "", bg: "#000", fg: "#fff", tables: 1, memberId: id };
  return { n, mark, limit: "N50", byLimit: {}, slots: 0, hours: 0, left: 0 };
}

describe("groupRosterRows", () => {
  it("numbers eligible players and moves marked ineligible players to an unnumbered tail", () => {
    const eligible = new Set(["active-a", "active-b"]);
    const result = groupRosterRows(
      [row("active-a", 7), row("active-b", 9)],
      [row("active-a", 1), row("old-mark", 2)],
      eligible,
    );

    expect(result.active.map((item) => [item.mark.memberId, item.n])).toEqual([
      ["active-a", 1],
      ["active-b", 2],
    ]);
    expect(result.historical.map((item) => [item.mark.memberId, item.n])).toEqual([["old-mark", 0]]);
  });
});

describe("monthly filling order", () => {
  const rows = [row("low", 1), row("high", 2), row("vip3", 3), row("vip1", 4), row("out", 5), row("missing", 6)];
  rows[0].mark.priority = 1;
  rows[2].mark.vipNitro = 3;
  rows[3].mark.vipNitro = 1;
  rows[2].mark.vipRegular = 1;
  rows[3].mark.vipRegular = 3;
  const person = (id: string, points: number): PriorityPerson => ({
    memberId: id, nick: id, avatarUrl: null, redParty: true, team50: true, hasActiveProfile: true,
    plays: ["nitro", "regular"], vipNitro: 0, vipRegular: 0,
    excludedNitro: id === "out", excludedRegular: false,
    entries: [{ id, month: "2026-10-01", variant: "regular", part: 1, values: [{ limit: "100", tournaments: points }] }],
  });
  const source: PrioritySource = { periodStart: "2026-11-01", today: "2026-11-03", lastMonthEntries: 20, revision: "test", canManage: false,
    people: [person("low", 1), person("high", 100), person("vip3", 0), person("vip1", 0), person("out", 999)] };
  it("puts VIPs first by number, then weighted distance; ignores old grid_priority", () => {
    const original = structuredClone(rows);
    expect(orderRosterRows(rows, source, "nitro").map((p) => [p.mark.memberId, p.n])).toEqual([
      ["vip1", 1], ["vip3", 2], ["high", 3], ["low", 4], ["missing", 5], ["out", 0],
    ]);
    expect(rows).toEqual(original);
  });
  it("has independent VIP and exclusion settings for Regular", () => {
    expect(orderRosterRows(rows, source, "regular").map((p) => p.mark.memberId)).toEqual(["vip3", "vip1", "out", "high", "low", "missing"]);
  });
  it("uses the selected period and breaks zero-point ties by nick", () => {
    const named = rows.slice(0, 2).map((p) => ({ ...p, mark: { ...p.mark, discord: p.mark.memberId === "low" ? "Alpha" : "Zulu" } }));
    expect(orderRosterRows(named, source, "nitro").map((p) => p.mark.memberId)).toEqual(["high", "low"]);
    expect(orderRosterRows(named, { ...source, periodStart: "2026-08-01" }, "nitro").map((p) => p.mark.memberId)).toEqual(["low", "high"]);
  });
});
