import { getSupabase } from "./client";

export type DistanceVariant = "nitro" | "regular";

export type DistanceSlice = {
  playerId: string;
  nick: string;
  limitId: string;
  variant: DistanceVariant;
  rawLimit: string;
  tournaments: number;
  x1000: number;
};

export type DistancePerson = {
  playerId: string;
  nick: string;
  at: Record<DistanceVariant, Record<string, number>>;
  regularTotal: number;
  nitroTotal: number;
  total: number;
};

export type DistanceDump = {
  fileName: string;
  monthStart: string | null;
  limits: string[];
  slices: DistanceSlice[];
  people: DistancePerson[];
  skipped: number;
  unknownLimits: string[];
};

const LIMIT_RANK: Record<string, number> = {
  "0.25": 0,
  "0.50": 1,
  "1": 2,
  "2": 3,
  "5": 4,
  "10": 5,
  "25": 6,
  "50": 7,
  "100": 8,
  "250": 9,
  "500": 10,
};

const MONTH_NUM: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function splitCsvLine(line: string, sep: string) {
  return line.split(sep).map((cell) => cell.trim());
}

function pickSep(header: string) {
  const semi = (header.match(/;/g) ?? []).length;
  const comma = (header.match(/,/g) ?? []).length;
  return semi >= comma ? ";" : ",";
}

function parseLimit(raw: string): { limitId: string; variant: DistanceVariant } | null {
  const match = /^(E)?(\d+(?:\.\d+)?)$/i.exec(raw.trim());
  if (!match) return null;
  return { variant: match[1] ? "regular" : "nitro", limitId: match[2] };
}

function parseNumber(raw: string) {
  const text = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function sortDistanceLimits(ids: string[]) {
  return [...ids].sort((a, b) => (LIMIT_RANK[a] ?? 99) - (LIMIT_RANK[b] ?? 99) || Number(a) - Number(b) || a.localeCompare(b));
}

export function monthFromDumpName(fileName: string) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{2})/i.exec(fileName.trim());
  if (!match) return null;
  const month = MONTH_NUM[match[1].toLowerCase()];
  if (!month) return null;
  const year = 2000 + Number(match[2]);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function emptyAt(): Record<DistanceVariant, Record<string, number>> {
  return { regular: {}, nitro: {} };
}

function indexOf(header: string[], ...names: string[]) {
  const lower = header.map((cell) => cell.replace(/^\uFEFF/, "").trim().toLowerCase());
  for (const name of names) {
    const at = lower.indexOf(name);
    if (at >= 0) return at;
  }
  return -1;
}

export function parseDistanceCsv(text: string, fileName: string): DistanceDump & { error?: string } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { fileName, monthStart: null, limits: [], slices: [], people: [], skipped: 0, unknownLimits: [], error: "empty" };

  const sep = pickSep(lines[0]);
  const header = splitCsvLine(lines[0], sep);
  const iId = indexOf(header, "playerid", "player_id", "id");
  const iNick = indexOf(header, "nickname", "nick", "name");
  const iLimit = indexOf(header, "limit");
  const iTour = indexOf(header, "tournaments", "hands", "distance");
  const iShare = indexOf(header, "x1000");

  if (iId < 0 || iNick < 0 || iLimit < 0 || iTour < 0) {
    return { fileName, monthStart: null, limits: [], slices: [], people: [], skipped: 0, unknownLimits: [], error: "shape" };
  }

  const slices: DistanceSlice[] = [];
  const unknown = new Set<string>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    const playerId = cells[iId] ?? "";
    const nick = cells[iNick] ?? "";
    const rawLimit = cells[iLimit] ?? "";
    const tournaments = parseNumber(cells[iTour] ?? "");
    const parsed = parseLimit(rawLimit);
    if (!playerId || !parsed || tournaments == null || tournaments < 0) {
      skipped += 1;
      if (rawLimit && !parsed) unknown.add(rawLimit);
      continue;
    }
    slices.push({
      playerId,
      nick,
      limitId: parsed.limitId,
      variant: parsed.variant,
      rawLimit,
      tournaments,
      x1000: parseNumber(cells[iShare] ?? "") ?? 0,
    });
  }

  const merged = new Map<string, DistanceSlice>();
  for (const slice of slices) {
    const key = `${slice.playerId}|${slice.variant}|${slice.limitId}`;
    const prev = merged.get(key);
    if (prev) {
      prev.tournaments += slice.tournaments;
      if (slice.nick) prev.nick = slice.nick;
    }
    else merged.set(key, { ...slice });
  }

  const byPerson = new Map<string, DistancePerson>();
  const limitSet = new Set<string>();
  for (const slice of merged.values()) {
    limitSet.add(slice.limitId);
    const prev = byPerson.get(slice.playerId);
    if (prev) {
      prev.at[slice.variant][slice.limitId] = (prev.at[slice.variant][slice.limitId] ?? 0) + slice.tournaments;
      if (slice.variant === "nitro") prev.nitroTotal += slice.tournaments;
      else prev.regularTotal += slice.tournaments;
      prev.total += slice.tournaments;
      if (slice.nick) prev.nick = slice.nick;
    } else {
      const at = emptyAt();
      at[slice.variant][slice.limitId] = slice.tournaments;
      byPerson.set(slice.playerId, {
        playerId: slice.playerId,
        nick: slice.nick,
        at,
        regularTotal: slice.variant === "regular" ? slice.tournaments : 0,
        nitroTotal: slice.variant === "nitro" ? slice.tournaments : 0,
        total: slice.tournaments,
      });
    }
  }

  const people = [...byPerson.values()].sort(
    (a, b) => b.total - a.total || a.nick.localeCompare(b.nick, "ru") || a.playerId.localeCompare(b.playerId, "en"),
  );

  return {
    fileName,
    monthStart: monthFromDumpName(fileName),
    limits: sortDistanceLimits([...limitSet]),
    slices,
    people,
    skipped,
    unknownLimits: [...unknown],
    error: people.length ? undefined : "empty",
  };
}

export function formatHands(value: number, locale: string) {
  return value.toLocaleString(locale.startsWith("en") ? "en-US" : "ru-RU");
}

function csvCell(value: string | number, sep: string) {
  const text = String(value);
  if (text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(sep)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function dumpPreviewCsv(input: {
  people: DistancePerson[];
  limits: string[];
  kind: "all" | DistanceVariant;
  sums: ReturnType<typeof sumDistance> | null;
  labels: { id: string; nick: string; total: string; sum: string };
}) {
  const sep = ";";
  const showNitro = input.kind !== "regular";
  const showRegular = input.kind !== "nitro";
  const header = [input.labels.id, input.labels.nick];
  if (showNitro) for (const limit of input.limits) header.push(limit);
  if (showRegular) for (const limit of input.limits) header.push(`E${limit}`);
  header.push(input.labels.total);
  const lines = [header.map((cell) => csvCell(cell, sep)).join(sep)];

  const totalOf = (nitro: number, regular: number, all: number) =>
    input.kind === "nitro" ? nitro : input.kind === "regular" ? regular : all;

  for (const row of input.people) {
    const cells: (string | number)[] = [row.playerId, row.nick];
    if (showNitro) for (const limit of input.limits) cells.push(row.at.nitro[limit] ?? 0);
    if (showRegular) for (const limit of input.limits) cells.push(row.at.regular[limit] ?? 0);
    cells.push(totalOf(row.nitroTotal, row.regularTotal, row.total));
    lines.push(cells.map((cell) => csvCell(cell, sep)).join(sep));
  }

  if (input.sums && input.people.length) {
    const cells: (string | number)[] = ["", input.labels.sum];
    if (showNitro) for (const limit of input.limits) cells.push(input.sums.nitro[limit] ?? 0);
    if (showRegular) for (const limit of input.limits) cells.push(input.sums.regular[limit] ?? 0);
    cells.push(totalOf(input.sums.nitroTotal, input.sums.regularTotal, input.sums.total));
    lines.push(cells.map((cell) => csvCell(cell, sep)).join(sep));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseDistanceLimit(raw: string) {
  return parseLimit(raw);
}

const FALLBACK_REDPARTY_ROLE = "1208022351652986891";

function roleHasId(roles: unknown, roleId: string) {
  if (!Array.isArray(roles) || !roleId) return false;
  return roles.some((item) => {
    if (!item || typeof item !== "object") return false;
    return String((item as { id?: string }).id) === roleId;
  });
}

export type DistanceLink = {
  discordId: string | null;
  memberId: string | null;
};

export type DistancePeopleFlags = {
  redPartyIds: Set<string>;
  cardIds: Set<string>;
  byExt: Map<string, DistanceLink>;
  ready: boolean;
};

export type DistanceDumpRow = {
  distance_ext_id: string;
  variant_id: DistanceVariant;
  limit_id: string;
  hands: number;
  game_nick: string;
};

export type DistanceWriteResult = {
  inserted: number;
  skipped: number;
  unknown: number;
};

export type HistoricalDistanceFact = {
  distance_ext_id: string;
  discord_id: string;
  game_nick: string;
  month_start: string;
  part: number;
  limit_id: string;
  hands: number;
};

export type HistoricalDistanceDump = {
  fileName: string;
  facts: HistoricalDistanceFact[];
  people: { playerId: string; discordId: string; nick: string; total: number }[];
  months: string[];
  parts: number[];
  limits: string[];
  skippedMissingId: number;
  missingDiscord: number;
  error?: "empty" | "shape" | "value";
};

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

const HISTORICAL_MONTHS: Record<string, number> = {
  "янв.": 1, "февр.": 2, "мар.": 3, "апр.": 4, мая: 5, "июн.": 6,
  "июл.": 7, "авг.": 8, "сент.": 9, "окт.": 10, "нояб.": 11, "дек.": 12,
};

function historicalMonth(raw: string) {
  const value = raw.replace(/[\u00a0\u202f]/g, " ").trim().toLowerCase();
  const match = /^([а-я.]+)\s+(\d{2})\s*г\.$/u.exec(value);
  const month = match ? HISTORICAL_MONTHS[match[1]] : 0;
  if (!match || !month) return null;
  return `${2000 + Number(match[2])}-${String(month).padStart(2, "0")}-01`;
}

function historicalId(raw: string) {
  return raw.replace(/\s/g, "").replace(/[,.]00$/, "");
}

export function parseHistoricalDistanceCsv(text: string, fileName: string): HistoricalDistanceDump {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const empty = { fileName, facts: [], people: [], months: [], parts: [], limits: [], skippedMissingId: 0, missingDiscord: 0 };
  if (rows.length < 5) return { ...empty, error: "empty" };
  const width = rows[0].length;
  if (width < 5 || rows.some((row) => row.length !== width)) return { ...empty, error: "shape" };
  const [dates, parts, limits, labels, ...data] = rows;
  if (labels[0].trim().toLowerCase() !== "playerid" || labels[3].trim().toLowerCase() !== "nickname wnmx") {
    return { ...empty, error: "shape" };
  }
  const facts: HistoricalDistanceFact[] = [];
  const people = new Map<string, { playerId: string; discordId: string; nick: string; total: number }>();
  let skippedMissingId = 0;
  let missingDiscord = 0;
  try {
    for (const row of data) {
      const playerId = historicalId(row[0]);
      if (!/^\d{1,12}$/.test(playerId)) {
        skippedMissingId += 1;
        continue;
      }
      const discordId = row[1].trim();
      if (!discordId) missingDiscord += 1;
      if (discordId && !/^\d{15,22}$/.test(discordId)) throw new Error("discord");
      const nick = row[3].trim();
      const person = { playerId, discordId, nick, total: 0 };
      for (let column = 4; column < width; column += 1) {
        const rawHands = row[column].replace(/[\s\u00a0\u202f]/g, "");
        if (!rawHands) continue;
        if (!/^\d+$/.test(rawHands)) throw new Error("hands");
        const hands = Number(rawHands);
        if (!hands) continue;
        const monthStart = historicalMonth(dates[column]);
        const part = Number(parts[column].trim());
        const limitId = limits[column].trim();
        if (!monthStart || !Number.isInteger(part) || part < 1 || !(limitId in LIMIT_RANK)) throw new Error("header");
        facts.push({ distance_ext_id: playerId, discord_id: discordId, game_nick: nick, month_start: monthStart, part, limit_id: limitId, hands });
        person.total += hands;
      }
      people.set(playerId, person);
    }
  } catch {
    return { ...empty, skippedMissingId, missingDiscord, error: "value" };
  }
  return {
    fileName,
    facts,
    people: [...people.values()].sort((a, b) => b.total - a.total || a.nick.localeCompare(b.nick)),
    months: [...new Set(facts.map((row) => row.month_start))].sort(),
    parts: [...new Set(facts.map((row) => row.part))].sort((a, b) => a - b),
    limits: sortDistanceLimits([...new Set(facts.map((row) => row.limit_id))]),
    skippedMissingId,
    missingDiscord,
    error: facts.length ? undefined : "empty",
  };
}

export async function saveHistoricalDistanceDump(input: {
  roomSlug: string;
  variantId: DistanceVariant;
  rows: HistoricalDistanceFact[];
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, result: null };
  const { data, error } = await db.rpc("save_historical_distance_dump", {
    p_room_slug: input.roomSlug,
    p_variant_id: input.variantId,
    p_rows: input.rows,
  });
  if (error) return { error: error.message ?? error.code ?? "save", result: null };
  return { error: null, result: data as DistanceWriteResult & { nick_updated: number } };
}

export function dumpSliceKey(ext: string, variant: string, limitId: string) {
  return `${ext}|${variant}|${limitId}`;
}

export function dumpWriteRows(dump: DistanceDump): DistanceDumpRow[] {
  const rows: DistanceDumpRow[] = [];
  for (const person of dump.people) {
    for (const variant of ["nitro", "regular"] as const) {
      for (const [limitId, hands] of Object.entries(person.at[variant])) {
        if (hands > 0) {
          rows.push({
            distance_ext_id: person.playerId,
            variant_id: variant,
            limit_id: limitId,
            hands,
            game_nick: person.nick.trim(),
          });
        }
      }
    }
  }
  return rows;
}

export function dumpLabelFromName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

export async function loadDistancePeopleFlags(): Promise<DistancePeopleFlags> {
  const empty = { redPartyIds: new Set<string>(), cardIds: new Set<string>(), byExt: new Map<string, DistanceLink>(), ready: false };
  const db = getSupabase();
  if (!db) return empty;
  const [{ data: settings }, { data: cards }, { data: map }, { data: guild }, { data: idents }] = await Promise.all([
    db.from("club_settings").select("required_discord_role_id").eq("id", true).maybeSingle(),
    db.from("members").select("id, distance_ext_id").not("distance_ext_id", "is", null),
    db.from("discord_distance_ids").select("discord_id, distance_ext_id"),
    db.from("discord_members").select("discord_id, roles"),
    db.from("identities").select("member_id, provider_uid").eq("provider", "discord"),
  ]);
  const roleId = String(settings?.required_discord_role_id || FALLBACK_REDPARTY_ROLE);
  const cardIds = new Set<string>();
  const memberExt = new Map<string, string>();
  const byExt = new Map<string, DistanceLink>();
  for (const row of cards ?? []) {
    const ext = String(row.distance_ext_id ?? "").trim();
    if (!ext) continue;
    cardIds.add(ext);
    memberExt.set(String(row.id), ext);
    byExt.set(ext, { discordId: null, memberId: String(row.id) });
  }
  const redByDiscord = new Map<string, boolean>();
  for (const row of guild ?? []) {
    redByDiscord.set(String(row.discord_id), roleHasId(row.roles, roleId));
  }
  const redPartyIds = new Set<string>();
  for (const row of map ?? []) {
    const ext = String(row.distance_ext_id);
    const discordId = String(row.discord_id);
    const prev = byExt.get(ext);
    byExt.set(ext, { discordId, memberId: prev?.memberId ?? null });
    if (redByDiscord.get(discordId)) redPartyIds.add(ext);
  }
  const identDiscord = new Map<string, string>();
  for (const row of idents ?? []) {
    identDiscord.set(String(row.member_id), String(row.provider_uid));
  }
  for (const [memberId, ext] of memberExt) {
    const discordId = identDiscord.get(memberId);
    if (discordId) {
      const prev = byExt.get(ext);
      byExt.set(ext, { discordId: prev?.discordId ?? discordId, memberId });
      if (redByDiscord.get(discordId)) redPartyIds.add(ext);
    }
  }
  return { redPartyIds, cardIds, byExt, ready: true };
}

export async function loadExistingDistanceKeys(monthStart: string, entryKind: string, part: number, roomSlug = "winamax") {
  const empty = new Map<string, number>();
  const db = getSupabase();
  if (!db || !monthStart) return empty;
  const { data } = await db
    .from("distance_entries")
    .select("distance_ext_id, variant_id, distance_values(limit_id, tournaments), rooms!inner(slug)")
    .eq("month_start", monthStart)
    .eq("part", part)
    .eq("rooms.slug", roomSlug);
  const keys = new Map<string, number>();
  for (const row of data ?? []) {
    for (const value of row.distance_values ?? []) {
      keys.set(dumpSliceKey(String(row.distance_ext_id), String(row.variant_id), String(value.limit_id)), Number(value.tournaments) || 0);
    }
  }
  return keys;
}

export async function saveDistanceDump(input: {
  roomSlug: string;
  monthStart: string;
  entryKind: string;
  part: number;
  batchLabel: string;
  note: string;
  rows: DistanceDumpRow[];
}) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, result: null };
  const { data, error } = await db.rpc("save_distance_dump", {
    p_room_slug: input.roomSlug,
    p_month_start: input.monthStart,
    p_entry_kind: input.entryKind,
    p_part: input.part,
    p_batch_label: input.batchLabel,
    p_note: input.note,
    p_rows: input.rows,
  });
  if (error) return { error: error.message ?? error.code ?? "save", result: null };
  const row = data as DistanceWriteResult | null;
  return {
    error: null,
    result: {
      inserted: Number(row?.inserted) || 0,
      skipped: Number(row?.skipped) || 0,
      unknown: Number(row?.unknown) || 0,
    },
  };
}

export async function countDistanceRows(monthStart?: string) {
  const db = getSupabase();
  if (!db) return 0;
  let query = db.from("distance_entries").select("id", { count: "exact", head: true });
  if (monthStart) query = query.eq("month_start", monthStart);
  const { count } = await query;
  return count ?? 0;
}

export async function clearDistanceRows(monthStart?: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, deleted: 0 };
  const { data, error } = await db.rpc("clear_distance_rows", {
    p_month_start: monthStart ?? null,
  });
  if (error) return { error: error.message ?? error.code ?? "clear", deleted: 0 };
  return { error: null, deleted: Number((data as { deleted?: number } | null)?.deleted) || 0 };
}

export function sumDistance(people: DistancePerson[], limits: string[]) {
  const regular: Record<string, number> = {};
  const nitro: Record<string, number> = {};
  for (const limit of limits) {
    regular[limit] = 0;
    nitro[limit] = 0;
  }
  let regularTotal = 0;
  let nitroTotal = 0;
  for (const row of people) {
    regularTotal += row.regularTotal;
    nitroTotal += row.nitroTotal;
    for (const limit of limits) {
      regular[limit] += row.at.regular[limit] ?? 0;
      nitro[limit] += row.at.nitro[limit] ?? 0;
    }
  }
  return { regular, nitro, regularTotal, nitroTotal, total: regularTotal + nitroTotal };
}
