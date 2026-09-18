export const CET = "Europe/Madrid";
export const PLAYER_TZ = "Europe/Moscow";

export type CetStamp = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  half: number;
  slotProgress: number;
};

function part(parts: Intl.DateTimeFormatPart[], type: string) {
  return Number(parts.find((item) => item.type === type)?.value ?? 0);
}

export function tzHour(now: Date, timeZone: string) {
  return part(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now),
    "hour",
  );
}

export function formatClock(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

export function formatHm(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function hourRange(start: number) {
  const end = start + 1;
  return `${start}–${end}`;
}

/** Сдвиг часов игрока относительно CET (в сентябре к CEST обычно +1). */
export function playerHourOffset(now = new Date()) {
  const cet = tzHour(now, CET);
  const local = tzHour(now, PLAYER_TZ);
  return (local - cet + 24) % 24;
}

export function playerHourRange(cetHour: number, offset: number) {
  return hourRange((cetHour + offset) % 24);
}

export function readCet(now = new Date()): CetStamp {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CET,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  const half = hour * 2 + (minute >= 30 ? 1 : 0);
  const into = (minute % 30) + second / 60;
  return {
    year: part(parts, "year"),
    monthIndex: part(parts, "month") - 1,
    day: part(parts, "day"),
    hour,
    minute,
    second,
    half,
    slotProgress: into / 30,
  };
}

export function isPastDay(year: number, monthIndex: number, day: number, cet: CetStamp) {
  if (year !== cet.year || monthIndex !== cet.monthIndex) {
    if (year < cet.year) return true;
    if (year > cet.year) return false;
    return monthIndex < cet.monthIndex;
  }
  return day < cet.day;
}

export function isPastSlot(year: number, monthIndex: number, day: number, half: number, cet: CetStamp) {
  if (year !== cet.year || monthIndex !== cet.monthIndex) {
    if (year < cet.year) return true;
    if (year > cet.year) return false;
    return monthIndex < cet.monthIndex;
  }
  if (day < cet.day) return true;
  if (day > cet.day) return false;
  return half < cet.half;
}

export function isNowSlot(year: number, monthIndex: number, day: number, half: number, cet: CetStamp) {
  return year === cet.year && monthIndex === cet.monthIndex && day === cet.day && half === cet.half;
}
