import { getSupabase } from "./client";
import { LIMIT_OPTIONS } from "../schedule/capacity";

export type ScheduleFilterLimits = {
  nitro: string[];
  regular: string[];
};

export type ClubGridSettings = {
  allowOverwriteMarks: boolean;
  allowActAs: boolean;
  countTables: boolean;
  editByButton: boolean;
  filterLimits: ScheduleFilterLimits;
};

const EMPTY: ClubGridSettings = {
  allowOverwriteMarks: false,
  allowActAs: false,
  countTables: false,
  editByButton: true,
  filterLimits: { nitro: [...LIMIT_OPTIONS], regular: [...LIMIT_OPTIONS] },
};

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
  const db = getSupabase();
  if (!db) return EMPTY;
  const { data } = await db
    .from("schedule_settings")
    .select("allow_overwrite_marks, allow_act_as, count_tables, edit_by_button, filter_limits_nitro, filter_limits_regular")
    .eq("id", true)
    .maybeSingle();
  return {
    allowOverwriteMarks: Boolean(data?.allow_overwrite_marks),
    allowActAs: Boolean(data?.allow_act_as),
    countTables: Boolean(data?.count_tables),
    editByButton: data?.edit_by_button !== false,
    filterLimits: {
      nitro: normalizeScheduleFilterLimits(data?.filter_limits_nitro),
      regular: normalizeScheduleFilterLimits(data?.filter_limits_regular),
    },
  };
}

export async function saveScheduleFilterLimits(next: ScheduleFilterLimits) {
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

async function saveScheduleFlag(
  column: "allow_overwrite_marks" | "allow_act_as" | "count_tables" | "edit_by_button",
  value: boolean,
) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("schedule_settings").update({ [column]: value }).eq("id", true);
  return { error: error?.message };
}

export function subscribeScheduleSettings(onChange: () => void) {
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
