import { getSupabase } from "./client";

export type ScheduleVariant = "nitro" | "regular";

export type DeadTimeInterval = {
  id: string;
  variant: ScheduleVariant;
  limit: string;
  startHalf: number;
  endHalf: number;
};

type DeadTimeRow = {
  id?: unknown;
  variant_id?: unknown;
  limit_id?: unknown;
  start_half?: unknown;
  end_half?: unknown;
};

export type DeadTimeValidationError = "bounds" | "overlap";

export function deadTimeIntervalsFromRows(rows: unknown): DeadTimeInterval[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((value, index) => {
      const row = value as DeadTimeRow;
      if (
        (row.variant_id !== "nitro" && row.variant_id !== "regular") ||
        typeof row.limit_id !== "string" ||
        typeof row.start_half !== "number" ||
        typeof row.end_half !== "number"
      ) return [];
      const variant: ScheduleVariant = row.variant_id;
      return [{
        id: typeof row.id === "string" ? row.id : `server-${index}`,
        variant,
        limit: row.limit_id,
        startHalf: row.start_half,
        endHalf: row.end_half,
      }];
    })
    .sort(compareDeadTimeIntervals);
}

export function validateDeadTimeIntervals(intervals: DeadTimeInterval[]): DeadTimeValidationError | null {
  if (intervals.some(({ startHalf, endHalf }) =>
    !Number.isInteger(startHalf) || !Number.isInteger(endHalf) ||
    startHalf < 0 || startHalf > 47 || endHalf < 1 || endHalf > 48 || startHalf >= endHalf
  )) return "bounds";

  const sorted = [...intervals].sort(compareDeadTimeIntervals);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous.variant === current.variant &&
      previous.limit === current.limit &&
      current.startHalf < previous.endHalf
    ) return "overlap";
  }
  return null;
}

export function nextDeadTimeInterval(
  intervals: DeadTimeInterval[],
  variant: ScheduleVariant,
  limit: string,
): DeadTimeInterval | null {
  const used = new Set<number>();
  intervals
    .filter((item) => item.variant === variant && item.limit === limit)
    .forEach((item) => {
      for (let half = item.startHalf; half < item.endHalf; half += 1) used.add(half);
    });
  for (let half = 0; half < 48; half += 1) {
    if (used.has(half)) continue;
    let endHalf = half + 1;
    if (endHalf < 48 && !used.has(endHalf)) endHalf += 1;
    return { id: `draft-${crypto.randomUUID()}`, variant, limit, startHalf: half, endHalf };
  }
  return null;
}

export function deadTimeIntervalsEqual(left: DeadTimeInterval[], right: DeadTimeInterval[]) {
  const clean = (items: DeadTimeInterval[]) => [...items].sort(compareDeadTimeIntervals).map(({ variant, limit, startHalf, endHalf }) =>
    `${variant}|${limit}|${startHalf}|${endHalf}`,
  );
  return clean(left).join(";") === clean(right).join(";");
}

export function formatHalfTime(half: number) {
  const bounded = Math.max(0, Math.min(48, half));
  const hour = Math.floor(bounded / 2);
  const minute = bounded % 2 ? "30" : "00";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function compareDeadTimeIntervals(left: DeadTimeInterval, right: DeadTimeInterval) {
  return left.variant.localeCompare(right.variant) || left.limit.localeCompare(right.limit) ||
    left.startHalf - right.startHalf || left.endHalf - right.endHalf;
}

export async function loadDeadTimeIntervals() {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("schedule_dead_intervals")
    .select("id, variant_id, limit_id, start_half, end_half")
    .order("variant_id")
    .order("limit_id")
    .order("start_half");
  if (error) throw error;
  return deadTimeIntervalsFromRows(data);
}

export async function saveDeadTimeIntervals(intervals: DeadTimeInterval[]) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const validationError = validateDeadTimeIntervals(intervals);
  if (validationError) return { error: validationError };
  const { error } = await db.rpc("save_schedule_dead_intervals", {
    p_intervals: intervals.map(({ variant, limit, startHalf, endHalf }) => ({
      variant,
      limit,
      startHalf,
      endHalf,
    })),
  });
  return { error: error?.message };
}

export function subscribeDeadTimeIntervals(onChange: () => void) {
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db
    .channel("schedule-dead-intervals")
    .on("postgres_changes", { event: "*", schema: "public", table: "schedule_dead_intervals" }, onChange)
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
