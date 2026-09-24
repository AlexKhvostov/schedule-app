import { getSupabase } from "./client";

export type ClubGridSettings = {
  allowOverwriteMarks: boolean;
  allowActAs: boolean;
  countTables: boolean;
  editByButton: boolean;
};

const EMPTY: ClubGridSettings = {
  allowOverwriteMarks: false,
  allowActAs: false,
  countTables: false,
  editByButton: true,
};

export async function loadScheduleSettings(): Promise<ClubGridSettings> {
  const db = getSupabase();
  if (!db) return EMPTY;
  const { data } = await db
    .from("schedule_settings")
    .select("allow_overwrite_marks, allow_act_as, count_tables, edit_by_button")
    .eq("id", true)
    .maybeSingle();
  return {
    allowOverwriteMarks: Boolean(data?.allow_overwrite_marks),
    allowActAs: Boolean(data?.allow_act_as),
    countTables: Boolean(data?.count_tables),
    editByButton: data?.edit_by_button !== false,
  };
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
