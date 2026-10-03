import { describe, expect, it } from "vitest";
import type { Mark } from "./marks";
import { groupRosterRows, type RosterRow } from "./roster";

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
