import type { ScheduleQuery } from "./query.ts";
import type { ScheduleRow, ScheduleSnapshot } from "./types.ts";
import { addDays, SCHEDULE_TIMEZONE, timeResolver } from "./time.ts";

export function scheduleResponse(query: ScheduleQuery, snapshot: ScheduleSnapshot) {
  if (snapshot.rows.length > 1000) throw new Error("invalid_snapshot");
  const resolveTime = timeResolver();
  const toSlot = (row: ScheduleRow) => {
    const time = resolveTime(row.date, row.half);
    return {
      start: time.start_local.slice(11, 16),
      end: row.half === 47 ? "24:00" : time.end_local.slice(11, 16),
      ...(time.time_resolution === "exact" ? {} : { time_resolution: time.time_resolution }),
      tables: row.tables,
      mark: {
        text: row.mark.text,
        background: row.mark.background,
        foreground: row.mark.foreground,
      },
      owner: {
        discord_id: row.owner.discord_id,
        name: row.owner.discord_guild_nick?.trim() || row.owner.discord_global_name?.trim() ||
          row.owner.discord_username?.trim() || row.owner.display_name,
      },
    };
  };
  type Line = {
    id: string;
    number: number;
    variant: string;
    limit: string;
    slots: ReturnType<typeof toSlot>[];
  };
  const days = Array.from({ length: query.days }, (_, n) => ({
    date: addDays(query.date, n),
    lines: [] as Line[],
  }));
  const byDate = new Map(days.map((day) => [day.date, new Map<string, Line>()]));
  const rows = [...snapshot.rows].sort((a, b) =>
    a.date.localeCompare(b.date) || a.variant.localeCompare(b.variant) ||
    a.limit_sort - b.limit_sort || a.kind_id.localeCompare(b.kind_id) ||
    a.level - b.level || a.half - b.half || a.id.localeCompare(b.id)
  );
  for (const row of rows) {
    const lines = byDate.get(row.date);
    if (
      !lines || !Number.isInteger(row.half) || row.half < 0 || row.half > 47 ||
      !Number.isInteger(row.level) || row.level < 0 || row.level > 5 ||
      (query.variant !== null && query.variant !== row.variant) ||
      (query.limit !== null && query.limit !== row.limit)
    ) throw new Error("invalid_snapshot");
    const id = `${row.kind_id}:${row.level}`;
    let line = lines.get(id);
    if (!line) {
      line = {
        id,
        number: row.level + 1,
        variant: row.variant,
        limit: row.limit,
        slots: [],
      };
      lines.set(id, line);
    }
    line.slots.push(toSlot(row));
  }
  for (const day of days) day.lines = [...byDate.get(day.date)!.values()];
  return {
    api_version: "1",
    timezone: SCHEDULE_TIMEZONE,
    date_from: query.date,
    date_to: addDays(query.date, query.days - 1),
    days_count: query.days,
    slot_minutes: 30,
    filters: { limit: query.limit, variant: query.variant },
    generated_at: snapshot.generated_at,
    slots_count: rows.length,
    pagination: snapshot.pagination,
    days,
  };
}
