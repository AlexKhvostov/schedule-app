import { describe, expect, it } from "vitest";
import type { Mark } from "./marks";
import { mergeVisualSlots, type VisualSlot } from "./visualSegments";

const alice: Mark = { t: "AL", discord: "alice", room: "Alice", bg: "#fff", fg: "#000", tables: 8, memberId: "alice" };

function slot(half: number, patch: Partial<VisualSlot> = {}): VisualSlot {
  return { day: 1, half, variant: "nitro", limit: "50", level: 0, mark: alice, ...patch };
}

describe("mergeVisualSlots", () => {
  it("merges consecutive matching half-hours without changing their span", () => {
    expect(mergeVisualSlots([slot(4), slot(5), slot(6)])).toMatchObject([
      { day: 1, startHalf: 4, endHalf: 7, variant: "nitro", limit: "50", level: 0, mark: alice },
    ]);
  });

  it.each([
    ["gap", [slot(4), slot(6)]],
    ["day", [slot(47), slot(0, { day: 2 })]],
    ["variant", [slot(4), slot(5, { variant: "regular" })]],
    ["limit", [slot(4), slot(5, { limit: "100" })]],
    ["level", [slot(4), slot(5, { level: 1 })]],
    ["owner", [slot(4), slot(5, { mark: { ...alice, memberId: "bob" } })]],
    ["tag", [slot(4), slot(5, { mark: { ...alice, t: "AX" } })]],
    ["tables", [slot(4), slot(5, { mark: { ...alice, tables: 10 } })]],
  ])("starts a new segment at a %s boundary", (_name, slots) => {
    expect(mergeVisualSlots(slots)).toHaveLength(2);
  });

  it("returns no segments for an empty lane", () => {
    expect(mergeVisualSlots([])).toEqual([]);
  });
});
