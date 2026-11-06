import type { ScheduleContext } from "./scheduleContext";
import { getSupabase } from "./client";
import { markFromScheduleRow, type MonthScheduleRow, type ScheduleVariant } from "./slots";
import type { Mark } from "../schedule/marks";

export type ScheduleTarget = { date: string; kind_id: string };
export type ScheduleKind = { id: string; variant_id: ScheduleVariant; limit_id: string };
export type CompactSlot = { kind_id: string; day: number; half: number; level: number; member_id: string; tables: number };
export type ScheduleSnapshot = {
  year: number; month: number; kinds: ScheduleKind[]; slots: CompactSlot[]; members: Record<string, Mark>; context?: ScheduleContext;
};
export type SnapshotRequest = { targets: ScheduleTarget[] | null; directoryOnly?: boolean };

export function decodeScheduleSnapshot(data: unknown, year: number, month: number, directoryOnly = false): ScheduleSnapshot {
  const raw = data as { version?: number; year?: number; month?: number; kinds?: ScheduleKind[]; slots?: CompactSlot[]; members?: MonthScheduleRow[]; slot_count?: number } | null;
  if (!raw || raw.version !== 1 || raw.year !== year || raw.month !== month || !Array.isArray(raw.kinds)
    || !Array.isArray(raw.slots) || !Array.isArray(raw.members) || (!directoryOnly && raw.slots.length !== raw.slot_count)) {
    throw new Error("invalid schedule snapshot");
  }
  const kinds = new Set(raw.kinds.map((kind) => kind.id));
  if (raw.kinds.some((kind) => !kind.id || !["nitro", "regular"].includes(kind.variant_id) || !kind.limit_id)) throw new Error("invalid schedule kinds");
  const members = Object.fromEntries(raw.members.map((person) => [person.member_id, markFromScheduleRow(person)]));
  const days = new Date(year, month, 0).getDate();
  const seats = new Set<string>();
  for (const slot of raw.slots) {
    const key = `${slot.kind_id}:${slot.day}:${slot.half}:${slot.level}`;
    if (!kinds.has(slot.kind_id) || !members[slot.member_id] || !Number.isInteger(slot.day) || slot.day < 1 || slot.day > days
      || !Number.isInteger(slot.half) || slot.half < 0 || slot.half > 47 || !Number.isInteger(slot.level) || slot.level < 0 || slot.level > 100
      || !Number.isInteger(slot.tables) || slot.tables < 1 || slot.tables > 30 || seats.has(key)) throw new Error("invalid schedule slot");
    seats.add(key);
  }
  return { year, month, kinds: raw.kinds, slots: raw.slots, members };
}

export async function loadScheduleSnapshot(year: number, monthIndex: number, request: SnapshotRequest, signal?: AbortSignal): Promise<ScheduleSnapshot> {
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const query = db.rpc("load_schedule_snapshot", {
    p_year: year, p_month: monthIndex + 1, p_targets: request.targets, p_directory_only: request.directoryOnly ?? false,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error(error.message);
  return decodeScheduleSnapshot(data, year, monthIndex + 1, request.directoryOnly);
}

export function subscribeScheduleChanges(onSlots: (target: ScheduleTarget) => void, onDirectory: () => void, onStatus: (connected: boolean) => void) {
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db.channel("schedule:changes", { config: { private: true } })
    .on("broadcast", { event: "slots" }, ({ payload }) => {
      if (typeof payload?.date === "string" && typeof payload?.kind_id === "string") onSlots({ date: payload.date, kind_id: payload.kind_id });
    })
    .on("broadcast", { event: "directory" }, onDirectory)
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
  return () => db.removeChannel(channel);
}
