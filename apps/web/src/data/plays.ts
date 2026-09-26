import { getSupabase } from "./client";
import {
  limitsOfKind,
  normalizePlay,
  type RoomPlay,
} from "../schedule/members";

type RoomSlug = { slug: string };
type LimitRow = { variant_id: string; limit_id: string };
type NickRow = { nick: string; at: string; source: "manual" | "distance" | null; distance_month: string | null };
type PlayerRow = {
  id: string;
  rooms: RoomSlug | RoomSlug[] | null;
  player_limits: LimitRow[] | null;
  player_nicks: NickRow[] | null;
};

function roomSlugOf(rooms: PlayerRow["rooms"]) {
  if (!rooms) return "";
  if (Array.isArray(rooms)) return rooms[0]?.slug ?? "";
  return rooms.slug;
}

function asPlay(row: PlayerRow): RoomPlay | null {
  const roomId = roomSlugOf(row.rooms);
  if (!roomId) return null;
  const nicks = [...(row.player_nicks ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const nitro = (row.player_limits ?? []).filter((item) => item.variant_id === "nitro").map((item) => item.limit_id);
  const regular = (row.player_limits ?? []).filter((item) => item.variant_id === "regular").map((item) => item.limit_id);
  return normalizePlay({
    id: row.id,
    roomId,
    nick: nicks[0]?.nick ?? "",
    limits: [],
    nitroLimits: nitro,
    regularLimits: regular,
    kinds: [],
    nickHistory: nicks.map((stamp) => ({ nick: stamp.nick, at: stamp.at, source: stamp.source ?? "manual", distanceMonth: stamp.distance_month })),
  });
}

export async function loadMyPlays(memberId: string): Promise<RoomPlay[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("players")
    .select("id, rooms(slug), player_limits(variant_id, limit_id), player_nicks(nick, at, source, distance_month)")
    .eq("member_id", memberId);
  if (error || !data?.length) return [];
  return (data as PlayerRow[]).map(asPlay).filter((row): row is RoomPlay => Boolean(row));
}

type NickMapRow = {
  member_id: string;
  player_nicks: NickRow[] | null;
};

export type MemberRoomNick = { roomId: string; nick: string };

export async function loadMemberRoomNicks(memberIds: string[]): Promise<Map<string, MemberRoomNick[]>> {
  const map = new Map<string, MemberRoomNick[]>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!ids.length) return map;
  const db = getSupabase();
  if (!db) return map;
  const { data } = await db.from("players").select("member_id, rooms(slug), player_nicks(nick, at, source, distance_month)").in("member_id", ids);
  for (const row of (data as (PlayerRow & { member_id: string })[] | null) ?? []) {
    const roomId = roomSlugOf(row.rooms);
    if (!roomId) continue;
    const nicks = [...(row.player_nicks ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const list = map.get(row.member_id) ?? [];
    list.push({ roomId, nick: nicks[0]?.nick?.trim() ?? "" });
    map.set(row.member_id, list);
  }
  return map;
}

export async function loadRoomNicks(memberIds: string[], roomSlug = "winamax"): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!ids.length) return map;
  const db = getSupabase();
  if (!db) return map;
  const { data: room } = await db.from("rooms").select("id").eq("slug", roomSlug).maybeSingle();
  if (!room?.id) return map;
  const { data } = await db
    .from("players")
    .select("member_id, player_nicks(nick, at)")
    .eq("room_id", room.id)
    .in("member_id", ids);
  for (const row of (data as NickMapRow[] | null) ?? []) {
    const nicks = [...(row.player_nicks ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const nick = nicks[0]?.nick?.trim();
    if (nick) map.set(row.member_id, nick);
  }
  return map;
}

export async function saveMyPlays(memberId: string, plays: RoomPlay[]) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, plays: [] as RoomPlay[] };
  const payload = plays.map((raw) => {
    const play = normalizePlay(raw);
    return {
      roomId: play.roomId,
      nick: play.nick.trim(),
      nitroLimits: limitsOfKind(play, "nitro"),
      regularLimits: limitsOfKind(play, "regular"),
    };
  });
  const { error } = await db.rpc("save_member_plays", { p_member_id: memberId, p_plays: payload });
  if (error) return { error: error.message, plays: [] as RoomPlay[] };
  return { error: null, plays: await loadMyPlays(memberId) };
}
