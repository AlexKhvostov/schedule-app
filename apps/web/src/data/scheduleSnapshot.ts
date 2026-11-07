import type { ScheduleContext } from "./scheduleContext";
import { getSupabase } from "./client";
import { markFromScheduleRow, type MonthScheduleRow, type ScheduleVariant } from "./slots";
import type { Mark } from "../schedule/marks";
import { subscribeAppChanges, subscribeAppConnection } from "./appRealtime";

export type ScheduleTarget = { date: string; kind_id: string };
export type ScheduleKind = { id: string; variant_id: ScheduleVariant; limit_id: string };
export type CompactSlot = { kind_id: string; day: number; half: number; level: number; member_id: string; tables: number };
export type ScheduleSnapshot = {
  year: number; month: number; kinds: ScheduleKind[]; slots: CompactSlot[]; members: Record<string, Mark>; context?: ScheduleContext;
  revisions?: ScheduleVersions;
};
export type ScheduleVersions = {
  version: 1; targets: (ScheduleTarget & { revision: string })[];
  config: string; directory: string; priorities: string; access: string;
};
export type SnapshotRequest = { targets: ScheduleTarget[] | null; directoryOnly?: boolean; configurationOnly?: boolean };

export function decodeScheduleVersions(value: unknown): ScheduleVersions {
  const data = value as ScheduleVersions | null;
  if (!data || data.version !== 1 || !Array.isArray(data.targets)
    || [data.config, data.directory, data.priorities, data.access].some(revision => typeof revision !== "string" || !/^\d+$/.test(revision))
    || data.targets.some(target => typeof target.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(target.date)
      || typeof target.kind_id !== "string" || !target.kind_id || typeof target.revision !== "string" || !/^\d+$/.test(target.revision))) {
    throw new Error("invalid schedule revisions");
  }
  return data;
}

export async function loadScheduleVersions(year: number, monthIndex: number, signal?: AbortSignal): Promise<ScheduleVersions> {
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const query = db.rpc("load_schedule_versions", { p_year: year, p_month: monthIndex + 1 });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error(error.message);
  return decodeScheduleVersions(data);
}

export function decodeScheduleSnapshot(data: unknown, year: number, month: number, directoryOnly = false): ScheduleSnapshot {
  const raw = data as { version?: number; year?: number; month?: number; kinds?: ScheduleKind[]; slots?: CompactSlot[]; members?: MonthScheduleRow[]; slot_count?: number; revisions?: unknown } | null;
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
  return { year, month, kinds: raw.kinds, slots: raw.slots, members, ...(raw.revisions ? { revisions: decodeScheduleVersions(raw.revisions) } : {}) };
}

export async function loadScheduleSnapshot(year: number, monthIndex: number, request: SnapshotRequest, signal?: AbortSignal): Promise<ScheduleSnapshot> {
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const query = db.rpc("load_schedule_snapshot_v2", {
    p_year: year, p_month: monthIndex + 1, p_targets: request.targets, p_directory_only: request.directoryOnly ?? false,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error(error.message);
  return decodeScheduleSnapshot(data, year, monthIndex + 1, request.directoryOnly);
}

export function subscribeScheduleChanges(onSlots: (target: ScheduleTarget) => void, onDirectory: () => void, onStatus: (connected: boolean) => void) {
  const offChanges = subscribeAppChanges(change => {
    if (change.domain === "slots" && change.target) onSlots(change.target);
    if (change.domain === "directory") onDirectory();
  });
  const offStatus = subscribeAppConnection(status => onStatus(status === "online"));
  return () => { offChanges(); offStatus(); };
}
