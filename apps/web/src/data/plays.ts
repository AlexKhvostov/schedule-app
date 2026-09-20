import { getSupabase } from "./client";
import {
  limitsOfKind,
  normalizePlay,
  type RoomPlay,
} from "../schedule/members";

type RoomSlug = { slug: string };
type LimitRow = { variant_id: string; limit_id: string };
type NickRow = { nick: string; at: string };
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
    nickHistory: nicks.map((stamp) => ({ nick: stamp.nick, at: stamp.at })),
  });
}

export async function loadMyPlays(memberId: string): Promise<RoomPlay[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("players")
    .select("id, rooms(slug), player_limits(variant_id, limit_id), player_nicks(nick, at)")
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
  const { data } = await db.from("players").select("member_id, rooms(slug), player_nicks(nick, at)").in("member_id", ids);
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

  const { data: roomRows, error: roomErr } = await db.from("rooms").select("id, slug");
  if (roomErr) return { error: roomErr.message, plays: [] as RoomPlay[] };
  const roomIdBySlug = new Map((roomRows ?? []).map((row) => [row.slug as string, row.id as string]));

  const { data: existing, error: existingErr } = await db.from("players").select("id, room_id").eq("member_id", memberId);
  if (existingErr) return { error: existingErr.message, plays: [] as RoomPlay[] };
  const playerByRoom = new Map((existing ?? []).map((row) => [row.room_id as string, row.id as string]));
  const keepIds = new Set<string>();

  for (const raw of plays) {
    const play = normalizePlay(raw);
    const roomId = roomIdBySlug.get(play.roomId);
    if (!roomId) return { error: `unknown-room:${play.roomId}`, plays: [] as RoomPlay[] };

    let playerId = playerByRoom.get(roomId);
    if (!playerId) {
      const { data, error } = await db
        .from("players")
        .upsert({ member_id: memberId, room_id: roomId }, { onConflict: "member_id,room_id" })
        .select("id")
        .single();
      if (error || !data?.id) return { error: error?.message ?? "player-upsert", plays: [] as RoomPlay[] };
      playerId = data.id as string;
      playerByRoom.set(roomId, playerId);
    }
    keepIds.add(playerId);

    const limitRows = [
      ...limitsOfKind(play, "nitro").map((limitId) => ({ player_id: playerId, variant_id: "nitro", limit_id: limitId })),
      ...limitsOfKind(play, "regular").map((limitId) => ({ player_id: playerId, variant_id: "regular", limit_id: limitId })),
    ];
    const { error: delErr } = await db.from("player_limits").delete().eq("player_id", playerId);
    if (delErr) return { error: delErr.message, plays: [] as RoomPlay[] };
    if (limitRows.length) {
      const { error: insErr } = await db.from("player_limits").insert(limitRows);
      if (insErr) return { error: insErr.message, plays: [] as RoomPlay[] };
    }

    const nick = play.nick.trim();
    if (nick) {
      const { data: latest } = await db
        .from("player_nicks")
        .select("nick")
        .eq("player_id", playerId)
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.nick !== nick) {
        const { error: nickErr } = await db.from("player_nicks").insert({ player_id: playerId, nick });
        if (nickErr) return { error: nickErr.message, plays: [] as RoomPlay[] };
      }
    }
  }

  for (const row of existing ?? []) {
    if (keepIds.has(row.id as string)) continue;
    const { error } = await db.from("players").delete().eq("id", row.id);
    if (error) return { error: error.message, plays: [] as RoomPlay[] };
  }

  return { error: null, plays: await loadMyPlays(memberId) };
}
