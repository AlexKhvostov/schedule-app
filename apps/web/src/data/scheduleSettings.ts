import { getSupabase } from "./client";

export type ClubGridSettings = {
  allowOverwriteMarks: boolean;
  allowReplaceMarks: boolean;
  countTables: boolean;
};

const EMPTY: ClubGridSettings = { allowOverwriteMarks: false, allowReplaceMarks: false, countTables: false };

export async function loadScheduleSettings(): Promise<ClubGridSettings> {
  const db = getSupabase();
  if (!db) return EMPTY;
  const { data } = await db
    .from("schedule_settings")
    .select("allow_overwrite_marks, allow_replace_marks, count_tables")
    .eq("id", true)
    .maybeSingle();
  return {
    allowOverwriteMarks: Boolean(data?.allow_overwrite_marks),
    allowReplaceMarks: Boolean(data?.allow_replace_marks),
    countTables: Boolean(data?.count_tables),
  };
}

export async function loadOverwriteMarks(): Promise<boolean> {
  return (await loadScheduleSettings()).allowOverwriteMarks;
}

export async function saveOverwriteMarks(value: boolean) {
  return saveScheduleFlag("allow_overwrite_marks", value);
}

export async function saveCountTables(value: boolean) {
  return saveScheduleFlag("count_tables", value);
}

export async function saveReplaceMarks(value: boolean) {
  return saveScheduleFlag("allow_replace_marks", value);
}

async function saveScheduleFlag(
  column: "allow_overwrite_marks" | "allow_replace_marks" | "count_tables",
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
