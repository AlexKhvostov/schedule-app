import { LIMIT_OPTIONS } from "../schedule/capacity";
import { planMonth, type Occupancy } from "../schedule/plan";
import { hoursFromSlots } from "../schedule/roster";
import { isPastSlot, type CetStamp } from "../schedule/cet";

export type ShiftRun = {
  day: number;
  limit: string;
  start: number;
  end: number;
};

export function gridsForCalendar(grids: Record<string, Occupancy>, year: number, monthIndex: number) {
  return Object.fromEntries(
    LIMIT_OPTIONS.map((limit) => [limit, grids[limit] ?? planMonth(year, monthIndex, limit)]),
  ) as Record<string, Occupancy>;
}

/** Одна линия на день: в каждом получасе не больше одного лимита. */
export function myTimeline(grids: Record<string, Occupancy>, tag: string): (string | null)[][] {
  const days = Math.max(0, ...Object.values(grids).map((grid) => grid.length));
  return Array.from({ length: days }, (_, dayIdx) =>
    Array.from({ length: 48 }, (_, half) => {
      for (const limit of LIMIT_OPTIONS) {
        if (grids[limit]?.[dayIdx]?.[half]?.some((mark) => mark?.t === tag)) return limit;
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

export function myShifts(grids: Record<string, Occupancy>, tag: string): ShiftRun[] {
  return myTimeline(grids, tag).flatMap((lane, dayIdx) => runsFromLane(lane, dayIdx + 1));
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
  tag: string,
  year: number,
  monthIndex: number,
  cet: CetStamp,
) {
  const runs = myShifts(grids, tag);
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

export function myHoursMatrix(grids: Record<string, Occupancy>, tag: string) {
  const days = Math.max(0, ...Object.values(grids).map((grid) => grid.length));
  const slots = Array.from({ length: days }, () =>
    Object.fromEntries(LIMIT_OPTIONS.map((limit) => [limit, 0])) as Record<string, number>,
  );
  for (const limit of LIMIT_OPTIONS) {
    const grid = grids[limit];
    if (!grid) continue;
    for (let dayIdx = 0; dayIdx < grid.length; dayIdx += 1) {
      for (const cell of grid[dayIdx] ?? []) {
        if (cell?.some((mark) => mark?.t === tag)) slots[dayIdx][limit] += 1;
      }
    }
  }
  const hours = slots.map((row) =>
    Object.fromEntries(LIMIT_OPTIONS.map((limit) => [limit, hoursFromSlots(row[limit])])) as Record<string, number>,
  );
  const totals = Object.fromEntries(
    LIMIT_OPTIONS.map((limit) => [limit, hoursFromSlots(slots.reduce((sum, row) => sum + row[limit], 0))]),
  ) as Record<string, number>;
  const dayTotals = slots.map((row) => hoursFromSlots(LIMIT_OPTIONS.reduce((sum, limit) => sum + row[limit], 0)));
  const grand = hoursFromSlots(
    slots.reduce((sum, row) => sum + LIMIT_OPTIONS.reduce((acc, limit) => acc + row[limit], 0), 0),
  );
  const countTotals = Object.fromEntries(
    LIMIT_OPTIONS.map((limit) => [limit, slots.reduce((sum, row) => sum + row[limit], 0)]),
  ) as Record<string, number>;
  const countGrand = LIMIT_OPTIONS.reduce((sum, limit) => sum + countTotals[limit], 0);
  return { hours, totals, dayTotals, grand, counts: countTotals, countGrand };
}
