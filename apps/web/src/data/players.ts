import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { MARK_CATALOG, MARK_FG_DEFAULT } from "../schedule/markCatalog";
import { ME, asVip, type Mark } from "../schedule/marks";
import { limitsOfKind, loadMembers } from "../schedule/members";
import { loadRoomNicks } from "./plays";

export type SchedulePlayer = {
  id: string;
  nick: string;
  publicCode: string;
  roomNick: string;
  markTag: string;
  markBg: string;
  markFg: string;
  tables: number;
  avatarUrl?: string;
  username?: string;
  globalName?: string;
  guildNick?: string;
};

export function markFromPlayer(row: SchedulePlayer): Mark {
  return {
    t: row.markTag,
    discord: row.nick,
    room: row.roomNick,
    bg: row.markBg,
    fg: row.markFg,
    tables: row.tables,
  };
}

function nickOf(
  ident?: { provider_uid?: string | null; username?: string | null; display_name?: string | null; guild_nick?: string | null } | null,
  discord?: { guild_nick?: string | null; global_name?: string | null; username?: string | null } | null,
  fallback = "",
) {
  return (
    discord?.guild_nick ||
    discord?.global_name ||
    discord?.username ||
    ident?.guild_nick ||
    ident?.username ||
    ident?.display_name ||
    fallback
  );
}

function demoPlayers(): SchedulePlayer[] {
  return loadMembers()
    .filter((row) => row.status === "active" && row.appAccess)
    .map((row) => ({
      id: row.id,
      nick: row.discord,
      publicCode: row.room,
      roomNick: row.room,
      markTag: row.mark.t.trim(),
      markBg: row.mark.bg || MARK_CATALOG[row.mark.colorId]?.bg || ME.bg,
      markFg: row.mark.fg || MARK_FG_DEFAULT,
      tables: Math.min(30, Math.max(1, row.tables ?? 11)),
      avatarUrl: row.avatar || "",
      username: row.discord || "",
      globalName: row.discordDisplay || row.discord || "",
      guildNick: row.discordGuildNick || "",
    }))
    .sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }));
}

async function clubPlayerIds(ids: string[]): Promise<Set<string>> {
  const db = getSupabase();
  if (!db || !ids.length) return new Set();
  const { data } = await db.from("member_roles").select("member_id, role_id").in("member_id", ids);
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.role_id === "member" || row.role_id === "admin") set.add(String(row.member_id));
  }
  return set;
}

async function listLivePlayers(): Promise<SchedulePlayer[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data: members } = await db
    .from("members")
    .select("id, public_code, mark_tag, mark_bg, mark_fg, tables")
    .eq("access_status", "active")
    .order("created_at", { ascending: true });
  if (!members?.length) return [];
  const allowed = await clubPlayerIds(members.map((row) => row.id));
  const playable = members.filter((row) => allowed.has(row.id));
  if (!playable.length) return [];
  const ids = playable.map((row) => row.id);
  const { data: idents } = await db
    .from("identities")
    .select("member_id, provider_uid, username, display_name, guild_nick, avatar_url")
    .in("member_id", ids);
  const discordIds = [...new Set((idents ?? []).map((row) => row.provider_uid).filter(Boolean))];
  const [{ data: discord }, nicks] = await Promise.all([
    discordIds.length
      ? db.from("discord_members").select("discord_id, guild_nick, global_name, username, avatar_url").in("discord_id", discordIds)
      : Promise.resolve({ data: [] as { discord_id: string; guild_nick: string | null; global_name: string | null; username: string | null; avatar_url: string | null }[] }),
    loadRoomNicks(ids),
  ]);
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const discordById = new Map((discord ?? []).map((row) => [row.discord_id, row]));
  return playable
    .map((row) => {
      const ident = identByMember.get(row.id);
      const snap = ident?.provider_uid ? discordById.get(ident.provider_uid) : undefined;
      return {
        id: row.id,
        nick: nickOf(ident, snap),
        publicCode: row.public_code,
        roomNick: nicks.get(row.id) ?? "",
        markTag: (row.mark_tag ?? "").trim(),
        markBg: row.mark_bg || ME.bg,
        markFg: row.mark_fg || MARK_FG_DEFAULT,
        tables: Math.min(30, Math.max(1, row.tables ?? 11)),
        avatarUrl: snap?.avatar_url || ident?.avatar_url || "",
        username: snap?.username || ident?.username || "",
        globalName: snap?.global_name || ident?.display_name || "",
        guildNick: snap?.guild_nick || ident?.guild_nick || "",
      };
    })
    .sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }));
}

export async function listSchedulePlayers(): Promise<SchedulePlayer[]> {
  if (isLiveData()) return listLivePlayers();
  return demoPlayers();
}

function demoLimitMarks(variant: "nitro" | "regular", limits: string[]): Mark[] {
  if (!limits.length) return [];
  return loadMembers()
    .filter((row) => row.status === "active" && row.appAccess)
    .filter((row) => {
      const play = row.plays?.find((item) => item.roomId === "winamax");
      const theirs = play ? limitsOfKind(play, variant) : row.limits;
      return limits.some((limit) => theirs.includes(limit));
    })
    .map((row) => ({
      t: row.mark.t.trim(),
      discord: row.discord,
      room: row.room,
      bg: row.mark.bg || MARK_CATALOG[row.mark.colorId]?.bg || ME.bg,
      fg: row.mark.fg || MARK_FG_DEFAULT,
      tables: Math.min(30, Math.max(1, row.tables ?? 11)),
      memberId: row.id,
      avatarUrl: row.avatar || "",
      username: row.discord || "",
      globalName: row.discordDisplay || row.discord || "",
      guildNick: row.discordGuildNick || "",
      vipNitro: asVip(row.vipNitro) || null,
      vipRegular: asVip(row.vipRegular) || null,
    }));
}

async function marksForMembers(ids: string[]): Promise<Mark[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const db = getSupabase();
  if (!db) return [];
  const allowed = await clubPlayerIds(unique);
  const playable = unique.filter((id) => allowed.has(id));
  if (!playable.length) return [];
  const [{ data: members }, { data: idents }, nicks] = await Promise.all([
    db
      .from("members")
      .select("id, mark_tag, mark_bg, mark_fg, tables, grid_priority, vip_nitro, vip_regular")
      .eq("access_status", "active")
      .in("id", playable),
    db
      .from("identities")
      .select("member_id, provider_uid, username, display_name, guild_nick, avatar_url")
      .in("member_id", playable),
    loadRoomNicks(playable),
  ]);
  if (!members?.length) return [];
  const discordIds = [...new Set((idents ?? []).map((row) => row.provider_uid).filter(Boolean))];
  const { data: discord } = discordIds.length
    ? await db
        .from("discord_members")
        .select("discord_id, guild_nick, global_name, username, avatar_url")
        .in("discord_id", discordIds)
    : { data: [] as { discord_id: string; guild_nick: string | null; global_name: string | null; username: string | null; avatar_url: string | null }[] };
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const discordById = new Map((discord ?? []).map((row) => [row.discord_id, row]));
  return members.map((row) => {
    const ident = identByMember.get(row.id);
    const snap = ident?.provider_uid ? discordById.get(ident.provider_uid) : undefined;
    return {
      t: (row.mark_tag ?? "").trim(),
      discord: nickOf(ident, snap),
      room: nicks.get(row.id) ?? "",
      bg: row.mark_bg || ME.bg,
      fg: row.mark_fg || MARK_FG_DEFAULT,
      tables: Math.min(30, Math.max(1, row.tables ?? 11)),
      memberId: row.id,
      avatarUrl: snap?.avatar_url || ident?.avatar_url || "",
      username: snap?.username || ident?.username || "",
      globalName: snap?.global_name || ident?.display_name || "",
      guildNick: snap?.guild_nick || ident?.guild_nick || "",
      priority: typeof row.grid_priority === "number" && row.grid_priority > 0 ? row.grid_priority : null,
      vipNitro: asVip(row.vip_nitro) || null,
      vipRegular: asVip(row.vip_regular) || null,
    };
  });
}

export async function listLimitMarks(variant: "nitro" | "regular", limits: string[]): Promise<Mark[]> {
  if (!limits.length) return [];
  if (!isLiveData()) return demoLimitMarks(variant, limits);
  const db = getSupabase();
  if (!db) return [];
  const { data: room } = await db.from("rooms").select("id").eq("slug", "winamax").maybeSingle();
  if (!room?.id) return [];
  const { data: players } = await db.from("players").select("id, member_id").eq("room_id", room.id);
  if (!players?.length) return [];
  const byPlayer = new Map(players.map((row) => [row.id, row.member_id as string]));
  const { data: rows } = await db
    .from("player_limits")
    .select("player_id")
    .eq("variant_id", variant)
    .in("limit_id", limits)
    .in("player_id", [...byPlayer.keys()]);
  const memberIds = [...new Set((rows ?? []).map((row) => byPlayer.get(row.player_id)).filter(Boolean))] as string[];
  return marksForMembers(memberIds);
}
