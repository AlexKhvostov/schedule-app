import type { CetStamp } from "./cet";

export const DISPLAY_RANGES = ["day", "threeDays", "sevenDays", "week", "month"] as const;
export type DisplayRange = (typeof DISPLAY_RANGES)[number];

function monthDays(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function daysBetween(start: number, end: number) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

/** Видимые числа месяца. Относительные диапазоны существуют только для текущего месяца CET. */
export function visibleMonthDays(
  year: number,
  monthIndex: number,
  range: DisplayRange,
  cet: Pick<CetStamp, "year" | "monthIndex" | "day">,
) {
  const last = monthDays(year, monthIndex);
  if (year !== cet.year || monthIndex !== cet.monthIndex || range === "month") return daysBetween(1, last);

  const today = Math.min(last, Math.max(1, cet.day));
  if (range === "day") return [today];
  if (range === "threeDays") return daysBetween(today, Math.min(last, today + 2));
  if (range === "sevenDays") return daysBetween(today, Math.min(last, today + 6));

  const weekday = new Date(Date.UTC(year, monthIndex, today)).getUTCDay();
  const monday = today - ((weekday + 6) % 7);
  return daysBetween(Math.max(1, monday), Math.min(last, monday + 6));
}
