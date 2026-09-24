import { LIMIT_OPTIONS } from "../schedule/capacity";

const KEY = "v2-schedule-prefs";

export type SchedulePrefs = {
  limits: string[];
  kind: "nitro" | "regular";
  month: "now" | "pin";
  pin: string;
  editPulse: boolean;
  showExtraTz: boolean;
  busyHint: boolean;
};

export const PREFS_EVENT = "v2-schedule-prefs";

export const DEFAULT_PREFS: SchedulePrefs = {
  limits: ["50"],
  kind: "nitro",
  month: "now",
  pin: "",
  editPulse: true,
  showExtraTz: true,
  busyHint: false,
};

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function loadPrefs(): SchedulePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<SchedulePrefs>;
    const limits = (parsed.limits ?? []).filter((item) => LIMIT_OPTIONS.includes(item as (typeof LIMIT_OPTIONS)[number]));
    return {
      limits: limits.length ? limits : [...DEFAULT_PREFS.limits],
      kind: parsed.kind === "regular" ? "regular" : "nitro",
      month: "now",
      pin: "",
      editPulse: parsed.editPulse !== false,
      showExtraTz: parsed.showExtraTz !== false,
      busyHint: parsed.busyHint === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(next: SchedulePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_EVENT));
}

export function cursorFromPrefs(_prefs?: SchedulePrefs, now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function pinFromDate(date: Date) {
  return ym(date);
}
