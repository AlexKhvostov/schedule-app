import { MARK_CATALOG, MARK_FG_DEFAULT } from "../schedule/markCatalog";
import { ME, asVip, type Mark } from "../schedule/marks";
import { limitsOfKind, loadMembers } from "../schedule/members";
import { getSupabase } from "./client";
import { isLiveData } from "./config";

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

type DirectoryRow = {
  member_id: string;
  public_code: string;
  mark_tag: string | null;
  mark_bg: string | null;
  mark_fg: string | null;
  tables: number | null;
  grid_priority: number | null;
  vip_nitro: number | null;
  vip_regular: number | null;
  username: string | null;
  display_name: string | null;
  guild_nick: string | null;
  avatar_url: string | null;
  discord_username: string | null;
  discord_global_name: string | null;
  discord_guild_nick: string | null;
  discord_avatar_url: string | null;
  room_nick: string | null;
};

export function markFromPlayer(row: SchedulePlayer): Mark {
  return {
    t: row.markTag,
    discord: row.nick,
    room: row.roomNick,
    bg: row.markBg,
    fg: row.markFg,
    tables: row.tables,
    memberId: row.id,
  };
}

function nickOf(row: DirectoryRow) {
  return (
    row.discord_guild_nick ||
    row.discord_global_name ||
    row.discord_username ||
    row.guild_nick ||
    row.display_name ||
    row.username ||
    row.public_code ||
    ""
  );
}

function playerOf(row: DirectoryRow): SchedulePlayer {
  return {
    id: row.member_id,
    nick: nickOf(row),
    publicCode: row.public_code,
    roomNick: row.room_nick ?? "",
    markTag: (row.mark_tag ?? "").trim(),
    markBg: row.mark_bg || ME.bg,
    markFg: row.mark_fg || MARK_FG_DEFAULT,
    tables: Math.min(30, Math.max(1, row.tables ?? 1)),
    avatarUrl: row.discord_avatar_url || row.avatar_url || "",
    username: row.discord_username || row.username || "",
    globalName: row.discord_global_name || row.display_name || "",
    guildNick: row.discord_guild_nick || row.guild_nick || "",
  };
}

function markOf(row: DirectoryRow): Mark {
  const player = playerOf(row);
  return {
    ...markFromPlayer(player),
    avatarUrl: player.avatarUrl,
    username: player.username,
    globalName: player.globalName,
    guildNick: player.guildNick,
    priority: typeof row.grid_priority === "number" && row.grid_priority > 0 ? row.grid_priority : null,
    vipNitro: asVip(row.vip_nitro) || null,
    vipRegular: asVip(row.vip_regular) || null,
  };
}

async function loadDirectory(variant?: "nitro" | "regular", limits?: string[]) {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.rpc("schedule_player_directory", {
    p_variant: variant ?? null,
    p_limit_ids: limits ?? null,
  });
  return error ? [] : ((data ?? []) as DirectoryRow[]);
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

export async function listSchedulePlayers(): Promise<SchedulePlayer[]> {
  if (!isLiveData()) return demoPlayers();
  return (await loadDirectory()).map(playerOf);
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

export async function listLimitMarks(variant: "nitro" | "regular", limits: string[]): Promise<Mark[]> {
  if (!limits.length) return [];
  if (!isLiveData()) return demoLimitMarks(variant, limits);
  return (await loadDirectory(variant, limits)).map(markOf);
}
