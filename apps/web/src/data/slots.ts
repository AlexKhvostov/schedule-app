import type { Mark } from "../schedule/marks";
import { asVip } from "../schedule/marks";
import { emptyMonth, type Occupancy } from "../schedule/plan";
import { getSupabase } from "./client";
import { kindIdOf, loadKinds } from "./kinds";
import { loadRoomNicks } from "./plays";

export type OccupancyRow = {
  id: string;
  member_id: string;
  kind_id: string;
  slot_date: string;
  half: number;
  level: number;
  tables: number;
};

export function clampTables(value: number | null | undefined, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(1, Math.round(n)));
}

function ymRange(year: number, monthIndex: number) {
  const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const to = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export async function loadMonthGrids(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  limits: string[],
): Promise<Record<string, Occupancy> | null> {
  const db = getSupabase();
  if (!db) return null;
  const kinds = await loadKinds();
  const wanted = kinds.filter((row) => row.variantId === variant && limits.includes(row.limitId));
  const grids = Object.fromEntries(limits.map((limit) => [limit, emptyMonth(year, monthIndex)]));
  if (!wanted.length) return grids;
  const { from, to } = ymRange(year, monthIndex);
  const ids = wanted.map((row) => row.id);
  const { data: rows } = await db
    .from("occupancy")
    .select("id, member_id, kind_id, slot_date, half, level, tables")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .in("kind_id", ids);
  const memberIds = [...new Set((rows ?? []).map((row) => row.member_id))];
  if (!memberIds.length) return grids;
  const [{ data: people }, { data: idents }, roomNicks] = await Promise.all([
    db.from("members").select("id, mark_tag, mark_bg, mark_fg, tables, grid_priority, vip_nitro, vip_regular").in("id", memberIds),
    db.from("identities").select("member_id, provider_uid, username, display_name, guild_nick, avatar_url").in("member_id", memberIds),
    loadRoomNicks(memberIds),
  ]);
  const discordIds = [...new Set((idents ?? []).map((row) => row.provider_uid).filter(Boolean))];
  const { data: discord } = discordIds.length
    ? await db.from("discord_members").select("discord_id, guild_nick, global_name, username, avatar_url").in("discord_id", discordIds)
    : { data: [] as { discord_id: string; guild_nick: string | null; global_name: string | null; username: string | null; avatar_url: string | null }[] };
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const discordById = new Map((discord ?? []).map((row) => [row.discord_id, row]));
  const marks = new Map<string, Mark>();
  for (const person of people ?? []) {
    const ident = identByMember.get(person.id);
    const snap = ident?.provider_uid ? discordById.get(ident.provider_uid) : undefined;
    marks.set(person.id, {
      t: person.mark_tag ?? "",
      discord: snap?.guild_nick || ident?.guild_nick || snap?.username || ident?.username || ident?.display_name || "",
      room: roomNicks.get(person.id) ?? "",
      bg: person.mark_bg,
      fg: person.mark_fg,
      tables: clampTables(person.tables),
      memberId: person.id,
      avatarUrl: snap?.avatar_url || ident?.avatar_url || "",
      username: snap?.username || ident?.username || "",
      globalName: snap?.global_name || ident?.display_name || "",
      priority: typeof person.grid_priority === "number" && person.grid_priority > 0 ? person.grid_priority : null,
      vipNitro: asVip(person.vip_nitro) || null,
      vipRegular: asVip(person.vip_regular) || null,
    });
  }
  for (const row of rows ?? []) {
    const kind = wanted.find((item) => item.id === row.kind_id);
    if (!kind) continue;
    const dayIdx = Number(row.slot_date.slice(8, 10)) - 1;
    const grid = grids[kind.limitId];
    if (!grid?.[dayIdx]) continue;
    const cell = grid[dayIdx][row.half] ?? [];
    const next = cell.slice();
    while (next.length <= row.level) next.push(null);
    const face = marks.get(row.member_id);
    next[row.level] = face ? { ...face, tables: clampTables(row.tables, face.tables) } : null;
    grid[dayIdx][row.half] = next;
  }
  return grids;
}

export async function placeSlot(input: {
  memberId: string;
  limit: string;
  variant: "nitro" | "regular";
  year: number;
  monthIndex: number;
  day: number;
  half: number;
  level: number;
  tables: number;
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const kindId = await kindIdOf(input.limit, input.variant);
  if (!kindId) return { error: "unknown-kind" as const };
  const slot_date = `${input.year}-${String(input.monthIndex + 1).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`;
  const { error } = await db.from("occupancy").insert({
    member_id: input.memberId,
    kind_id: kindId,
    slot_date,
    half: input.half,
    level: input.level,
    tables: clampTables(input.tables),
  });
  return { error: error?.message };
}

export async function removeSlot(input: {
  memberId: string;
  limit: string;
  variant: "nitro" | "regular";
  year: number;
  monthIndex: number;
  day: number;
  half: number;
  level: number;
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const kindId = await kindIdOf(input.limit, input.variant);
  if (!kindId) return { error: "unknown-kind" as const };
  const slot_date = `${input.year}-${String(input.monthIndex + 1).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`;
  const { error } = await db
    .from("occupancy")
    .delete()
    .eq("member_id", input.memberId)
    .eq("kind_id", kindId)
    .eq("slot_date", slot_date)
    .eq("half", input.half)
    .eq("level", input.level);
  return { error: error?.message };
}

export async function removeForeignSlots(input: {
  limit: string;
  variant: "nitro" | "regular";
  slots: { date: string; half: number; level: number }[];
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const kindId = await kindIdOf(input.limit, input.variant);
  if (!kindId) return { error: "unknown-kind" as const };
  const { error } = await db.rpc("remove_foreign_slots", {
    p_kind_id: kindId,
    p_slots: input.slots,
  });
  return { error: error?.message };
}

export async function replaceForeignSlots(input: {
  memberId?: string;
  limit: string;
  variant: "nitro" | "regular";
  slots: { date: string; half: number; level: number }[];
  tables: number;
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const kindId = await kindIdOf(input.limit, input.variant);
  if (!kindId) return { error: "unknown-kind" as const };
  const { error } = await db.rpc("replace_foreign_slots", {
    p_kind_id: kindId,
    p_member_id: input.memberId || null,
    p_slots: input.slots,
    p_tables: clampTables(input.tables),
  });
  return { error: error?.message };
}

export function subscribeOccupancy(onChange: () => void) {
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db
    .channel("occupancy-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "occupancy" }, onChange)
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
