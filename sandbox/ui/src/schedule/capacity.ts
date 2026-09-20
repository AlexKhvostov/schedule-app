export const LIMIT_OPTIONS = ["0.25", "0.50", "1", "2", "5", "10", "25", "50", "100", "250", "500"] as const;

export function formatLimit(limit: string) {
  return `${limit.replace(".", ",")} €`;
}

export const MAX_CAP = 6;

export type HourCaps = number[];
export type LimitProfile = {
  hours: HourCaps;
  days: Record<string, HourCaps>;
  weekdays: Record<string, HourCaps>;
  equalize: boolean;
  weekOn: boolean;
  monthOn: boolean;
};
export type CapacityMap = Record<string, LimitProfile>;

export function defaultHourCaps(): HourCaps {
  return Array.from({ length: 24 }, (_, hour) => (hour >= 22 || hour < 6 ? 2 : 1));
}

export function onesHourCaps(): HourCaps {
  return Array.from({ length: 24 }, () => 1);
}

export function resetLimit(capacity: CapacityMap, limit: string): CapacityMap {
  const profile = profileOf(capacity, limit);
  return {
    ...capacity,
    [limit]: {
      hours: defaultHourCaps(),
      days: {},
      weekdays: {},
      equalize: profile.equalize,
      weekOn: true,
      monthOn: true,
    },
  };
}

export function hourRanges(hours: HourCaps) {
  const ranges: { start: number; end: number; cap: number }[] = [];
  let start = 0;
  for (let hour = 1; hour <= 24; hour += 1) {
    if (hour === 24 || hours[hour] !== hours[start]) {
      ranges.push({ start, end: hour, cap: hours[start] ?? 1 });
      start = hour;
    }
  }
  return ranges;
}

export function emptyProfile(): LimitProfile {
  return { hours: defaultHourCaps(), days: {}, weekdays: {}, equalize: false, weekOn: true, monthOn: true };
}

export function defaultCapacity(): CapacityMap {
  return Object.fromEntries(LIMIT_OPTIONS.map((limit) => [limit, emptyProfile()]));
}

export function clampCap(value: number) {
  return Math.min(MAX_CAP, Math.max(1, Math.round(value) || 1));
}

export function normalizeHours(hours?: number[]): HourCaps {
  const next = defaultHourCaps();
  hours?.forEach((value, hour) => {
    if (hour >= 0 && hour < 24) next[hour] = clampCap(value);
  });
  return next;
}

function normalizeMap(raw?: Record<string, number[]>, min = 0, max = 31) {
  const next: Record<string, HourCaps> = {};
  for (const [key, hours] of Object.entries(raw ?? {})) {
    const id = Number(key);
    if (id >= min && id <= max) next[String(id)] = normalizeHours(hours);
  }
  return next;
}

export function normalizeProfile(raw: unknown): LimitProfile {
  if (Array.isArray(raw)) return { ...emptyProfile(), hours: normalizeHours(raw as number[]) };
  const obj = (raw ?? {}) as {
    hours?: number[];
    days?: Record<string, number[]>;
    weekdays?: Record<string, number[]>;
    equalize?: boolean;
    weekOn?: boolean;
    monthOn?: boolean;
  };
  return {
    hours: normalizeHours(obj.hours),
    days: normalizeMap(obj.days, 1, 31),
    weekdays: normalizeMap(obj.weekdays, 0, 6),
    equalize: Boolean(obj.equalize),
    weekOn: obj.weekOn !== false,
    monthOn: obj.monthOn !== false,
  };
}

export function profileOf(capacity: CapacityMap, limit: string): LimitProfile {
  return normalizeProfile(capacity[limit]);
}

export function weekdayOf(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day).getDay();
}

function minHours(a: HourCaps, b: HourCaps): HourCaps {
  return Array.from({ length: 24 }, (_, hour) => Math.min(a[hour] ?? 1, b[hour] ?? 1));
}

export function hoursOf(capacity: CapacityMap, limit: string, day?: number, weekday?: number): HourCaps {
  const profile = profileOf(capacity, limit);
  const byDay = profile.monthOn && day ? profile.days[String(day)] : undefined;
  const byWeek = profile.weekOn && weekday !== undefined ? profile.weekdays[String(weekday)] : undefined;
  if (byDay && byWeek) return minHours(byDay, byWeek);
  if (byDay) return byDay;
  if (byWeek) return byWeek;
  return profile.hours;
}

export function overrideDays(capacity: CapacityMap, limit: string): number[] {
  return Object.keys(profileOf(capacity, limit).days)
    .map(Number)
    .sort((a, b) => a - b);
}

export function overrideWeekdays(capacity: CapacityMap, limit: string): number[] {
  return Object.keys(profileOf(capacity, limit).weekdays)
    .map(Number)
    .sort((a, b) => a - b);
}

export function applyHours(
  capacity: CapacityMap,
  limit: string,
  hours: HourCaps,
  kind: "month" | "week",
  ids: number[],
): CapacityMap {
  const profile = profileOf(capacity, limit);
  const next = normalizeHours(hours);
  if (kind === "week") {
    const weekdays = { ...profile.weekdays };
    for (const id of ids) weekdays[String(id)] = next.slice();
    return { ...capacity, [limit]: { ...profile, weekdays } };
  }
  const days = { ...profile.days };
  for (const id of ids) days[String(id)] = next.slice();
  return { ...capacity, [limit]: { ...profile, days } };
}

export function resetSelected(
  capacity: CapacityMap,
  limit: string,
  kind: "month" | "week",
  ids: number[],
): CapacityMap {
  return applyHours(capacity, limit, defaultHourCaps(), kind, ids);
}

export function applyMatrix(
  capacity: CapacityMap,
  limit: string,
  kind: "month" | "week",
  rows: { id: number; hours: HourCaps }[],
): CapacityMap {
  const profile = profileOf(capacity, limit);
  if (kind === "week") {
    const weekdays = { ...profile.weekdays };
    for (const row of rows) weekdays[String(row.id)] = normalizeHours(row.hours);
    return { ...capacity, [limit]: { ...profile, weekdays } };
  }
  const days = { ...profile.days };
  for (const row of rows) days[String(row.id)] = normalizeHours(row.hours);
  return { ...capacity, [limit]: { ...profile, days } };
}

export function setEqualize(capacity: CapacityMap, limit: string, equalize: boolean): CapacityMap {
  const profile = profileOf(capacity, limit);
  return { ...capacity, [limit]: { ...profile, equalize } };
}

export function setRuleFlags(
  capacity: CapacityMap,
  limit: string,
  flags: { weekOn: boolean; monthOn: boolean },
): CapacityMap {
  const profile = profileOf(capacity, limit);
  return { ...capacity, [limit]: { ...profile, weekOn: flags.weekOn, monthOn: flags.monthOn } };
}

export function maxLevels(hours: HourCaps) {
  return Math.max(1, ...hours);
}

export function slotsOf(hours: HourCaps) {
  return hours.reduce((sum, cap) => sum + cap * 2, 0);
}

export function maxLevelsForLimit(capacity: CapacityMap, limit: string) {
  const profile = profileOf(capacity, limit);
  return Math.max(
    maxLevels(profile.hours),
    ...(profile.monthOn ? Object.values(profile.days).map(maxLevels) : []),
    ...(profile.weekOn ? Object.values(profile.weekdays).map(maxLevels) : []),
  );
}

export function lanesForDay(capacity: CapacityMap, limit: string, day: number, year: number, monthIndex: number) {
  const weekday = weekdayOf(year, monthIndex, day);
  const hours = hoursOf(capacity, limit, day, weekday);
  return profileOf(capacity, limit).equalize ? maxLevelsForLimit(capacity, limit) : maxLevels(hours);
}

export function capAt(hours: HourCaps, halfIndex: number) {
  return hours[Math.floor(halfIndex / 2)] ?? 1;
}

const LIMIT_PAINT: Record<string, string> = {
  "25": "#9CA3AF",
  "50": "#22D3EE",
  "100": "#FBBF24",
  "250": "#A78BFA",
  "500": "#F472B6",
};

export function limitTone(limit: string) {
  if (limit === "25") return "var(--limit-25)";
  if (limit === "50") return "var(--limit-50)";
  if (limit === "100") return "var(--limit-100)";
  if (limit === "250") return "var(--limit-250)";
  if (limit === "500") return "var(--limit-500)";
  return "var(--muted-foreground)";
}

export function limitTonePaint(limit: string) {
  return LIMIT_PAINT[limit] ?? "#C9CDD4";
}

export function loadCapacity(): CapacityMap {
  try {
    const raw = localStorage.getItem("v2-capacity");
    if (!raw) return defaultCapacity();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(LIMIT_OPTIONS.map((limit) => [limit, normalizeProfile(parsed[limit])]));
  } catch {
    return defaultCapacity();
  }
}

export function saveCapacity(capacity: CapacityMap) {
  localStorage.setItem("v2-capacity", JSON.stringify(capacity));
}
