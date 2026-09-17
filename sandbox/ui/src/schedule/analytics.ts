import { capFor } from "./plan";
import { isPastSlot, type CetStamp } from "./cet";
import type { Mark } from "./marks";

export type FieldFill = {
  limit: string;
  seats: number;
  taken: number;
  pct: number;
  futureSeats: number;
  futureTaken: number;
  futurePct: number;
};

export function fieldFill(grid: Mark[][][], year: number, monthIndex: number, cet: CetStamp, limit: string): FieldFill {
  let seats = 0;
  let taken = 0;
  let futureSeats = 0;
  let futureTaken = 0;
  grid.forEach((row, dayIdx) => {
    row.forEach((cell, half) => {
      const cap = capFor(half);
      const used = Math.min(cell.length, cap);
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
