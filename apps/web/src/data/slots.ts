import { asVip, type Mark } from "../schedule/marks";
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

export type MonthGridsResult = {
  grids: Record<string, Occupancy>;
  error?: string;
};

export type OccupancyChange = {
  kindId?: string;
  slotDate?: string;
  memberId?: string;
};

export type OwnSlot = {
  day: number;
  half: number;
  level: number;
  tables?: number;
};

const OCCUPANCY_PAGE = 1000;

export function clampTables(value: number | null | undefined, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(1, Math.round(n)));
}

export function ymRange(year: number, monthIndex: number) {
  const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const to = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

function slotDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function asSlotJson(year: number, monthIndex: number, slots: OwnSlot[]) {
  return slots.map((slot) => ({
    date: slotDate(year, monthIndex, slot.day),
    half: slot.half,
    level: slot.level,
    tables: slot.tables != null ? clampTables(slot.tables) : undefined,
  }));
}

async function fetchOccupancyRows(
  from: string,
  to: string,
  kindIds: string[],
): Promise<{ rows: OccupancyRow[]; error?: string }> {
  const db = getSupabase();
  if (!db) return { rows: [] };
  const rows: OccupancyRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("occupancy")
      .select("id, member_id, kind_id, slot_date, half, level, tables")
      .gte("slot_date", from)
      .lte("slot_date", to)
      .in("kind_id", kindIds)
      .order("kind_id", { ascending: true })
      .order("slot_date", { ascending: true })
      .order("half", { ascending: true })
      .order("level", { ascending: true })
      .range(offset, offset + OCCUPANCY_PAGE - 1);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as OccupancyRow[];
    rows.push(...page);
    if (page.length < OCCUPANCY_PAGE) return { rows };
    offset += OCCUPANCY_PAGE;
    if (offset > 50_000) return { rows };
  }
}

type MonthScheduleRow = {
  member_id: string;
  limit_id: string;
  slot_date: string;
  half: number;
  level: number;
  tables: number;
  mark_tag: string | null;
  mark_bg: string | null;
  mark_fg: string | null;
  member_tables: number | null;
  discord: string | null;
  room_nick: string | null;
  avatar_url: string | null;
  username: string | null;
  global_name: string | null;
  grid_priority: number | null;
  vip_nitro: number | null;
  vip_regular: number | null;
};

export type MemberOccupiedSlot = {
  limit: string;
  dayIdx: number;
  half: number;
};

/** Свои слоты по всем лимитам варианта — даже если лимит не в фильтре сетки. */
export async function loadMemberOccupiedSlots(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  memberId: string,
): Promise<MemberOccupiedSlot[] | null> {
  const db = getSupabase();
  if (!db || !memberId) return null;
  const kinds = await loadKinds();
  const wanted = kinds.filter((row) => row.variantId === variant);
  if (!wanted.length) return [];
  const { from, to } = ymRange(year, monthIndex);
  const { data, error } = await db
    .from("occupancy")
    .select("kind_id, slot_date, half")
    .eq("member_id", memberId)
    .gte("slot_date", from)
    .lte("slot_date", to)
    .in(
      "kind_id",
      wanted.map((row) => row.id),
    );
  if (error) return null;
  const kindById = new Map(wanted.map((item) => [item.id, item]));
  const rows: MemberOccupiedSlot[] = [];
  for (const row of data ?? []) {
    const kind = kindById.get(row.kind_id);
    if (!kind) continue;
    const dayIdx = Number(String(row.slot_date).slice(8, 10)) - 1;
    const half = Number(row.half);
    if (dayIdx < 0 || half < 0 || half > 47) continue;
    rows.push({ limit: kind.limitId, dayIdx, half });
  }
  return rows;
}

function missingMonthRpc(message?: string) {
  return Boolean(message && /load_month_schedule|Could not find the function/i.test(message));
}

function markFromScheduleRow(row: MonthScheduleRow): Mark {
  return {
    t: row.mark_tag ?? "",
    discord: row.discord ?? "",
    room: row.room_nick ?? "",
    bg: row.mark_bg ?? "",
    fg: row.mark_fg ?? "",
    tables: clampTables(row.member_tables),
    memberId: row.member_id,
    avatarUrl: row.avatar_url ?? "",
    username: row.username ?? "",
    globalName: row.global_name ?? "",
    priority: typeof row.grid_priority === "number" && row.grid_priority > 0 ? row.grid_priority : null,
    vipNitro: asVip(row.vip_nitro) || null,
    vipRegular: asVip(row.vip_regular) || null,
  };
}

function paintScheduleRows(grids: Record<string, Occupancy>, rows: MonthScheduleRow[]) {
  const marks = new Map<string, Mark>();
  for (const row of rows) {
    if (!marks.has(row.member_id)) marks.set(row.member_id, markFromScheduleRow(row));
    const dayIdx = Number(String(row.slot_date).slice(8, 10)) - 1;
    const grid = grids[row.limit_id];
    const half = Number(row.half);
    const level = Number(row.level);
    if (!grid?.[dayIdx] || half < 0 || half > 47 || level < 0) continue;
    const cell = grid[dayIdx][half] ?? [];
    const next = cell.slice();
    while (next.length <= level) next.push(null);
    const face = marks.get(row.member_id);
    next[level] = face ? { ...face, tables: clampTables(row.tables, face.tables) } : null;
    grid[dayIdx][half] = next;
  }
}

async function loadMonthGridsLegacy(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  limits: string[],
  grids: Record<string, Occupancy>,
): Promise<MonthGridsResult> {
  const db = getSupabase();
  if (!db) return { grids };
  const kinds = await loadKinds();
  const wanted = kinds.filter((row) => row.variantId === variant && limits.includes(row.limitId));
  if (!wanted.length) return { grids };
  const { from, to } = ymRange(year, monthIndex);
  const ids = wanted.map((row) => row.id);
  const { rows, error } = await fetchOccupancyRows(from, to, ids);
  if (error) return { grids, error };
  const memberIds = [...new Set(rows.map((row) => row.member_id))];
  if (!memberIds.length) return { grids };
  const [{ data: people, error: peopleErr }, { data: idents, error: identErr }, roomNicks] = await Promise.all([
    db.from("members").select("id, mark_tag, mark_bg, mark_fg, tables, grid_priority, vip_nitro, vip_regular").in("id", memberIds),
    db.from("identities").select("member_id, provider_uid, username, display_name, guild_nick, avatar_url").in("member_id", memberIds),
    loadRoomNicks(memberIds),
  ]);
  if (peopleErr) return { grids, error: peopleErr.message };
  if (identErr) return { grids, error: identErr.message };
  const discordIds = [...new Set((idents ?? []).map((row) => row.provider_uid).filter(Boolean))];
  const { data: discord, error: discordErr } = discordIds.length
    ? await db.from("discord_members").select("discord_id, guild_nick, global_name, username, avatar_url").in("discord_id", discordIds)
    : { data: [] as { discord_id: string; guild_nick: string | null; global_name: string | null; username: string | null; avatar_url: string | null }[], error: null };
  if (discordErr) return { grids, error: discordErr.message };
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const discordById = new Map((discord ?? []).map((row) => [row.discord_id, row]));
  const marks = new Map<string, Mark>();
  const kindById = new Map(wanted.map((item) => [item.id, item]));
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
  for (const row of rows) {
    const kind = kindById.get(row.kind_id);
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
  return { grids };
}

export async function loadMonthGrids(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  limits: string[],
): Promise<MonthGridsResult | null> {
  const db = getSupabase();
  if (!db) return null;
  const grids = Object.fromEntries(limits.map((limit) => [limit, emptyMonth(year, monthIndex)]));
  if (!limits.length) return { grids };
  const { data, error } = await db.rpc("load_month_schedule", {
    p_year: year,
    p_month: monthIndex + 1,
    p_variant: variant,
    p_limit_ids: limits,
  });
  if (!error) {
    paintScheduleRows(grids, (data ?? []) as MonthScheduleRow[]);
    return { grids };
  }
  if (!missingMonthRpc(error.message)) return { grids, error: error.message };
  return loadMonthGridsLegacy(year, monthIndex, variant, limits, grids);
}

function missingOwnRpc(message?: string) {
  return Boolean(message && /apply_own_slots|Could not find the function/i.test(message));
}

async function insertSeat(input: {
  memberId: string;
  kindId: string;
  year: number;
  monthIndex: number;
  day: number;
  half: number;
  level: number;
  tables: number;
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("occupancy").insert({
    member_id: input.memberId,
    kind_id: input.kindId,
    slot_date: slotDate(input.year, input.monthIndex, input.day),
    half: input.half,
    level: input.level,
    tables: clampTables(input.tables),
  });
  return { error: error?.message };
}

async function deleteSeat(input: {
  memberId: string;
  kindId: string;
  year: number;
  monthIndex: number;
  day: number;
  half: number;
  level: number;
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db
    .from("occupancy")
    .delete()
    .eq("member_id", input.memberId)
    .eq("kind_id", input.kindId)
    .eq("slot_date", slotDate(input.year, input.monthIndex, input.day))
    .eq("half", input.half)
    .eq("level", input.level);
  return { error: error?.message };
}

export async function applyOwnSlots(input: {
  memberId: string;
  limit: string;
  variant: "nitro" | "regular";
  year: number;
  monthIndex: number;
  place: OwnSlot[];
  remove: OwnSlot[];
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const kindId = await kindIdOf(input.limit, input.variant);
  if (!kindId) return { error: "unknown-kind" as const };
  const { error } = await db.rpc("apply_own_slots", {
    p_kind_id: kindId,
    p_member_id: input.memberId,
    p_place: asSlotJson(input.year, input.monthIndex, input.place),
    p_remove: asSlotJson(input.year, input.monthIndex, input.remove),
  });
  if (!error) return {};
  if (!missingOwnRpc(error.message)) return { error: error.message };
  const jobs = [
    ...input.place.map((slot) =>
      insertSeat({
        memberId: input.memberId,
        kindId,
        year: input.year,
        monthIndex: input.monthIndex,
        day: slot.day,
        half: slot.half,
        level: slot.level,
        tables: slot.tables ?? 1,
      }),
    ),
    ...input.remove.map((slot) =>
      deleteSeat({
        memberId: input.memberId,
        kindId,
        year: input.year,
        monthIndex: input.monthIndex,
        day: slot.day,
        half: slot.half,
        level: slot.level,
      }),
    ),
  ];
  const fail = (await Promise.all(jobs)).find((row) => row.error);
  return { error: fail?.error };
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
  return applyOwnSlots({
    memberId: input.memberId,
    limit: input.limit,
    variant: input.variant,
    year: input.year,
    monthIndex: input.monthIndex,
    place: [{ day: input.day, half: input.half, level: input.level, tables: input.tables }],
    remove: [],
  });
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
  return applyOwnSlots({
    memberId: input.memberId,
    limit: input.limit,
    variant: input.variant,
    year: input.year,
    monthIndex: input.monthIndex,
    place: [],
    remove: [{ day: input.day, half: input.half, level: input.level }],
  });
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

export function subscribeOccupancy(onChange: (change: OccupancyChange) => void) {
  const db = getSupabase();
  if (!db) return () => {};
  const channel = db
    .channel("occupancy-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "occupancy" }, (payload) => {
      const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Partial<OccupancyRow>;
      onChange({
        kindId: row?.kind_id,
        slotDate: row?.slot_date,
        memberId: row?.member_id,
      });
    })
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
