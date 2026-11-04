import { emptyMonth } from "./plan";
import type { Mark } from "./marks";
import { monthGridKey, type MonthGridStore } from "../data/slots";
import type { ScheduleSnapshot, SnapshotRequest } from "../data/scheduleSnapshot";

/** Replace complete affected days (including empty ones); preserve other grids by reference. */
export function mergeScheduleSnapshot(base: MonthGridStore, data: ScheduleSnapshot, request: SnapshotRequest): MonthGridStore {
  const kinds = new Map(data.kinds.map((kind) => [kind.id, monthGridKey(kind.variant_id, kind.limit_id)]));
  let next = { ...base };
  if (!request.directoryOnly) {
    const blank = emptyMonth(data.year, data.month - 1);
    if (request.targets === null) {
      next = Object.fromEntries([...new Set([...Object.keys(base), ...kinds.values()])].map((key) => [key, emptyMonth(data.year, data.month - 1)]));
    } else for (const target of request.targets) {
      const key = kinds.get(target.kind_id);
      const day = Number(target.date.slice(8)) - 1;
      if (!key || !blank[day]) throw new Error("unknown schedule target");
      next[key] = (next[key] ?? blank).slice();
      next[key][day] = blank[day].map(() => []);
    }
    const allowed = request.targets && new Set(request.targets.map((target) => `${target.kind_id}:${Number(target.date.slice(8))}`));
    for (const slot of data.slots) {
      if (allowed && !allowed.has(`${slot.kind_id}:${slot.day}`)) throw new Error("unexpected schedule target");
      const key = kinds.get(slot.kind_id)!;
      const cell = next[key][slot.day - 1][slot.half];
      while (cell.length <= slot.level) cell.push(null);
      cell[slot.level] = { ...data.members[slot.member_id], tables: slot.tables };
    }
  }
  // A name/colour update changes the shared face, but never the tables recorded for a seat.
  const sameFace = (before: Mark, face: Mark) => Object.entries(face).every(([key, value]) => key === "tables" || before[key as keyof Mark] === value);
  for (const [key, grid] of Object.entries(next)) {
    let changed = false;
    const patched = grid.map((day) => {
      let dayChanged = false;
      const row = day.map((cell) => {
        if (!cell.some((mark) => mark?.memberId && data.members[mark.memberId] && !sameFace(mark, data.members[mark.memberId]))) return cell;
        changed = dayChanged = true;
        return cell.map((mark) => mark?.memberId && data.members[mark.memberId] ? { ...data.members[mark.memberId], tables: mark.tables } : mark);
      });
      return dayChanged ? row : day;
    });
    if (changed) next[key] = patched;
  }
  return next;
}
