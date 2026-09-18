import { LIMIT_OPTIONS } from "../schedule/capacity";
import { planMonth, type Occupancy } from "../schedule/plan";
import { hoursFromSlots } from "../schedule/roster";

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
