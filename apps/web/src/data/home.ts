import { getSupabase } from "./client";

export type ClubPulse = {
  profiles: number;
  onServer: number;
  scheduleRoles: number;
};

const empty: ClubPulse = { profiles: 0, onServer: 0, scheduleRoles: 0 };

export async function loadClubPulse(): Promise<ClubPulse> {
  const db = getSupabase();
  if (!db) return empty;
  const [profiles, onServer, roles] = await Promise.all([
    db.from("members").select("id", { count: "exact", head: true }).eq("access_status", "active"),
    db.from("discord_members").select("discord_id", { count: "exact", head: true }).eq("present", true).eq("bot", false),
    db.from("discord_role_permissions").select("role_id").eq("permission_code", "schedule"),
  ]);
  const scheduleRoles = new Set((roles.data ?? []).map((row) => row.role_id)).size;
  return {
    profiles: profiles.count ?? 0,
    onServer: onServer.count ?? 0,
    scheduleRoles,
  };
}
