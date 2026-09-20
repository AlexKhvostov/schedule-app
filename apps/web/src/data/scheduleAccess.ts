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
  const { data, error } = await db
    .from("member_schedule_access")
    .select("member_id, variant_id, limit_id")
    .in("member_id", ids);
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
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const current = await loadScheduleAccess(memberId);
  const nextSet = new Set(keys.map((row) => accessKey(row.variant, row.limit)));
  const currSet = new Set(current.map((row) => accessKey(row.variant, row.limit)));
  const toAdd = keys.filter((row) => !currSet.has(accessKey(row.variant, row.limit)));
  const toRemove = current.filter((row) => !nextSet.has(accessKey(row.variant, row.limit)));

  for (const row of toRemove) {
    const { error } = await db
      .from("member_schedule_access")
      .delete()
      .eq("member_id", memberId)
      .eq("variant_id", row.variant)
      .eq("limit_id", row.limit);
    if (error) return { error: error.message };
  }

  if (toAdd.length) {
    const { error } = await db.from("member_schedule_access").insert(
      toAdd.map((row) => ({ member_id: memberId, variant_id: row.variant, limit_id: row.limit })),
    );
    if (error) return { error: error.message };
  }

  return { error: null };
}
