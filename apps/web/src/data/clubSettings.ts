import { getSupabase } from "./client";

export type ClubPeopleSettings = {
  selfCreateCard: boolean;
};

const EMPTY: ClubPeopleSettings = { selfCreateCard: false };

export async function loadClubPeopleSettings(): Promise<ClubPeopleSettings> {
  const db = getSupabase();
  if (!db) return EMPTY;
  const { data } = await db.from("club_settings").select("self_create_card").eq("id", true).maybeSingle();
  return { selfCreateCard: Boolean(data?.self_create_card) };
}

export async function saveSelfCreateCard(value: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("club_settings").update({ self_create_card: value }).eq("id", true);
  return { error: error?.message ?? null };
}

export function subscribeClubPeopleSettings(onChange: () => void) {
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db
    .channel("club-settings")
    .on("postgres_changes", { event: "*", schema: "public", table: "club_settings" }, onChange)
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
