import { capAt, defaultHourCaps, type HourCaps } from "./capacity";
import { isOwnMark, type Mark } from "./marks";

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
  const mine = seats.findIndex((s) => isOwnMark(s, me));

  if (level !== undefined) {
    if (!levelAllowed(half, level, hours)) {
      if (mine === level) {
        seats[level] = null;
        return seats;
      }
      return seats;
    }
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

export function stampSeat(
  cell: Seat[] | undefined,
  me: Mark,
  half: number,
  level: number,
  mode: "place" | "remove",
  hours: HourCaps = defaultHourCaps(),
): Seat[] {
  const size = Math.max(capFor(half, hours), level + 1, cell?.length ?? 0, 2);
  const seats = seatsOf(cell, size);
  const mine = seats.findIndex((s) => isOwnMark(s, me));
  if (mode === "remove") {
    if (mine === level) seats[level] = null;
    return seats;
  }
  if (!levelAllowed(half, level, hours)) return seats;
  if (seats[level] || mine >= 0) return seats;
  seats[level] = { ...me };
  return seats;
}

export function patchSeat(grid: Occupancy, dayIdx: number, half: number, level: number, seat: Seat): Occupancy {
  return grid.map((row, r) => {
    if (r !== dayIdx) return row;
    return row.map((cell, c) => {
      if (c !== half) return cell;
      const next = seatsOf(cell, Math.max(level + 1, 2));
      next[level] = seat;
      return next;
    });
  });
}

export function emptyMonth(year: number, monthIndex: number): Occupancy {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: last }, () => Array.from({ length: 48 }, () => [null, null] as Seat[]));
}
