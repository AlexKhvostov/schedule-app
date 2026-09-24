import { LIMIT_OPTIONS } from "../schedule/capacity";
import { getSupabase } from "./client";
import { formatHands, sortDistanceLimits, type DistanceVariant } from "./distanceDump";
import { loadRoomNicks } from "./plays";

export type DistanceSort = "total" | "discord" | "game";
const REDPARTY_ROLE = "1208022351652986891";

export type DistanceCell = {
  id: string;
  hands: number;
};

export type DistanceSlice = {
  key: string;
  variant: DistanceVariant;
  entryKind: string;
  part: number;
  batchLabel: string | null;
  note: string | null;
  byLimit: Record<string, DistanceCell>;
  total: number;
};

export type DistancePersonRow = {
  playerId: string;
  nick: string;
  discordNick: string;
  gameNick: string;
  discordId: string | null;
  memberId: string | null;
  avatarUrl: string | null;
  onGuild: boolean;
  redParty: boolean;
  slices: DistanceSlice[];
  at: Record<DistanceVariant, Record<string, number>>;
  nitroTotal: number;
  regularTotal: number;
  total: number;
};

export type DistanceBook = {
  monthStart: string;
  months: string[];
  limits: string[];
  people: DistancePersonRow[];
  rowCount: number;
};

function nickOf(guildNick: string | null, username: string | null, fallback = "") {
  return (guildNick || username || fallback).trim() || fallback;
}

function roleHasId(roles: unknown, roleId: string) {
  if (!Array.isArray(roles) || !roleId) return false;
  return roles.some((item) => {
    if (!item || typeof item !== "object") return false;
    return String((item as { id?: string }).id) === roleId;
  });
}

function nickCmp(left: string, right: string, locale: string) {
  const a = left.trim();
  const b = right.trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, locale.startsWith("en") ? "en" : "ru", { sensitivity: "base", numeric: true });
}

function sliceKey(variant: string, entryKind: string, part: number, batchLabel: string | null) {
  return `${variant}|${entryKind}|${part}|${batchLabel ?? ""}`;
}

function emptyAt(): Record<DistanceVariant, Record<string, number>> {
  return { nitro: {}, regular: {} };
}

export function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthInputValue(monthStart: string) {
  return monthStart.slice(0, 7);
}

export function monthStartFromInput(value: string) {
  return value ? `${value}-01` : "";
}

export async function loadDistanceMonths() {
  const db = getSupabase();
  if (!db) return [] as string[];
  const { data } = await db.from("distances").select("month_start").order("month_start", { ascending: false });
  return [...new Set((data ?? []).map((row) => String(row.month_start)))];
}

export async function loadDistanceBook(monthStart: string): Promise<DistanceBook> {
  const empty: DistanceBook = { monthStart, months: [], limits: [...LIMIT_OPTIONS], people: [], rowCount: 0 };
  const db = getSupabase();
  if (!db || !monthStart) return empty;

  const [{ data: facts }, { data: map }, { data: guild }, { data: cards }, { data: idents }, { data: settings }, months] = await Promise.all([
    db
      .from("distances")
      .select("id, member_id, distance_ext_id, discord_id, variant_id, limit_id, entry_kind, part, batch_label, note, hands, game_nick")
      .eq("month_start", monthStart),
    db.from("discord_distance_ids").select("discord_id, distance_ext_id"),
    db.from("discord_members").select("discord_id, username, guild_nick, avatar_url, bot, present, roles"),
    db.from("members").select("id, distance_ext_id"),
    db.from("identities").select("member_id, provider_uid").eq("provider", "discord"),
    db.from("club_settings").select("required_discord_role_id").eq("id", true).maybeSingle(),
    loadDistanceMonths(),
  ]);
  const roleId = String(settings?.required_discord_role_id || REDPARTY_ROLE);

  const guildByDiscord = new Map<
    string,
    { username: string | null; guildNick: string | null; avatarUrl: string | null; bot: boolean; present: boolean; roles: unknown }
  >();
  for (const row of guild ?? []) {
    guildByDiscord.set(String(row.discord_id), {
      username: row.username ?? null,
      guildNick: row.guild_nick ?? null,
      avatarUrl: row.avatar_url ?? null,
      bot: Boolean(row.bot),
      present: Boolean(row.present),
      roles: row.roles,
    });
  }

  const extByDiscord = new Map<string, string>();
  const discordByExt = new Map<string, string>();
  for (const row of map ?? []) {
    const discordId = String(row.discord_id);
    const ext = String(row.distance_ext_id);
    extByDiscord.set(discordId, ext);
    discordByExt.set(ext, discordId);
  }

  const memberByExt = new Map<string, string>();
  for (const row of cards ?? []) {
    const ext = String(row.distance_ext_id ?? "").trim();
    if (ext) memberByExt.set(ext, String(row.id));
  }
  for (const row of idents ?? []) {
    const discordId = String(row.provider_uid);
    const ext = extByDiscord.get(discordId);
    if (ext && !memberByExt.has(ext)) memberByExt.set(ext, String(row.member_id));
  }

  const people = new Map<string, DistancePersonRow>();

  const ensurePerson = (playerId: string, discordId: string | null, memberId: string | null) => {
    const prev = people.get(playerId);
    if (prev) {
      if (!prev.discordId && discordId) {
        prev.discordId = discordId;
        const snap = guildByDiscord.get(discordId);
        prev.discordNick = nickOf(snap?.guildNick ?? null, snap?.username ?? null);
        prev.avatarUrl = snap?.avatarUrl ?? prev.avatarUrl;
        prev.onGuild = Boolean(snap?.present);
        prev.redParty = roleHasId(snap?.roles, roleId);
      }
      if (!prev.memberId && memberId) prev.memberId = memberId;
      return prev;
    }
    const snap = discordId ? guildByDiscord.get(discordId) : undefined;
    const discordNick = nickOf(snap?.guildNick ?? null, snap?.username ?? null);
    const next: DistancePersonRow = {
      playerId,
      nick: discordNick || playerId,
      discordNick,
      gameNick: "",
      discordId,
      memberId,
      avatarUrl: snap?.avatarUrl ?? null,
      onGuild: Boolean(snap?.present),
      redParty: roleHasId(snap?.roles, roleId),
      slices: [],
      at: emptyAt(),
      nitroTotal: 0,
      regularTotal: 0,
      total: 0,
    };
    people.set(playerId, next);
    return next;
  };

  const limitSet = new Set<string>();
  const slicesByPerson = new Map<string, Map<string, DistanceSlice>>();

  for (const row of facts ?? []) {
    const playerId = String(row.distance_ext_id);
    const variant = row.variant_id === "regular" ? "regular" : "nitro";
    const limitId = String(row.limit_id);
    const hands = Number(row.hands) || 0;
    const discordId = row.discord_id ? String(row.discord_id) : discordByExt.get(playerId) ?? null;
    const person = ensurePerson(playerId, discordId, row.member_id ? String(row.member_id) : memberByExt.get(playerId) ?? null);
    const dumpNick = String(row.game_nick ?? "").trim();
    if (dumpNick && !person.gameNick) person.gameNick = dumpNick;
    limitSet.add(limitId);
    person.at[variant][limitId] = (person.at[variant][limitId] ?? 0) + hands;
    if (variant === "nitro") person.nitroTotal += hands;
    else person.regularTotal += hands;
    person.total += hands;

    const key = sliceKey(variant, String(row.entry_kind), Number(row.part) || 1, row.batch_label ? String(row.batch_label) : null);
    let bag = slicesByPerson.get(playerId);
    if (!bag) {
      bag = new Map();
      slicesByPerson.set(playerId, bag);
    }
    let slice = bag.get(key);
    if (!slice) {
      slice = {
        key,
        variant,
        entryKind: String(row.entry_kind),
        part: Number(row.part) || 1,
        batchLabel: row.batch_label ? String(row.batch_label) : null,
        note: row.note ? String(row.note) : null,
        byLimit: {},
        total: 0,
      };
      bag.set(key, slice);
    }
    slice.byLimit[limitId] = { id: String(row.id), hands };
    slice.total += hands;
    if (!slice.note && row.note) slice.note = String(row.note);
  }

  for (const person of people.values()) {
    const bag = slicesByPerson.get(person.playerId);
    person.slices = bag
      ? [...bag.values()].sort(
          (a, b) =>
            Number(a.variant === "regular") - Number(b.variant === "regular") ||
            a.part - b.part ||
            a.entryKind.localeCompare(b.entryKind) ||
            (a.batchLabel ?? "").localeCompare(b.batchLabel ?? ""),
        )
      : [];
  }

  const memberIds = [...people.values()].map((person) => person.memberId).filter((id): id is string => Boolean(id));
  const roomNicks = await loadRoomNicks(memberIds);
  for (const person of people.values()) {
    if (!person.gameNick && person.memberId) person.gameNick = roomNicks.get(person.memberId) ?? "";
    person.nick = person.discordNick || person.gameNick || person.playerId;
  }

  const limits = sortDistanceLimits(limitSet.size ? [...limitSet] : ["25", "50", "100", "250", "500"]);
  const list = sortDistancePeople([...people.values()], "total", ["nitro", "regular"], "ru");

  return { monthStart, months, limits, people: list, rowCount: facts?.length ?? 0 };
}

export async function saveDistanceRows(rows: { id: string; hands: number }[]) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, updated: 0 };
  const { data, error } = await db.rpc("save_distance_rows", { p_rows: rows });
  if (error) return { error: error.message ?? error.code ?? "save", updated: 0 };
  const updated = Number((data as { updated?: number } | null)?.updated) || 0;
  return { error: null, updated };
}

export function personHands(person: DistancePersonRow, variants: DistanceVariant[], limitId: string) {
  let total = 0;
  for (const variant of variants) total += person.at[variant][limitId] ?? 0;
  return total;
}

export function personTotal(person: DistancePersonRow, variants: DistanceVariant[]) {
  return variants.reduce((sum, variant) => sum + (variant === "nitro" ? person.nitroTotal : person.regularTotal), 0);
}

export function sortDistancePeople(
  people: DistancePersonRow[],
  sort: DistanceSort,
  variants: DistanceVariant[],
  locale: string,
) {
  return [...people].sort((a, b) => {
    if (sort === "total") {
      const diff = personTotal(b, variants) - personTotal(a, variants);
      if (diff) return diff;
      return nickCmp(a.nick, b.nick, locale) || a.playerId.localeCompare(b.playerId);
    }
    if (sort === "discord") {
      return nickCmp(a.discordNick, b.discordNick, locale) || nickCmp(a.nick, b.nick, locale) || a.playerId.localeCompare(b.playerId);
    }
    return nickCmp(a.gameNick, b.gameNick, locale) || nickCmp(a.nick, b.nick, locale) || a.playerId.localeCompare(b.playerId);
  });
}

export { formatHands };
