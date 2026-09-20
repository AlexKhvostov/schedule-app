import { hoursOf, lanesForDay, weekdayOf, type CapacityMap, type HourCaps } from "./capacity";
import { capFor, levelAllowed, occupiedCount, seatsOf, type Occupancy } from "./plan";
import { isPastSlot, type CetStamp } from "./cet";

export type FieldFill = {
  limit: string;
  seats: number;
  taken: number;
  pct: number;
  futureSeats: number;
  futureTaken: number;
  futurePct: number;
};

export function fieldFill(
  grid: Occupancy,
  year: number,
  monthIndex: number,
  cet: CetStamp,
  limit: string,
  hours?: HourCaps,
  capacity?: CapacityMap,
): FieldFill {
  let seats = 0;
  let taken = 0;
  let futureSeats = 0;
  let futureTaken = 0;
  grid.forEach((row, dayIdx) => {
    const dayHours = capacity
      ? hoursOf(capacity, limit, dayIdx + 1, weekdayOf(year, monthIndex, dayIdx + 1))
      : hours;
    row.forEach((cell, half) => {
      const cap = capFor(half, dayHours);
      const used = Math.min(occupiedCount(cell), cap);
      const past = isPastSlot(year, monthIndex, dayIdx + 1, half, cet);
      seats += cap;
      taken += used;
      if (!past) {
        futureSeats += cap;
        futureTaken += used;
      }
    });
  });
  return {
    limit,
    seats,
    taken,
    pct: seats ? taken / seats : 0,
    futureSeats,
    futureTaken,
    futurePct: futureSeats ? futureTaken / futureSeats : 0,
  };
}

export function pctLabel(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

const SLOT_COUNT = 48;

/** Доля занятых открытых слотов в каждом получасе CET по всему месяцу и видимым линиям. */
export function columnFill(
  grids: Record<string, Occupancy>,
  limits: string[],
  capacity: CapacityMap,
  year: number,
  monthIndex: number,
): number[] {
  const open = Array.from({ length: SLOT_COUNT }, () => 0);
  const taken = Array.from({ length: SLOT_COUNT }, () => 0);
  const days = grids[limits[0] ?? ""]?.length ?? 0;
  for (let dayIdx = 0; dayIdx < days; dayIdx++) {
    const day = dayIdx + 1;
    for (const limit of limits) {
      const row = grids[limit]?.[dayIdx] ?? [];
      const hours = hoursOf(capacity, limit, day, weekdayOf(year, monthIndex, day));
      const depth = lanesForDay(capacity, limit, day, year, monthIndex);
      for (let level = 0; level < depth; level++) {
        for (let half = 0; half < SLOT_COUNT; half++) {
          if (!levelAllowed(half, level, hours)) continue;
          open[half] += 1;
          if (seatsOf(row[half], level + 1)[level]) taken[half] += 1;
        }
      }
    }
  }
  return open.map((count, half) => (count ? taken[half] / count : 0));
}
