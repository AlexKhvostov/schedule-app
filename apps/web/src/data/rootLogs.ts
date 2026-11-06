import { getSupabase } from "./client";

export type LogSource = "schedule" | "distance";
export type LogPerson = { id: string | null; name?: string; discord?: string; discord_id?: string; code?: string };
export type LogEntry = {
  id: string; at: string; action: "place" | "remove" | "distance_ids"; actor: LogPerson; member: LogPerson;
  detail: { date?: string; half?: number; level?: number; tables?: number; room?: string; limit?: string; variant?: string; old_ids?: string[]; new_ids?: string[] };
};
export type LogFilters = { source: LogSource; person: string; role: "actor" | "member"; from: string; to: string; action: string; limit: number };
export type LogPage = { rows: LogEntry[]; has_more: boolean };
export type CleanupPreview = { cutoff: string; eligible: number; deleted: number; batch_limit: number };
export const defaultLogFilters: LogFilters = { source: "schedule", person: "", role: "actor", from: "", to: "", action: "", limit: 50 };

export function minskDate(at: string) { return new Date(Date.parse(at) + 3 * 3600000).toISOString().slice(0, 10); }
export function matchesLog(row: LogEntry, filters: LogFilters) {
  const date = minskDate(row.at);
  const person = row[filters.role];
  const search = Object.values(person).filter(Boolean).join(" ").toLocaleLowerCase();
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
    && (!filters.action || row.action === filters.action) && search.includes(filters.person.trim().toLocaleLowerCase());
}

const demoActor: LogPerson = { id: "demo-root", name: "Александр", discord: "Alex Demo", code: "DEMO-ROOT" };
const demoMember: LogPerson = { id: "demo-member", name: "Мария", discord: "Polar Demo", code: "DEMO-MEMBER" };
const demoStart = Date.now();
let demoSchedule: LogEntry[] = Array.from({ length: 126 }, (_, i) => ({
  id: String(1000 - i), at: new Date(demoStart - (i >= 124 ? (i === 124 ? 75 : 110) * 24 : i) * 3600000).toISOString(), action: i % 3 ? "place" : "remove",
  actor: i % 2 ? demoActor : demoMember, member: demoMember,
  detail: { date: minskDate(new Date(demoStart).toISOString()), half: 32 + i % 8, level: 0, tables: 2, room: "Winamax", limit: "50", variant: "nitro" },
}));
const demoDistance: LogEntry[] = [{ id: "1", at: new Date(demoStart).toISOString(), action: "distance_ids", actor: demoActor, member: demoMember, detail: { old_ids: ["901"], new_ids: ["902", "901"] } }];

export async function loadRootLogs(filters: LogFilters, before?: Pick<LogEntry, "at" | "id">): Promise<LogPage> {
  const db = getSupabase();
  if (!db) {
    const rows = (filters.source === "schedule" ? demoSchedule : demoDistance).filter((row) => matchesLog(row, filters)
      && (!before || row.at < before.at || (row.at === before.at && Number(row.id) < Number(before.id))));
    return { rows: rows.slice(0, filters.limit), has_more: rows.length > filters.limit };
  }
  const { data, error } = await db.rpc("root_logs", { p_source: filters.source, p_person: filters.person.trim(), p_role: filters.role,
    p_from: filters.from || null, p_to: filters.to || null, p_action: filters.action, p_limit: filters.limit,
    p_before_at: before?.at ?? null, p_before_id: before?.id ?? null });
  if (error) throw new Error("logs-read-failed");
  return data as LogPage;
}

export async function cleanupRootLogs(months: 2 | 3, cutoff?: string): Promise<CleanupPreview> {
  const db = getSupabase();
  if (!db) {
    const date = new Date(); date.setUTCMonth(date.getUTCMonth() - months);
    const boundary = cutoff ?? date.toISOString();
    const eligible = demoSchedule.filter((row) => row.at < boundary).length;
    if (cutoff) demoSchedule = demoSchedule.filter((row) => row.at >= boundary);
    return { cutoff: boundary, eligible: cutoff ? 0 : eligible, deleted: cutoff ? eligible : 0, batch_limit: 5000 };
  }
  const { data, error } = await db.rpc("root_logs_cleanup", { p_months: months, p_cutoff: cutoff ?? null, p_confirm: Boolean(cutoff) });
  if (error) throw new Error("logs-cleanup-failed");
  return data as CleanupPreview;
}
