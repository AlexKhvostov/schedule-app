import { LIMIT_OPTIONS } from "./capacity";
import { MARK_CATALOG, RESERVED_TAGS, cssToHex, familyOf, parseMarkHex } from "./markCatalog";

export type MemberStatus = "active" | "pending" | "paused" | "archived" | "banned";

export const MEMBER_STATUSES: readonly MemberStatus[] = ["active", "pending", "paused", "archived", "banned"];
export const DEFAULT_STATUS_FILTER: MemberStatus = "active";

export type MemberMark = {
  colorId: number;
  bg?: string;
  fg: string;
  t: string;
};

export type ClubMember = {
  id: string;
  name: string;
  discord: string;
  discordId: string;
  room: string;
  email: string;
  limits: string[];
  status: MemberStatus;
  vip: number;
  distance: number;
  mark: MemberMark;
};

const KEY = "v2-club-members";

function mark(colorId: number, t: string, fg = ""): MemberMark {
  return { colorId, fg, t, bg: MARK_CATALOG[colorId]?.bg };
}

export const SEED_MEMBERS: ClubMember[] = [
  {
    id: "RP-104",
    name: "Алексей",
    discord: "polar",
    discordId: "104820339201",
    room: "PolarWin",
    email: "polar@club.local",
    limits: ["50", "100", "250"],
    status: "active",
    vip: 1,
    distance: 2,
    mark: mark(12, "PL"),
  },
  {
    id: "RP-221",
    name: "Света",
    discord: "svetka",
    discordId: "882104339012",
    room: "Svet50",
    email: "sveta@club.local",
    limits: ["50"],
    status: "active",
    vip: 0,
    distance: 8,
    mark: mark(48, "SV"),
  },
  {
    id: "RP-308",
    name: "Оксана",
    discord: "oks",
    discordId: "773019228441",
    room: "OksanaN",
    email: "oks@club.local",
    limits: ["50", "100"],
    status: "active",
    vip: 2,
    distance: 11,
    mark: mark(88, "OK"),
  },
  {
    id: "RP-415",
    name: "Ярослав",
    discord: "you",
    discordId: "551002883771",
    room: "YouNick",
    email: "you@club.local",
    limits: ["50", "100"],
    status: "active",
    vip: 0,
    distance: 14,
    mark: mark(120, "YO"),
  },
  {
    id: "RP-502",
    name: "Александр",
    discord: "alex",
    discordId: "440198273665",
    room: "AlexK",
    email: "alex@club.local",
    limits: ["100", "250"],
    status: "active",
    vip: 3,
    distance: 19,
    mark: mark(152, "AL"),
  },
  {
    id: "RP-618",
    name: "Ира",
    discord: "ira",
    discordId: "339001228554",
    room: "IraSpin",
    email: "",
    limits: ["25", "50"],
    status: "pending",
    vip: 0,
    distance: 27,
    mark: mark(28, "IR"),
  },
  {
    id: "RP-733",
    name: "Максим",
    discord: "xplay",
    discordId: "228773001994",
    room: "Xplay1",
    email: "xplay@club.local",
    limits: ["50"],
    status: "paused",
    vip: 0,
    distance: 33,
    mark: mark(176, "XP"),
  },
  {
    id: "RP-840",
    name: "Лора",
    discord: "lora",
    discordId: "119883772001",
    room: "LoraSpin",
    email: "",
    limits: ["50", "100"],
    status: "archived",
    vip: 0,
    distance: 41,
    mark: mark(64, "LO"),
  },
  {
    id: "RP-901",
    name: "Глеб",
    discord: "gleb",
    discordId: "991002883001",
    room: "GlebX",
    email: "",
    limits: ["50"],
    status: "banned",
    vip: 0,
    distance: 90,
    mark: mark(4, "GL"),
  },
];

function cloneMember(row: ClubMember): ClubMember {
  return { ...row, limits: [...row.limits], mark: { ...row.mark } };
}

export function memberBg(row: ClubMember) {
  if (row.mark.bg) return row.mark.bg;
  return MARK_CATALOG[row.mark.colorId]?.bg ?? "#6b7280";
}

export function memberFg(row: ClubMember) {
  return row.mark.fg || "#111827";
}

export function hueOfBg(bg: string) {
  const hsl = bg.match(/hsl\(\s*([\d.]+)/i);
  if (hsl) return Number(hsl[1]);
  const hex = parseMarkHex(bg) ?? (bg.startsWith("#") ? bg : cssToHex(bg));
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function lettersBlocked(list: ClubMember[], tag: string, exceptId?: string) {
  const needle = tag.trim().toUpperCase();
  if (!needle) return false;
  if (RESERVED_TAGS.includes(needle)) {
    return list.find((row) => row.id === exceptId)?.mark.t !== needle;
  }
  return list.some((row) => row.id !== exceptId && row.mark.t === needle);
}

export function comboTakenByMembers(list: ClubMember[], colorId: number, bg: string, fg: string, exceptId?: string) {
  const ink = fg.trim().toLowerCase();
  if (!ink) return false;
  const hex = cssToHex(bg).toLowerCase();
  const family = colorId >= 0 ? familyOf(colorId) : -1;
  return list.some((row) => {
    if (row.id === exceptId) return false;
    if (memberFg(row).toLowerCase() !== ink) return false;
    if (cssToHex(memberBg(row)).toLowerCase() === hex) return true;
    return family >= 0 && row.mark.colorId >= 0 && familyOf(row.mark.colorId) === family;
  });
}

export function vipTaken(list: ClubMember[], vip: number, exceptId?: string) {
  if (!vip) return false;
  return list.some((row) => row.id !== exceptId && row.vip === vip);
}

function migrateStatus(value: unknown): MemberStatus {
  if (value === "school" || value === "guest") return "pending";
  if (value === "club") return "active";
  if (MEMBER_STATUSES.includes(value as MemberStatus)) return value as MemberStatus;
  return "active";
}

export function loadMembers(): ClubMember[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SEED_MEMBERS.map(cloneMember);
    const parsed = JSON.parse(raw) as ClubMember[];
    if (!Array.isArray(parsed) || !parsed.length) return SEED_MEMBERS.map(cloneMember);
    return parsed.map((row) => ({
      ...row,
      limits: (row.limits ?? []).filter((item) => LIMIT_OPTIONS.includes(item as (typeof LIMIT_OPTIONS)[number])),
      status: migrateStatus(row.status),
      vip: Number.isInteger(row.vip) && row.vip > 0 ? Number(row.vip) : 0,
      mark: {
        colorId: Number.isInteger(row.mark?.colorId) ? row.mark.colorId : -1,
        bg: typeof row.mark?.bg === "string" && row.mark.bg ? row.mark.bg : MARK_CATALOG[row.mark?.colorId]?.bg,
        fg: typeof row.mark?.fg === "string" ? row.mark.fg : "",
        t: typeof row.mark?.t === "string" ? row.mark.t.trim().slice(0, 3).toUpperCase() : "",
      },
    }));
  } catch {
    return SEED_MEMBERS.map(cloneMember);
  }
}

export function saveMembers(list: ClubMember[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}
