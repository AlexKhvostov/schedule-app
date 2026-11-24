import { loadMembers } from "../schedule/members";
import { PRIORITY_DEFAULT_ROLE_ID } from "../schedule/priorities";
import { applyClubOrderPositions, clubOrderPositions, reconcileClubOrder, validClubOrder, validClubOrderKeys, type ClubOrderKey, type ClubOrderRow, type ClubOrderSnapshot } from "../schedule/clubOrder";
import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { notifyPriorityDistanceChanged } from "./priorityRefresh";

const KEY = "v2-club-order-keys";
function demoClubOrderKeys(): ClubOrderKey[] {
  // Legacy demo fixtures omit numeric Discord roles; school members are outside the club.
  const members = loadMembers().filter(member => member.community !== "school" || member.discordRoles?.includes(PRIORITY_DEFAULT_ROLE_ID));
  let saved: ClubOrderKey[] = [];
  try {
    const existing = localStorage.getItem(KEY);
    // Preserve the relative sequence from the unpublished personal-number demo.
    saved = existing ? JSON.parse(existing) : (JSON.parse(localStorage.getItem("v2-club-order") || "[]") as ClubOrderRow[])
      .map(row => ({ memberId: row.memberId, key: row.number }));
  } catch { /* Empty initial demo. */ }
  if (!Array.isArray(saved) || !validClubOrderKeys(saved)) saved = [];
  const keys = reconcileClubOrder(saved, members.map(member => member.id));
  localStorage.setItem(KEY, JSON.stringify(keys));
  return keys;
}

export function demoClubOrder(): ClubOrderSnapshot {
  const rows = clubOrderPositions(demoClubOrderKeys());
  return { rows, revision: JSON.stringify(rows) };
}

export async function loadClubOrder(): Promise<ClubOrderSnapshot> {
  if (!isLiveData()) return demoClubOrder();
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const { data, error } = await db.rpc("load_club_order");
  if (error || !data) throw new Error(error?.message || "club-order-load-failed");
  return data as ClubOrderSnapshot;
}

export async function saveClubOrder(snapshot: ClubOrderSnapshot, rows: ClubOrderRow[]): Promise<ClubOrderSnapshot> {
  if (!validClubOrder(rows)) throw new Error("club-order-invalid");
  let next: ClubOrderSnapshot;
  if (!isLiveData()) {
    const current = demoClubOrder();
    if (current.revision !== snapshot.revision) throw new Error("club-order-stale");
    if (rows.length !== current.rows.length || rows.some(row => !current.rows.some(old => old.memberId === row.memberId))) throw new Error("club-order-invalid");
    const keys = applyClubOrderPositions(demoClubOrderKeys(), rows);
    localStorage.setItem(KEY, JSON.stringify(keys));
    next = demoClubOrder();
  } else {
    const db = getSupabase();
    if (!db) throw new Error("not-configured");
    const { data, error } = await db.rpc("save_club_order", { p_revision: snapshot.revision, p_rows: rows });
    if (error || !data) throw new Error(error?.message || "club-order-save-failed");
    next = data as ClubOrderSnapshot;
  }
  notifyPriorityDistanceChanged();
  return next;
}
