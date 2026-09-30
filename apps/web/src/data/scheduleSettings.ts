import { getSupabase } from "./client";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { isDevSandboxEnabled } from "./config";

export type ScheduleFilterLimits = {
  nitro: string[];
  regular: string[];
};

export type ClubGridSettings = {
  allowOverwriteMarks: boolean;
  allowActAs: boolean;
  countTables: boolean;
  editByButton: boolean;
  mergeAdjacentSlots: boolean;
  filterLimits: ScheduleFilterLimits;
};

const EMPTY: ClubGridSettings = {
  allowOverwriteMarks: false,
  allowActAs: false,
  countTables: false,
  editByButton: true,
  mergeAdjacentSlots: false,
  filterLimits: { nitro: [...LIMIT_OPTIONS], regular: [...LIMIT_OPTIONS] },
};

const DEMO_STORAGE_KEY = "redparty.demo.schedule-settings.v1";
const DEMO_SETTINGS_EVENT = "redparty:demo-schedule-settings";

function copySettings(settings: ClubGridSettings): ClubGridSettings {
  return {
    ...settings,
    filterLimits: {
      nitro: [...settings.filterLimits.nitro],
      regular: [...settings.filterLimits.regular],
    },
  };
}

function loadDemoScheduleSettings() {
  if (typeof localStorage === "undefined") return copySettings(EMPTY);
  try {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? "null") as Partial<ClubGridSettings> | null;
    if (!stored || typeof stored !== "object") return copySettings(EMPTY);
    return {
      allowOverwriteMarks: Boolean(stored.allowOverwriteMarks),
      allowActAs: Boolean(stored.allowActAs),
      countTables: Boolean(stored.countTables),
      editByButton: stored.editByButton !== false,
      mergeAdjacentSlots: Boolean(stored.mergeAdjacentSlots),
      filterLimits: {
        nitro: normalizeScheduleFilterLimits(stored.filterLimits?.nitro),
        regular: normalizeScheduleFilterLimits(stored.filterLimits?.regular),
      },
    };
  } catch {
    return copySettings(EMPTY);
  }
}

function saveDemoScheduleSettings(settings: ClubGridSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(DEMO_SETTINGS_EVENT));
}

type ScheduleSettingsRow = {
  allow_overwrite_marks?: unknown;
  allow_act_as?: unknown;
  count_tables?: unknown;
  edit_by_button?: unknown;
  merge_adjacent_slots?: unknown;
  filter_limits_nitro?: unknown;
  filter_limits_regular?: unknown;
} | null | undefined;

export function clubGridSettingsFromRow(data: ScheduleSettingsRow): ClubGridSettings {
  return {
    allowOverwriteMarks: Boolean(data?.allow_overwrite_marks),
    allowActAs: Boolean(data?.allow_act_as),
    countTables: Boolean(data?.count_tables),
    editByButton: data?.edit_by_button !== false,
    mergeAdjacentSlots: Boolean(data?.merge_adjacent_slots),
    filterLimits: {
      nitro: normalizeScheduleFilterLimits(data?.filter_limits_nitro),
      regular: normalizeScheduleFilterLimits(data?.filter_limits_regular),
    },
  };
}

export function normalizeScheduleFilterLimits(value: unknown) {
  if (!Array.isArray(value)) return [...LIMIT_OPTIONS];
  const found = [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && LIMIT_OPTIONS.includes(item as (typeof LIMIT_OPTIONS)[number]),
      ),
    ),
  ];
  return found.length ? found : [...LIMIT_OPTIONS];
}

export function toggleScheduleFilterLimit(
  current: ScheduleFilterLimits,
  variant: keyof ScheduleFilterLimits,
  limit: string,
) {
  const selected = current[variant];
  if (selected.includes(limit) && selected.length === 1) return current;
  const next = selected.includes(limit)
    ? selected.filter((value) => value !== limit)
    : LIMIT_OPTIONS.filter((value) => selected.includes(value) || value === limit);
  return { ...current, [variant]: next };
}

export async function loadScheduleSettings(): Promise<ClubGridSettings> {
  if (isDevSandboxEnabled()) return loadDemoScheduleSettings();
  const db = getSupabase();
  if (!db) return copySettings(EMPTY);
  const { data } = await db
    .from("schedule_settings")
    .select("allow_overwrite_marks, allow_act_as, count_tables, edit_by_button, merge_adjacent_slots, filter_limits_nitro, filter_limits_regular")
    .eq("id", true)
    .maybeSingle();
  return clubGridSettingsFromRow(data);
}

export async function saveScheduleFilterLimits(next: ScheduleFilterLimits) {
  if (isDevSandboxEnabled()) {
    const current = loadDemoScheduleSettings();
    saveDemoScheduleSettings({
      ...current,
      filterLimits: {
        nitro: normalizeScheduleFilterLimits(next.nitro),
        regular: normalizeScheduleFilterLimits(next.regular),
      },
    });
    return { error: undefined };
  }
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("save_schedule_filter_limits", {
    p_nitro: next.nitro,
    p_regular: next.regular,
  });
  return { error: error?.message };
}

export async function saveOverwriteMarks(value: boolean) {
  return saveScheduleFlag("allow_overwrite_marks", value);
}

export async function saveCountTables(value: boolean) {
  return saveScheduleFlag("count_tables", value);
}

export async function saveActAs(value: boolean) {
  return saveScheduleFlag("allow_act_as", value);
}

export async function saveEditByButton(value: boolean) {
  return saveScheduleFlag("edit_by_button", value);
}

export async function saveMergeAdjacentSlots(value: boolean) {
  return saveScheduleFlag("merge_adjacent_slots", value);
}

async function saveScheduleFlag(
  column: "allow_overwrite_marks" | "allow_act_as" | "count_tables" | "edit_by_button" | "merge_adjacent_slots",
  value: boolean,
) {
  if (isDevSandboxEnabled()) {
    const current = loadDemoScheduleSettings();
    const keys = {
      allow_overwrite_marks: "allowOverwriteMarks",
      allow_act_as: "allowActAs",
      count_tables: "countTables",
      edit_by_button: "editByButton",
      merge_adjacent_slots: "mergeAdjacentSlots",
    } as const;
    saveDemoScheduleSettings({ ...current, [keys[column]]: value });
    return { error: undefined };
  }
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("schedule_settings").update({ [column]: value }).eq("id", true);
  return { error: error?.message };
}

export function subscribeScheduleSettings(onChange: () => void) {
  if (isDevSandboxEnabled()) {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(DEMO_SETTINGS_EVENT, onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DEMO_SETTINGS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db
    .channel("schedule-settings")
    .on("postgres_changes", { event: "*", schema: "public", table: "schedule_settings" }, onChange)
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
