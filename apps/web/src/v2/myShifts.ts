import { LIMIT_OPTIONS } from "../schedule/capacity";
import { isOwnMark, type Mark } from "../schedule/marks";
import { emptyMonth, type Occupancy } from "../schedule/plan";
import { hoursFromSlots } from "../schedule/roster";
import { isPastSlot, type CetStamp } from "../schedule/cet";

export type ShiftRun = {
  day: number;
  limit: string;
  start: number;
  end: number;
};

function seatIsMine(seat: Mark | null | undefined, who: Mark | string) {
  if (typeof who === "string") return Boolean(seat && who && seat.t === who);
  return isOwnMark(seat, who);
}

export function gridsForCalendar(grids: Record<string, Occupancy>, year: number, monthIndex: number) {
  return Object.fromEntries(
    LIMIT_OPTIONS.map((limit) => [limit, grids[limit] ?? emptyMonth(year, monthIndex)]),
  ) as Record<string, Occupancy>;
}

/** Одна линия на день: в каждом получасе не больше одного лимита. */
export function myTimeline(grids: Record<string, Occupancy>, who: Mark | string): (string | null)[][] {
  const days = Math.max(0, ...Object.values(grids).map((grid) => grid.length));
  return Array.from({ length: days }, (_, dayIdx) =>
    Array.from({ length: 48 }, (_, half) => {
      for (const limit of LIMIT_OPTIONS) {
        if (grids[limit]?.[dayIdx]?.[half]?.some((mark) => seatIsMine(mark, who))) return limit;
      }
      return null;
    }),
  );
}

export function runsFromLane(lane: (string | null)[], day: number): ShiftRun[] {
  const runs: ShiftRun[] = [];
  let start = -1;
  let limit = "";
  for (let half = 0; half <= 48; half += 1) {
    const cur = half < 48 ? lane[half] : null;
    if (cur && start < 0) {
      start = half;
      limit = cur;
      continue;
    }
    if (start >= 0 && cur !== limit) {
      runs.push({ day, limit, start, end: half });
      start = cur ? half : -1;
      limit = cur ?? "";
    }
  }
  return runs;
}

export function myShifts(grids: Record<string, Occupancy>, who: Mark | string): ShiftRun[] {
  return myTimeline(grids, who).flatMap((lane, dayIdx) => runsFromLane(lane, dayIdx + 1));
}

export function formatHalf(half: number) {
  const hour = Math.floor(half / 2);
  const minute = half % 2 ? "30" : "00";
  return `${hour}:${minute}`;
}

export function shiftHours(runs: ShiftRun[]) {
  return hoursFromSlots(runs.reduce((sum, run) => sum + (run.end - run.start), 0));
}

export function myPlayStats(
  grids: Record<string, Occupancy>,
  who: Mark | string,
  year: number,
  monthIndex: number,
  cet: CetStamp,
) {
  const runs = myShifts(grids, who);
  let slots = 0;
  let left = 0;
  for (const run of runs) {
    for (let half = run.start; half < run.end; half += 1) {
      slots += 1;
      if (!isPastSlot(year, monthIndex, run.day, half, cet)) left += 1;
    }
  }
  return {
    marks: runs.length,
    hours: hoursFromSlots(slots),
    left: hoursFromSlots(left),
  };
}

export function limitsWithMyMarks(grids: Record<string, Occupancy>, who: Mark | string) {
  return LIMIT_OPTIONS.filter((limit) =>
    (grids[limit] ?? []).some((day) => day.some((cell) => cell?.some((mark) => seatIsMine(mark, who)))),
  );
}

export function myHoursMatrix(
  grids: Record<string, Occupancy>,
  who: Mark | string,
  limits: readonly string[] = LIMIT_OPTIONS,
  at?: { year: number; monthIndex: number; cet: CetStamp },
) {
  const cols = limits.length ? [...limits] : [];
  const days = Math.max(0, ...Object.values(grids).map((grid) => grid.length), ...cols.map((limit) => grids[limit]?.length ?? 0));
  const marks = Array.from({ length: days }, () =>
    Object.fromEntries(cols.map((limit) => [limit, 0])) as Record<string, number>,
  );
  const unique = Array.from({ length: days }, () =>
    Object.fromEntries(cols.map((limit) => [limit, 0])) as Record<string, number>,
  );
  const leftUnique = Array.from({ length: days }, () =>
    Object.fromEntries(cols.map((limit) => [limit, 0])) as Record<string, number>,
  );
  const dayHalves = Array.from({ length: days }, () => new Set<number>());
  const dayLeftHalves = Array.from({ length: days }, () => new Set<number>());
  for (const limit of cols) {
    const grid = grids[limit];
    if (!grid) continue;
    for (let dayIdx = 0; dayIdx < grid.length; dayIdx += 1) {
      (grid[dayIdx] ?? []).forEach((cell, half) => {
        const mine = (cell ?? []).filter((mark) => seatIsMine(mark, who)).length;
        if (!mine) return;
        marks[dayIdx][limit] += mine;
        unique[dayIdx][limit] += 1;
        dayHalves[dayIdx].add(half);
        if (!at || !isPastSlot(at.year, at.monthIndex, dayIdx + 1, half, at.cet)) {
          leftUnique[dayIdx][limit] += 1;
          dayLeftHalves[dayIdx].add(half);
        }
      });
    }
  }
  const hours = unique.map((row) =>
    Object.fromEntries(cols.map((limit) => [limit, hoursFromSlots(row[limit])])) as Record<string, number>,
  );
  const totals = Object.fromEntries(
    cols.map((limit) => [limit, hoursFromSlots(unique.reduce((sum, row) => sum + row[limit], 0))]),
  ) as Record<string, number>;
  const left = Object.fromEntries(
    cols.map((limit) => [limit, hoursFromSlots(leftUnique.reduce((sum, row) => sum + row[limit], 0))]),
  ) as Record<string, number>;
  const leftCounts = Object.fromEntries(
    cols.map((limit) => [limit, leftUnique.reduce((sum, row) => sum + row[limit], 0)]),
  ) as Record<string, number>;
  const dayTotals = dayHalves.map((set) => hoursFromSlots(set.size));
  const grand = hoursFromSlots(dayHalves.reduce((sum, set) => sum + set.size, 0));
  const leftGrand = hoursFromSlots(dayLeftHalves.reduce((sum, set) => sum + set.size, 0));
  const countTotals = Object.fromEntries(
    cols.map((limit) => [limit, marks.reduce((sum, row) => sum + row[limit], 0)]),
  ) as Record<string, number>;
  const countGrand = cols.reduce((sum, limit) => sum + countTotals[limit], 0);
  const leftCountGrand = cols.reduce((sum, limit) => sum + leftCounts[limit], 0);
  return {
    limits: cols,
    hours,
    totals,
    left,
    leftCounts,
    dayTotals,
    grand,
    leftGrand,
    counts: countTotals,
    countGrand,
    leftCountGrand,
  };
}
