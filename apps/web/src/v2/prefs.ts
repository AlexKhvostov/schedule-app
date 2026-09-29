import { LIMIT_OPTIONS } from "../schedule/capacity";
import { DISPLAY_RANGES, type DisplayRange } from "../schedule/displayRange";
import { DEFAULT_WORK_HOURS, normalizeWorkHours } from "../schedule/workHours";

const KEY = "v2-schedule-prefs";
export const SCHEDULE_PREFS_VERSION = 5;
export const SCHEDULE_KINDS = ["nitro", "regular"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export type SchedulePrefs = {
  version: typeof SCHEDULE_PREFS_VERSION;
  limits: string[];
  kinds: ScheduleKind[];
  month: "now" | "pin";
  pin: string;
  editPulse: boolean;
  showExtraTz: boolean;
  busyHint: boolean;
  dimPast: boolean;
  hidePastDays: boolean;
  displayRange: DisplayRange;
  workStartHalf: number;
  workEndHalf: number;
  hideTables: boolean;
  showTip: boolean;
};

export const PREFS_EVENT = "v2-schedule-prefs";

export const DEFAULT_PREFS: SchedulePrefs = {
  version: SCHEDULE_PREFS_VERSION,
  limits: ["50"],
  kinds: ["nitro"],
  month: "now",
  pin: "",
  editPulse: true,
  showExtraTz: true,
  busyHint: false,
  dimPast: true,
  hidePastDays: false,
  displayRange: "month",
  workStartHalf: DEFAULT_WORK_HOURS.startHalf,
  workEndHalf: DEFAULT_WORK_HOURS.endHalf,
  hideTables: false,
  showTip: true,
};

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function defaults(): SchedulePrefs {
  return { ...DEFAULT_PREFS, limits: [...DEFAULT_PREFS.limits], kinds: [...DEFAULT_PREFS.kinds] };
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeScheduleKinds(value: unknown, legacyKind?: unknown): ScheduleKind[] {
  const selected = new Set(
    (Array.isArray(value) ? value : []).filter((item): item is ScheduleKind =>
      SCHEDULE_KINDS.includes(item as ScheduleKind),
    ),
  );
  if (!selected.size && SCHEDULE_KINDS.includes(legacyKind as ScheduleKind)) selected.add(legacyKind as ScheduleKind);
  const kinds = SCHEDULE_KINDS.filter((kind) => selected.has(kind));
  return kinds.length ? kinds : [...DEFAULT_PREFS.kinds];
}

export function normalizeSchedulePrefs(value: unknown): SchedulePrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults();
  const parsed = value as Record<string, unknown>;
  const rawLimits = Array.isArray(parsed.limits) ? parsed.limits : [];
  const limits = [...new Set(rawLimits)]
    .filter((item): item is string => typeof item === "string" && LIMIT_OPTIONS.includes(item as (typeof LIMIT_OPTIONS)[number]))
    .sort((a, b) => Number(a) - Number(b));
  const workHours = normalizeWorkHours(parsed.workStartHalf, parsed.workEndHalf);
  return {
    version: SCHEDULE_PREFS_VERSION,
    limits: limits.length ? limits : [...DEFAULT_PREFS.limits],
    kinds: normalizeScheduleKinds(parsed.kinds, parsed.kind),
    // Pinned months were retired: the selected month always boots from the current month.
    month: "now",
    pin: "",
    editPulse: booleanOr(parsed.editPulse, DEFAULT_PREFS.editPulse),
    showExtraTz: booleanOr(parsed.showExtraTz, DEFAULT_PREFS.showExtraTz),
    busyHint: booleanOr(parsed.busyHint, DEFAULT_PREFS.busyHint),
    dimPast: booleanOr(parsed.dimPast, DEFAULT_PREFS.dimPast),
    hidePastDays: booleanOr(parsed.hidePastDays, DEFAULT_PREFS.hidePastDays),
    displayRange: DISPLAY_RANGES.includes(parsed.displayRange as DisplayRange)
      ? parsed.displayRange as DisplayRange
      : DEFAULT_PREFS.displayRange,
    workStartHalf: workHours.startHalf,
    workEndHalf: workHours.endHalf,
    hideTables: booleanOr(parsed.hideTables, DEFAULT_PREFS.hideTables),
    showTip: booleanOr(parsed.showTip, DEFAULT_PREFS.showTip),
  };
}

export function parseSchedulePrefs(raw: string | null): SchedulePrefs {
  if (!raw) return defaults();
  try {
    return normalizeSchedulePrefs(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export function loadPrefs(): SchedulePrefs {
  if (typeof window === "undefined") return defaults();
  try {
    return parseSchedulePrefs(window.localStorage.getItem(KEY));
  } catch {
    return defaults();
  }
}

export function savePrefs(next: SchedulePrefs) {
  const normalized = normalizeSchedulePrefs(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(normalized));
  } catch {
    /* quota */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_EVENT));
}

export function resetSchedulePrefs() {
  const next = defaults();
  savePrefs(next);
  return next;
}

export function cursorFromPrefs(_prefs?: SchedulePrefs, now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function pinFromDate(date: Date) {
  return ym(date);
}
