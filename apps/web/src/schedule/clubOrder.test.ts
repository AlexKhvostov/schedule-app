import { describe, expect, it } from "vitest";
import { applyClubOrderPositions, clubOrderPositions, compareClubOrder, moveClubOrder, moveClubOrderTo, reconcileClubOrder, validClubOrder } from "./clubOrder";

describe("club positions", () => {
  const keys = [{ memberId: "a", key: 103 }, { memberId: "b", key: 105 }, { memberId: "c", key: 200 }];
  const rows = clubOrderPositions(keys);
  it("projects dense global positions independently of private gaps and filters", () => {
    expect(rows.map(row => row.number)).toEqual([1, 2, 3]);
    expect(rows.filter(row => row.memberId === "c")).toEqual([{ memberId: "c", number: 3 }]);
    expect(keys.map(row => row.key)).toEqual([103, 105, 200]);
  });
  it("removes a member without rewriting neighbours and appends returning members", () => {
    const removed = reconcileClubOrder(keys, ["a", "c"]);
    expect(removed).toEqual([keys[0], keys[2]]);
    expect(clubOrderPositions(removed).map(row => row.number)).toEqual([1, 2]);
    const returned = reconcileClubOrder(removed, ["a", "b", "c", "d"]);
    expect(returned).toEqual([keys[0], keys[2], { memberId: "b", key: 201 }, { memberId: "d", key: 202 }]);
  });
  it("swaps neighbours, respects boundaries and does not mutate the source", () => {
    expect(moveClubOrder(rows, "b", -1)).toEqual([{ memberId: "b", number: 1 }, { memberId: "a", number: 2 }, rows[2]]);
    expect(moveClubOrder(rows, "a", -1)).toEqual(rows);
    expect(moveClubOrder(rows, "c", 1)).toEqual(rows);
    expect(rows[0]).toEqual({ memberId: "a", number: 1 });
    expect(moveClubOrderTo(rows, "a", 3).map(row => row.memberId)).toEqual(["b", "c", "a"]);
  });
  it("moves 171 to 50, reusing keys and changing exactly the affected interval", () => {
    const original = Array.from({ length: 171 }, (_, i) => ({ memberId: String(i + 1), key: (i + 1) * 10 }));
    const positions = clubOrderPositions(original);
    const moved = moveClubOrderTo(positions, "171", 50);
    const saved = applyClubOrderPositions(original, moved);
    expect(saved.slice(0, 49)).toEqual(original.slice(0, 49));
    expect(saved[49]).toEqual({ memberId: "171", key: 500 });
    expect(moved.slice(50).map(row => row.memberId)).toEqual(positions.slice(49, 170).map(row => row.memberId));
    expect(saved.filter(row => row.key !== original.find(old => old.memberId === row.memberId)!.key)).toHaveLength(122);
    expect(saved.map(row => row.key)).toEqual(original.map(row => row.key));
    expect(applyClubOrderPositions(saved, moveClubOrderTo(moved, "171", 171))).toEqual(original);
  });
  it("accepts only a complete permutation of positions and the same members", () => {
    expect(validClubOrder(rows)).toBe(true);
    for (const number of [0, -1, NaN, 2.5, 4, 1]) {
      expect(validClubOrder([rows[0], { ...rows[1], number }, rows[2]])).toBe(false);
    }
    expect(validClubOrder([rows[0], { memberId: "a", number: 2 }, rows[2]])).toBe(false);
    expect(() => applyClubOrderPositions(keys, rows.slice(0, 2))).toThrow("club-order-invalid");
    expect(() => applyClubOrderPositions(keys, [{ memberId: "x", number: 1 }, ...rows.slice(1)])).toThrow("club-order-invalid");
    for (const target of [0, 4, 1.5, NaN]) expect(moveClubOrderTo(rows, "a", target)).toEqual(rows);
    expect(moveClubOrderTo(rows, "missing", 1)).toEqual(rows);
  });
  it("keeps people outside RedParty after positioned members", () => {
    expect(compareClubOrder(null, 3)).toBeGreaterThan(0);
    expect(compareClubOrder(2, 3)).toBeLessThan(0);
    expect(compareClubOrder(undefined, null)).toBe(0);
  });
});
