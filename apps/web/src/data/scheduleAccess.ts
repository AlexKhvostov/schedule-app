import { getSupabase } from "./client";

export type ScheduleAccessKey = {
  variant: "nitro" | "regular";
  limit: string;
};

function asKey(row: { variant_id: string; limit_id: string }): ScheduleAccessKey | null {
  if (row.variant_id !== "nitro" && row.variant_id !== "regular") return null;
  return { variant: row.variant_id, limit: row.limit_id };
}

export function accessKey(variant: string, limit: string) {
  return `${variant}:${limit}`;
}

export async function loadScheduleAccess(memberId: string): Promise<ScheduleAccessKey[]> {
  const map = await loadScheduleAccessMap([memberId]);
  return map.get(memberId) ?? [];
}

export async function loadScheduleAccessMap(memberIds: string[]): Promise<Map<string, ScheduleAccessKey[]>> {
  const map = new Map<string, ScheduleAccessKey[]>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  const db = getSupabase();
  if (!db || !ids.length) return map;
  const { data, error } = await db.rpc("effective_schedule_access", { p_member_ids: ids });
  if (error || !data) return map;
  for (const row of data as { member_id: string; variant_id: string; limit_id: string }[]) {
    const key = asKey(row);
    if (!key) continue;
    const list = map.get(row.member_id) ?? [];
    list.push(key);
    map.set(row.member_id, list);
  }
  return map;
}

export async function saveScheduleAccess(memberId: string, keys: ScheduleAccessKey[]) {
  void memberId;
  void keys;
  return { error: "role-managed" as const };
}
