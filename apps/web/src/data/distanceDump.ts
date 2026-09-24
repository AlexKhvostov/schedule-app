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
  return { variant: match[1] ? "nitro" : "regular", limitId: match[2] };
}

function parseNumber(raw: string) {
  const text = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function sortLimitIds(ids: string[]) {
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
    if (prev) prev.tournaments += slice.tournaments;
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
    limits: sortLimitIds([...limitSet]),
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
