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

export function tzFromUtcOffset(offset: number) {
  const sign = offset <= 0 ? "+" : "-";
  return `Etc/GMT${sign}${Math.abs(offset)}`;
}

export const UTC_OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12);

export function utcLabel(offset: number) {
  if (offset === 0) return "UTC±0";
  return `UTC${offset > 0 ? "+" : ""}${offset}`;
}

const PLAYER_UTC_KEY = "v2-player-utc";
export const PLAYER_UTC_EVENT = "v2-player-utc";

export function clampUtcOffset(value: number) {
  if (!Number.isFinite(value)) return 3;
  return Math.min(14, Math.max(-12, Math.round(value)));
}

export function loadPlayerUtc() {
  if (typeof window === "undefined") return 3;
  try {
    const n = Number(window.localStorage.getItem(PLAYER_UTC_KEY));
    if (Number.isFinite(n)) return clampUtcOffset(n);
  } catch {
    /* quota */
  }
  return 3;
}

export function savePlayerUtc(offset: number) {
  const next = clampUtcOffset(offset);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(PLAYER_UTC_KEY, String(next));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(PLAYER_UTC_EVENT));
  return next;
}

export function hourOffsetFromUtc(offset: number, now = new Date()) {
  const cet = tzHour(now, CET);
  const local = tzHour(now, tzFromUtcOffset(offset));
  return (local - cet + 24) % 24;
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

/** Сдвиг часов игрока относительно CET. Пояс берём из профиля, не жёстко Москву. */
export function playerHourOffset(now = new Date(), utc = loadPlayerUtc()) {
  return hourOffsetFromUtc(utc, now);
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
