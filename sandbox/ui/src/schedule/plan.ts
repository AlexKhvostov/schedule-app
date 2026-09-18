import { capAt, defaultHourCaps, type HourCaps } from "./capacity";
import { MARKS, ME, type Mark } from "./marks";

export type Seat = Mark | null;
export type Occupancy = Seat[][][];

export const LEVEL_COUNT = 2;

export function daysInMonth(year: number, monthIndex: number, locale: string) {
  const loc = locale.startsWith("en") ? "en-US" : "ru-RU";
  const list: { d: number; wd: string; weekend: boolean }[] = [];
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(year, monthIndex, d);
    const dow = dt.getDay();
    list.push({
      d,
      wd: dt.toLocaleDateString(loc, { weekday: "short" }).replace(".", ""),
      weekend: dow === 0 || dow === 6,
    });
  }
  return list;
}

export function capFor(halfIndex: number, hours: HourCaps = defaultHourCaps()) {
  return capAt(hours, halfIndex);
}

export function isNightHalf(halfIndex: number, hours?: HourCaps) {
  return capFor(halfIndex, hours) > 1;
}

export function levelAllowed(halfIndex: number, level: number, hours: HourCaps = defaultHourCaps()) {
  return level < capFor(halfIndex, hours);
}

export function seatsOf(cell: Seat[] | undefined, size = 2): Seat[] {
  const c = cell ?? [];
  const n = Math.max(size, c.length, 2);
  return Array.from({ length: n }, (_, i) => c[i] ?? null);
}

export function occupiedCount(cell: Seat[] | undefined) {
  return (cell ?? []).filter(Boolean).length;
}

/** Клик по классической ячейке или по конкретному уровню. */
export function toggleSeat(
  cell: Seat[] | undefined,
  me: Mark,
  half: number,
  level?: number,
  hours: HourCaps = defaultHourCaps(),
): Seat[] {
  const cap = capFor(half, hours);
  const size = Math.max(cap, level !== undefined ? level + 1 : 0, cell?.length ?? 0, 2);
  const seats = seatsOf(cell, size);
  const mine = seats.findIndex((s) => s?.t === me.t);

  if (level !== undefined) {
    if (!levelAllowed(half, level, hours)) return seats;
    if (mine === level) {
      seats[level] = null;
      return seats;
    }
    if (seats[level]) return seats;
    if (mine >= 0) seats[mine] = null;
    seats[level] = { ...me };
    return seats;
  }

  if (mine >= 0) {
    seats[mine] = null;
    return seats;
  }
  const empty = seats.findIndex((_, i) => !seats[i] && i < cap);
  if (empty >= 0) seats[empty] = { ...me };
  return seats;
}

function paint(occupied: Seat[][], start: number, len: number, mark: Mark) {
  for (let j = 0; j < len; j += 1) {
    const i = start + j;
    if (i >= 0 && i < 48) occupied[i] = [mark, occupied[i]?.[1] ?? null];
  }
}

const MINE: Record<string, { days: number[]; start: number; len: number }[]> = {
  "25": [{ days: [2, 16, 30], start: 16, len: 6 }],
  "50": [{ days: [3, 8, 14, 18, 25], start: 20, len: 8 }],
  "100": [{ days: [5, 12, 18, 22], start: 28, len: 6 }],
  "250": [{ days: [7, 19], start: 8, len: 4 }],
  "500": [{ days: [11, 27], start: 36, len: 6 }],
};

export function planMonth(year: number, monthIndex: number, limit = "50"): Occupancy {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const day = i + 1;
    const occupied: Seat[][] = Array.from({ length: 48 }, () => [null, null]);
    paint(occupied, (day * 2) % 6, 6, MARKS[day % MARKS.length]);
    paint(occupied, 10 + (day % 5), 8, MARKS[(day + 1) % MARKS.length]);
    paint(occupied, 22 + (day % 4), 6, MARKS[(day + 2) % MARKS.length]);
    paint(occupied, 32 + (day % 3), 8, MARKS[(day + 3) % MARKS.length]);
    paint(occupied, 44, 4, MARKS[(day + 4) % MARKS.length]);
    for (const rule of MINE[limit] ?? []) {
      if (rule.days.includes(day)) paint(occupied, rule.start, rule.len, ME);
    }
    for (let half = 0; half < 48; half += 1) {
      if (occupied[half][0] && capFor(half) === 2 && (day + half) % 5 === 0) {
        const extra = MARKS[(day + 5) % MARKS.length];
        if (extra.t !== occupied[half][0]?.t && extra.t !== ME.t) occupied[half] = [occupied[half][0], extra];
      }
    }
    return occupied;
  });
}
