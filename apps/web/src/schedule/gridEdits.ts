import type { Mark } from "./marks";
import type { Occupancy } from "./plan";

export type GridEdit = {
  dayIdx: number;
  half: number;
  level: number;
  before: Mark | null;
  after: Mark | null;
};

function sameSeat(a: Mark | null, b: Mark | null) {
  if (!a || !b) return a === b;
  return (a.memberId ?? a.t) === (b.memberId ?? b.t) && a.t === b.t && a.tables === b.tables;
}

/** A gesture changes seats, never the unrelated cells of its old month snapshot. */
export function gridEdits(before: Occupancy, after: Occupancy): GridEdit[] {
  const edits: GridEdit[] = [];
  after.forEach((row, dayIdx) => row.forEach((cell, half) => {
    const previous = before[dayIdx]?.[half] ?? [];
    for (let level = 0; level < Math.max(previous.length, cell.length); level += 1) {
      const oldSeat = previous[level] ?? null;
      const newSeat = cell[level] ?? null;
      if (!sameSeat(oldSeat, newSeat)) edits.push({ dayIdx, half, level, before: oldSeat, after: newSeat });
    }
  }));
  return edits;
}

export function applyGridEdits(grid: Occupancy, edits: readonly GridEdit[]): Occupancy {
  const next = grid.slice();
  const rows = new Set<number>();
  const cells = new Set<string>();
  for (const edit of edits) {
    if (!next[edit.dayIdx]?.[edit.half]) continue;
    if (!rows.has(edit.dayIdx)) {
      next[edit.dayIdx] = next[edit.dayIdx].slice();
      rows.add(edit.dayIdx);
    }
    const key = `${edit.dayIdx}:${edit.half}`;
    if (!cells.has(key)) {
      next[edit.dayIdx][edit.half] = next[edit.dayIdx][edit.half].slice();
      cells.add(key);
    }
    const cell = next[edit.dayIdx][edit.half];
    while (cell.length <= edit.level) cell.push(null);
    cell[edit.level] = edit.after;
  }
  return next;
}
