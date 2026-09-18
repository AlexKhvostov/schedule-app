import type { Mark } from "./marks";
import { isPastSlot, type CetStamp } from "./cet";
import type { Occupancy } from "./plan";

export type RosterRow = {
  n: number;
  mark: Mark;
  hours: number;
  left: number;
};

export function hoursFromSlots(slots: number) {
  return Math.round((slots / 2) * 10) / 10;
}

export function rosterFromGrid(grid: Occupancy, year: number, monthIndex: number, cet: CetStamp): RosterRow[] {
  const map = new Map<string, { mark: Mark; hours: number; left: number }>();
  grid.forEach((row, dayIdx) => {
    const day = dayIdx + 1;
    row.forEach((cell, half) => {
      const past = isPastSlot(year, monthIndex, day, half, cet);
      cell.forEach((mark) => {
        if (!mark) return;
        const cur = map.get(mark.t) ?? { mark, hours: 0, left: 0 };
        cur.mark = mark;
        cur.hours += 1;
        if (!past) cur.left += 1;
        map.set(mark.t, cur);
      });
    });
  });
  return [...map.values()]
    .sort((a, b) => a.mark.discord.localeCompare(b.mark.discord))
    .map((row, i) => ({
      n: i + 1,
      mark: row.mark,
      hours: hoursFromSlots(row.hours),
      left: hoursFromSlots(row.left),
    }));
}

export function rosterFromGrids(grids: Occupancy[], year: number, monthIndex: number, cet: CetStamp): RosterRow[] {
  const map = new Map<string, { mark: Mark; hours: number; left: number }>();
  for (const grid of grids) {
    for (const row of rosterFromGrid(grid, year, monthIndex, cet)) {
      const cur = map.get(row.mark.t);
      if (!cur) {
        map.set(row.mark.t, { mark: row.mark, hours: row.hours, left: row.left });
        continue;
      }
      cur.hours += row.hours;
      cur.left += row.left;
    }
  }
  return [...map.values()]
    .sort((a, b) => a.mark.discord.localeCompare(b.mark.discord))
    .map((row, i) => ({
      n: i + 1,
      mark: row.mark,
      hours: Math.round(row.hours * 10) / 10,
      left: Math.round(row.left * 10) / 10,
    }));
}
