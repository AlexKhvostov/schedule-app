import { getSupabase } from "./client";
import { MARKS, type Mark } from "../schedule/marks";

export type SlotHistoryTarget = { date: string; half: number; level: number; variant: "nitro" | "regular"; limit: string };
export type SlotHistoryPerson = { id: string | null; name: string | null };
export type SlotHistoryEntry = {
  id: string; at: string; action: "place" | "remove"; actor: SlotHistoryPerson;
  member: SlotHistoryPerson & { tag: string | null; bg: string | null; fg: string | null };
  tables: number;
};
export type SlotHistoryPage = { rows: SlotHistoryEntry[]; has_more: boolean };
export type SlotHistoryCursor = Pick<SlotHistoryEntry, "at" | "id">;

/** Called by the history window only; never by schedule or tooltip loading. */
export async function loadSlotHistory(target: SlotHistoryTarget, before?: SlotHistoryCursor, demoMark?: Mark | null): Promise<SlotHistoryPage> {
  const db = getSupabase();
  if (!db) {
    if (before) return { rows: [], has_more: false };
    const mark = demoMark ?? MARKS[(target.half + target.level) % MARKS.length];
    const member = { id: mark.memberId ?? "demo-player", name: mark.globalName || mark.discord, tag: mark.t, bg: mark.bg, fg: mark.fg };
    const now = Date.now();
    const actions: SlotHistoryEntry["action"][] = demoMark ? ["place", "remove", "place"] : ["remove", "place"];
    return { has_more: false, rows: actions.map((action, index) => ({
      id: `demo-${target.date}-${target.half}-${target.level}-${index}`,
      at: new Date(now - (index + 1) * 3600_000).toISOString(), action, member, tables: mark.tables,
      actor: index === 0 ? { id: "demo-admin", name: "Demo Admin" } : { id: member.id, name: member.name },
    })) };
  }
  const { data, error } = await db.rpc("slot_history", {
    p_date: target.date, p_half: target.half, p_level: target.level, p_variant: target.variant, p_limit: target.limit,
    p_before_at: before?.at ?? null, p_before_id: before?.id ?? null,
  });
  if (error) throw new Error("slot-history-read-failed");
  return data as SlotHistoryPage;
}
