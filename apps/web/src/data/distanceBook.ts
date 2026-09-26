import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { formatHands, type DistanceVariant } from "./distanceDump";

export type DistanceSort = "total" | "discord" | "game" | "distanceId" | "updated";
export type DistanceIdFilter = "all" | "set" | "missing";
export type DistancePresenceFilter = "all" | "with" | "without";
export type DistanceCell = { id: string; hands: number };
export type DistanceSlice = {
  id: string; key: string; variant: DistanceVariant; part: number; comment: string | null;
  source: "import" | "historical" | "manual" | "legacy"; createdAt: string; updatedAt: string;
  createdBy: string | null; updatedBy: string | null;
  byLimit: Record<string, DistanceCell>; total: number;
};
export type DistancePersonRow = {
  key: string; playerId: string; nick: string; discordNick: string; gameNick: string;
  discordId: string | null; memberId: string | null; avatarUrl: string | null; onGuild: boolean;
  redParty: boolean; orphan: boolean; slices: DistanceSlice[];
  at: Record<DistanceVariant, Record<string, number>>; nitroTotal: number; regularTotal: number;
  total: number; updatedAt: string | null;
};
export type DistanceBook = { monthStart: string; roomSlug: string; months: string[]; limits: string[]; people: DistancePersonRow[]; rowCount: number; error: string | null };

type SnapshotPerson = { member_id: string; distance_ext_id: string | null; discord_id: string | null; discord_nick: string; avatar_url: string | null; present: boolean; roles: unknown; game_nick: string };
type SnapshotEntry = { id: string; member_id: string | null; distance_ext_id: string; discord_id: string | null; game_nick: string | null; variant_id: DistanceVariant; part: number; comment: string | null; source: DistanceSlice["source"]; created_at: string; updated_at: string; created_by_name: string | null; updated_by_name: string | null; values: { limit_id: string; tournaments: number }[] };

function emptyAt(): Record<DistanceVariant, Record<string, number>> { return { nitro: {}, regular: {} }; }
function roleHasId(roles: unknown, roleId: string) {
  return Array.isArray(roles) && roles.some((item) => item && typeof item === "object" && String((item as { id?: string }).id) === roleId);
}
function nickCmp(left: string, right: string, locale: string) {
  const a = left.trim(); const b = right.trim();
  if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
  return a.localeCompare(b, locale.startsWith("en") ? "en" : "ru", { sensitivity: "base", numeric: true });
}

export function currentMonthStart() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
export function monthInputValue(monthStart: string) { return monthStart.slice(0, 7); }
export function monthStartFromInput(value: string) { return value ? `${value}-01` : ""; }

const demoBooks = new Map<string, DistanceBook>();

function refreshDemoPerson(person: DistancePersonRow) {
  person.at = emptyAt(); person.nitroTotal = 0; person.regularTotal = 0; person.total = 0; person.updatedAt = null;
  for (const slice of person.slices) {
    for (const [limit, cell] of Object.entries(slice.byLimit)) person.at[slice.variant][limit] = (person.at[slice.variant][limit] ?? 0) + cell.hands;
    if (slice.variant === "nitro") person.nitroTotal += slice.total; else person.regularTotal += slice.total;
    person.total += slice.total;
    if (!person.updatedAt || Date.parse(slice.updatedAt) > Date.parse(person.updatedAt)) person.updatedAt = slice.updatedAt;
  }
}

export function demoDistanceBook(monthStart: string, roomSlug = "winamax"): DistanceBook {
  const key = `${roomSlug}|${monthStart}`; const stored = demoBooks.get(key); if (stored) return stored;
  const polar: DistancePersonRow = {
    key: "member:RP-104", playerId: "10234", nick: "polar", discordNick: "polar", gameNick: "PolarWin",
    discordId: "111111111111111111", memberId: "RP-104", avatarUrl: null, onGuild: true, redParty: true, orphan: false,
    slices: [{ id: "demo-entry-1", key: "demo-entry-1", variant: "nitro", part: 1, comment: "Основная выгрузка", source: "import",
      createdAt: `${monthStart.slice(0, 7)}-05T10:00:00Z`, updatedAt: `${monthStart.slice(0, 7)}-05T10:00:00Z`, createdBy: "you", updatedBy: "you",
      byLimit: { "10": { id: "demo-entry-1:10", hands: 640 }, "25": { id: "demo-entry-1:25", hands: 1200 } }, total: 1840 }],
    at: emptyAt(), nitroTotal: 0, regularTotal: 0, total: 0, updatedAt: null,
  };
  const nina: DistancePersonRow = { key: "member:RP-912", playerId: "", nick: "nina", discordNick: "nina", gameNick: "",
    discordId: "222222222222222222", memberId: "RP-912", avatarUrl: null, onGuild: true, redParty: true, orphan: false,
    slices: [], at: emptyAt(), nitroTotal: 0, regularTotal: 0, total: 0, updatedAt: null };
  refreshDemoPerson(polar); refreshDemoPerson(nina);
  const book = { monthStart, roomSlug, months: [monthStart], limits: ["10", "25", "50", "100"], people: [polar, nina], rowCount: 1, error: null };
  demoBooks.set(key, book); return book;
}

export async function loadDistanceMonths() {
  if (!isLiveData()) return [currentMonthStart()];
  const db = getSupabase(); if (!db) return [] as string[];
  const { data } = await db.from("distance_entries").select("month_start").order("month_start", { ascending: false });
  return [...new Set((data ?? []).map((row) => String(row.month_start)))];
}
export async function loadDistanceRooms() {
  const db = getSupabase(); if (!db) return [{ slug: "winamax", title: "Winamax" }];
  const { data } = await db.from("rooms").select("slug, title").order("title");
  return (data ?? []).map((row) => ({ slug: String(row.slug), title: String(row.title) }));
}

export async function loadDistanceBook(monthStart: string, roomSlug = "winamax"): Promise<DistanceBook> {
  if (!isLiveData()) return demoDistanceBook(monthStart, roomSlug);
  const empty: DistanceBook = { monthStart, roomSlug, months: [], limits: [], people: [], rowCount: 0, error: null };
  const db = getSupabase(); if (!db || !monthStart) return empty;
  const [{ data, error }, { data: settings }] = await Promise.all([
    db.rpc("admin_distance_book", { p_month_start: monthStart, p_room_slug: roomSlug }),
    db.from("club_settings").select("required_discord_role_id").eq("id", true).maybeSingle(),
  ]);
  if (error || !data) return { ...empty, error: error?.message ?? "empty response" };
  const snapshot = data as { people?: SnapshotPerson[]; entries?: SnapshotEntry[]; limits?: string[]; months?: string[] };
  const roleId = String(settings?.required_discord_role_id || "1208022351652986891");
  const people = new Map<string, DistancePersonRow>();
  for (const row of snapshot.people ?? []) {
    const discordNick = String(row.discord_nick ?? "").trim(); const gameNick = String(row.game_nick ?? "").trim(); const playerId = String(row.distance_ext_id ?? "").trim();
    people.set(row.member_id, { key: `member:${row.member_id}`, playerId, nick: discordNick || gameNick || playerId || row.member_id,
      discordNick, gameNick, discordId: row.discord_id ? String(row.discord_id) : null, memberId: row.member_id,
      avatarUrl: row.avatar_url ?? null, onGuild: Boolean(row.present), redParty: roleHasId(row.roles, roleId), orphan: false,
      slices: [], at: emptyAt(), nitroTotal: 0, regularTotal: 0, total: 0, updatedAt: null });
  }
  for (const row of snapshot.entries ?? []) {
    let person = row.member_id ? people.get(row.member_id) : undefined;
    if (!person) {
      const key = `orphan:${row.distance_ext_id}`; person = people.get(key);
      if (!person) {
        const gameNick = String(row.game_nick ?? "").trim();
        person = { key, playerId: row.distance_ext_id, nick: gameNick || row.distance_ext_id, discordNick: "", gameNick,
          discordId: row.discord_id ? String(row.discord_id) : null, memberId: null, avatarUrl: null, onGuild: false,
          redParty: false, orphan: true, slices: [], at: emptyAt(), nitroTotal: 0, regularTotal: 0, total: 0, updatedAt: null };
        people.set(key, person);
      }
    }
    if (!person.playerId) person.playerId = row.distance_ext_id;
    if (!person.gameNick && row.game_nick) person.gameNick = row.game_nick;
    const byLimit: Record<string, DistanceCell> = {}; let total = 0;
    for (const value of row.values ?? []) {
      const hands = Number(value.tournaments) || 0; byLimit[value.limit_id] = { id: `${row.id}:${value.limit_id}`, hands };
      person.at[row.variant_id][value.limit_id] = (person.at[row.variant_id][value.limit_id] ?? 0) + hands; total += hands;
    }
    person.slices.push({ id: row.id, key: row.id, variant: row.variant_id, part: Number(row.part) || 1, comment: row.comment,
      source: row.source, createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by_name, updatedBy: row.updated_by_name, byLimit, total });
    if (row.variant_id === "nitro") person.nitroTotal += total; else person.regularTotal += total;
    person.total += total;
    if (!person.updatedAt || Date.parse(row.updated_at) > Date.parse(person.updatedAt)) person.updatedAt = row.updated_at;
  }
  for (const person of people.values()) {
    person.slices.sort((a, b) => a.variant.localeCompare(b.variant) || a.part - b.part);
    person.nick = person.discordNick || person.gameNick || person.playerId || person.nick;
  }
  return { monthStart, roomSlug, months: (snapshot.months ?? []).map(String), limits: (snapshot.limits ?? []).map(String),
    people: sortDistancePeople([...people.values()], "total", ["nitro", "regular"], "ru"), rowCount: (snapshot.entries ?? []).length, error: null };
}

export async function createDistanceEntry(input: { memberId: string; roomSlug: string; monthStart: string; variant: DistanceVariant; part: number; comment: string; distanceExtId: string; values: Record<string, number> }) {
  if (!isLiveData()) {
    const book = demoDistanceBook(input.monthStart, input.roomSlug); const person = book.people.find((row) => row.memberId === input.memberId);
    if (!person) return { error: "member-not-found" };
    const id = `demo-entry-${Date.now()}`; const now = new Date().toISOString();
    const byLimit = Object.fromEntries(Object.entries(input.values).filter(([, value]) => value > 0).map(([limit, hands]) => [limit, { id: `${id}:${limit}`, hands }]));
    person.playerId = input.distanceExtId; person.slices.push({ id, key: id, variant: input.variant, part: input.part,
      comment: input.comment.trim() || null, source: "manual", createdAt: now, updatedAt: now, createdBy: "you", updatedBy: "you",
      byLimit, total: Object.values(input.values).reduce((sum, value) => sum + Math.max(0, value), 0) });
    refreshDemoPerson(person); book.rowCount += 1; return { error: null };
  }
  const db = getSupabase(); if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("create_manual_distance_entry", { p_member_id: input.memberId, p_room_slug: input.roomSlug,
    p_month_start: input.monthStart, p_variant_id: input.variant, p_part: input.part, p_comment: input.comment,
    p_distance_ext_id: input.distanceExtId, p_values: Object.entries(input.values).map(([limit_id, tournaments]) => ({ limit_id, tournaments })) });
  return { error: error?.message ?? error?.code ?? null };
}
export async function updateDistanceEntry(input: { entryId: string; comment: string; values: Record<string, number> }) {
  if (!isLiveData()) {
    for (const book of demoBooks.values()) for (const person of book.people) {
      const slice = person.slices.find((row) => row.id === input.entryId); if (!slice) continue;
      slice.comment = input.comment.trim() || null; slice.updatedAt = new Date().toISOString(); slice.updatedBy = "you";
      slice.byLimit = Object.fromEntries(Object.entries(input.values).filter(([, value]) => value > 0).map(([limit, hands]) => [limit, { id: `${slice.id}:${limit}`, hands }]));
      slice.total = Object.values(input.values).reduce((sum, value) => sum + Math.max(0, value), 0); refreshDemoPerson(person); return { error: null };
    }
    return { error: "entry-not-found" };
  }
  const db = getSupabase(); if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("update_manual_distance_entry", { p_entry_id: input.entryId, p_comment: input.comment,
    p_values: Object.entries(input.values).map(([limit_id, tournaments]) => ({ limit_id, tournaments })) });
  return { error: error?.message ?? error?.code ?? null };
}

export function personHands(person: DistancePersonRow, variants: DistanceVariant[], limitId: string) { return variants.reduce((sum, variant) => sum + (person.at[variant][limitId] ?? 0), 0); }
export function personTotal(person: DistancePersonRow, variants: DistanceVariant[]) { return variants.reduce((sum, variant) => sum + (variant === "nitro" ? person.nitroTotal : person.regularTotal), 0); }
export function sortDistancePeople(people: DistancePersonRow[], sort: DistanceSort, variants: DistanceVariant[], locale: string) {
  return [...people].sort((a, b) => {
    if (sort === "total") return personTotal(b, variants) - personTotal(a, variants) || nickCmp(a.nick, b.nick, locale);
    if (sort === "discord") return nickCmp(a.discordNick, b.discordNick, locale) || nickCmp(a.nick, b.nick, locale);
    if (sort === "game") return nickCmp(a.gameNick, b.gameNick, locale) || nickCmp(a.nick, b.nick, locale);
    if (sort === "distanceId") {
      if (!a.playerId) return b.playerId ? 1 : nickCmp(a.nick, b.nick, locale); if (!b.playerId) return -1;
      return a.playerId.localeCompare(b.playerId, "en", { numeric: true }) || nickCmp(a.nick, b.nick, locale);
    }
    return (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0) || nickCmp(a.nick, b.nick, locale);
  });
}

function csvValue(value: string | number) {
  let text = String(value);
  const exactNumericId = /^="\d+"$/.test(text);
  if (!exactNumericId && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function csvId(value: string | null) { const text = String(value ?? "").trim(); return text && /^\d+$/.test(text) ? `="${text}"` : text; }
export function distanceBookCsv(input: { monthStart: string; roomTitle: string; people: DistancePersonRow[]; limits: string[]; variants: DistanceVariant[];
  labels: Record<"month" | "room" | "distanceId" | "discordId" | "discordNick" | "gameNick" | "variant" | "part" | "comment" | "created" | "updated" | "total", string> }) {
  const header = [input.labels.month, input.labels.room, input.labels.distanceId, input.labels.discordId, input.labels.discordNick,
    input.labels.gameNick, input.labels.variant, input.labels.part, input.labels.comment, input.labels.created, input.labels.updated,
    ...input.limits, input.labels.total]; const lines = [header.map(csvValue).join(";")];
  for (const person of input.people) {
    const slices = person.slices.filter((row) => input.variants.includes(row.variant)); const rows: (DistanceSlice | null)[] = slices.length ? slices : [null];
    for (const slice of rows) {
      const values: (string | number)[] = [input.monthStart, input.roomTitle, csvId(person.playerId), csvId(person.discordId), person.discordNick,
        person.gameNick, slice?.variant ?? "", slice?.part ?? "", slice?.comment ?? "", slice?.createdAt ?? "", slice?.updatedAt ?? "",
        ...input.limits.map((limit) => slice?.byLimit[limit]?.hands ?? 0), slice?.total ?? 0];
      lines.push(values.map(csvValue).join(";"));
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export { formatHands };
