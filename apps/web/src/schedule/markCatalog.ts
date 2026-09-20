import { MARKS, ME } from "./marks";

export const MARK_FG_DEFAULT = "#111827";
export const MARK_CATALOG_SIZE = 200;
export const MARK_SHADES_PER_FAMILY = 5;
export const MARK_PREVIEW_TAG = "AB";
export const MARK_PREVIEW_TABLES = 12;
const MIN_INK_CONTRAST = 3.2;

export type MarkColor = {
  id: number;
  bg: string;
};

export type MarkAssign = {
  fg: string;
  t: string;
  discord: string;
  room: string;
};

export type MarkAssignMap = Record<number, MarkAssign>;

export type MarkInk = {
  id: string;
  color: string;
};

export type MarkPlayer = {
  discord: string;
  room: string;
};

/** Кандидаты: на каждой плашке остаются только контрастные. */
export const MARK_INKS: readonly MarkInk[] = [
  { id: "black", color: "#111827" },
  { id: "white", color: "#f8fafc" },
  { id: "navy", color: "#0c2a4a" },
  { id: "wine", color: "#8b1538" },
  { id: "forest", color: "#0f3d24" },
  { id: "purple", color: "#3b0764" },
  { id: "gold", color: "#f5c518" },
  { id: "ice", color: "#e0f2fe" },
];

export const MARK_PLAYERS: readonly MarkPlayer[] = uniquePlayers([
  ...MARKS.map((row) => ({ discord: row.discord, room: row.room })),
  { discord: ME.discord, room: ME.room },
  { discord: "nika", room: "NikaQ" },
  { discord: "den", room: "DenRiver" },
  { discord: "max", room: "MaxFold" },
  { discord: "ira", room: "IraSpin" },
  { discord: "kat", room: "KatRiver" },
  { discord: "leo", room: "LeoAce" },
  { discord: "roma", room: "RomaBet" },
  { discord: "tanya", room: "TanyaK" },
  { discord: "vlad", room: "VladM" },
  { discord: "sasha", room: "SashaP" },
  { discord: "masha", room: "MashaT" },
  { discord: "pavel", room: "PavelN" },
  { discord: "dina", room: "DinaL" },
  { discord: "gleb", room: "GlebX" },
  { discord: "yana", room: "YanaS" },
  { discord: "tim", room: "TimCall" },
  { discord: "eva", room: "EvaPot" },
  { discord: "mark", room: "MarkD" },
  { discord: "olya", room: "OlyaV" },
  { discord: "kir", room: "KirPro" },
  { discord: "sofia", room: "SofiaR" },
  { discord: "artem", room: "ArtemB" },
  { discord: "lina", room: "LinaM" },
]);

function uniquePlayers(list: MarkPlayer[]) {
  const seen = new Set<string>();
  return list.filter((row) => {
    const key = row.discord.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 40 семейств по кругу × 5 ступеней. Самые бледные жёлтые/оранжевые
 * убраны: градиент начинается с цвета, который глаз ещё отличает.
 */
function shadesForHue(hue: number) {
  const warmWash = hue >= 28 && hue <= 78;
  if (warmWash) {
    return [
      { sat: 88, light: 62 },
      { sat: 90, light: 54 },
      { sat: 86, light: 46 },
      { sat: 80, light: 38 },
      { sat: 74, light: 32 },
    ];
  }
  return [
    { sat: 66, light: 70 },
    { sat: 78, light: 60 },
    { sat: 86, light: 50 },
    { sat: 82, light: 40 },
    { sat: 74, light: 32 },
  ];
}

function freezeMarkCatalog(): MarkColor[] {
  const families = 40;
  const list: MarkColor[] = [];
  for (let family = 0; family < families; family++) {
    const base = family * 9;
    const shades = shadesForHue(base);
    shades.forEach((shade, step) => {
      const hue = (base + step * 2) % 360;
      list.push({ id: list.length, bg: `hsl(${hue} ${shade.sat}% ${shade.light}%)` });
    });
  }
  return list;
}

export const MARK_CATALOG: readonly MarkColor[] = freezeMarkCatalog();

export function buildMarkCatalog(): readonly MarkColor[] {
  return MARK_CATALOG;
}

export function familyOf(id: number) {
  return Math.floor(id / MARK_SHADES_PER_FAMILY);
}

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

function hslToRgb(bg: string) {
  const match = bg.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/i);
  if (!match) return { r: 0.5, g: 0.5, b: 0.5 };
  const h = Number(match[1]) / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  if (s === 0) return { r: l, g: l, b: l };
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue2rgb(p, q, h + 1 / 3), g: hue2rgb(p, q, h), b: hue2rgb(p, q, h - 1 / 3) };
}

function channel(c: number) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: { r: number; g: number; b: number }) {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function parseMarkHex(raw: string): string | null {
  const text = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(text)) {
    const [r, g, b] = text.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
  return null;
}

export function cssToHex(color: string): string {
  const hex = parseMarkHex(color);
  if (hex) return hex;
  const rgb = color.startsWith("hsl") ? hslToRgb(color) : hexToRgb(color.startsWith("#") ? color : "#808080");
  const byte = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
}

export function contrastRatio(bg: string, fg: string) {
  const a = luminance(bg.startsWith("hsl") ? hslToRgb(bg) : hexToRgb(bg));
  const b = luminance(hexToRgb(fg));
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export function inksForBg(bg: string): MarkInk[] {
  const ranked = MARK_INKS.map((ink) => ({ ink, c: contrastRatio(bg, ink.color) })).sort((x, y) => y.c - x.c);
  const ok = ranked.filter((row) => row.c >= MIN_INK_CONTRAST).map((row) => row.ink);
  if (ok.length >= 3) return ok.slice(0, 6);
  return ranked.slice(0, 4).map((row) => row.ink);
}

export function bestInk(bg: string) {
  return inksForBg(bg)[0]?.color ?? MARK_FG_DEFAULT;
}

export const MARK_CATALOG_INKS: readonly MarkInk[][] = MARK_CATALOG.map((color) => inksForBg(color.bg));

export function formatNick(discord: string, room?: string) {
  const nick = discord.trim();
  const table = room?.trim();
  if (!nick) return "";
  if (!table) return nick;
  return `${nick} (${table})`;
}

export function parseNickField(raw: string): { discord: string; room: string } {
  const text = raw.trim();
  const wrapped = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (wrapped) {
    return { discord: wrapped[1].trim().slice(0, 32), room: wrapped[2].trim().slice(0, 32) };
  }
  const known = MARK_PLAYERS.find((row) => row.discord.toLowerCase() === text.toLowerCase());
  return { discord: text.slice(0, 32), room: known?.room ?? "" };
}

export function nickLabel(row: Pick<MarkAssign, "discord" | "room">) {
  return formatNick(row.discord, row.room);
}

const KEY = "v2-mark-catalog";

export function emptyAssign(): MarkAssign {
  return { fg: "", t: "", discord: "", room: "" };
}

function isAssigned(row: MarkAssign | undefined) {
  return Boolean(row && (row.discord.trim() || row.t.trim()));
}

export function resolvedFg(row: MarkAssign | undefined, bg: string) {
  const allowed = inksForBg(bg);
  if (row?.fg && allowed.some((ink) => ink.color === row.fg)) return row.fg;
  return allowed[0]?.color ?? MARK_FG_DEFAULT;
}

export function loadMarkAssigns(): MarkAssignMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<MarkAssign>>;
    const next: MarkAssignMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (!Number.isInteger(id) || !value) continue;
      const parsedNick = parseNickField(typeof value.discord === "string" ? value.discord : "");
      next[id] = {
        fg: typeof value.fg === "string" ? value.fg : "",
        t: typeof value.t === "string" ? value.t.trim().slice(0, 3).toUpperCase() : "",
        discord: parsedNick.discord,
        room: typeof value.room === "string" && value.room.trim() ? value.room.trim().slice(0, 32) : parsedNick.room,
      };
    }
    return next;
  } catch {
    return {};
  }
}

export function saveMarkAssigns(map: MarkAssignMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function tagTaken(map: MarkAssignMap, tag: string, exceptId?: number) {
  const needle = tag.trim().toUpperCase();
  if (!needle) return false;
  return Object.entries(map).some(([id, row]) => Number(id) !== exceptId && row.t === needle);
}

export function nickTaken(map: MarkAssignMap, nick: string, exceptId?: number) {
  const needle = parseNickField(nick).discord.trim().toLowerCase();
  if (!needle) return false;
  return Object.entries(map).some(
    ([id, row]) => Number(id) !== exceptId && row.discord.trim().toLowerCase() === needle,
  );
}

/** Та же семья цвета + тот же шрифт уже заняты другим игроком. */
export function comboTaken(map: MarkAssignMap, colorId: number, fg: string, exceptId?: number) {
  const ink = fg.trim().toLowerCase();
  if (!ink) return false;
  const family = familyOf(colorId);
  return Object.entries(map).some(([id, row]) => {
    const other = Number(id);
    if (other === exceptId || !isAssigned(row)) return false;
    const bg = MARK_CATALOG[other]?.bg;
    if (!bg) return false;
    return familyOf(other) === family && resolvedFg(row, bg).toLowerCase() === ink;
  });
}
