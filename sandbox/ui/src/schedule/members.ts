import { LIMIT_OPTIONS } from "./capacity";
import { MARK_CATALOG, cssToHex, familyOf, parseMarkHex } from "./markCatalog";
import { asVip } from "./marks";
import { emptyRoomPlay } from "./rooms";

export type MemberStatus = "active" | "pending" | "paused" | "archived" | "banned";

export const MEMBER_STATUSES: readonly MemberStatus[] = ["active", "pending", "paused", "archived", "banned"];
export const DEFAULT_STATUS_FILTER: MemberStatus = "active";

export type MemberMark = {
  colorId: number;
  bg?: string;
  fg: string;
  t: string;
};

export type CommunityKind = "school" | "club";
export type PayKind = "usdt_trc20" | "skrill" | "custom";

export type PayMethod = {
  id: string;
  kind?: PayKind;
  title: string;
  details: string;
  comment: string;
  primary: boolean;
};

export type NickStamp = {
  nick: string;
  at: string;
};

export type RoomPlay = {
  id: string;
  roomId: string;
  nick: string;
  limits: string[];
  nitroLimits?: string[];
  regularLimits?: string[];
  kinds: ("nitro" | "regular")[];
  nickHistory: NickStamp[];
};

export function cleanPlayLimits(list: string[] | undefined) {
  return LIMIT_OPTIONS.filter((limit) => list?.includes(limit));
}

export function limitsOfKind(play: RoomPlay, kind: "nitro" | "regular") {
  const named = kind === "nitro" ? play.nitroLimits : play.regularLimits;
  if (Array.isArray(named)) return cleanPlayLimits(named);
  if (play.kinds?.includes(kind)) return cleanPlayLimits(play.limits);
  return [];
}

export function unionPlayLimits(play: RoomPlay) {
  return cleanPlayLimits([...limitsOfKind(play, "nitro"), ...limitsOfKind(play, "regular")]);
}

export function withKindLimits(play: RoomPlay, kind: "nitro" | "regular", limits: string[]): RoomPlay {
  const nitro = kind === "nitro" ? cleanPlayLimits(limits) : limitsOfKind(play, "nitro");
  const regular = kind === "regular" ? cleanPlayLimits(limits) : limitsOfKind(play, "regular");
  const kinds: ("nitro" | "regular")[] = [];
  if (nitro.length) kinds.push("nitro");
  if (regular.length) kinds.push("regular");
  return {
    ...play,
    nitroLimits: nitro,
    regularLimits: regular,
    limits: cleanPlayLimits([...nitro, ...regular]),
    kinds,
  };
}

export function normalizePlay(play: RoomPlay): RoomPlay {
  const nitro = limitsOfKind(play, "nitro");
  const regular = limitsOfKind(play, "regular");
  const limits = cleanPlayLimits([...nitro, ...regular]);
  const kinds: ("nitro" | "regular")[] = [];
  if (nitro.length) kinds.push("nitro");
  if (regular.length) kinds.push("regular");
  return {
    ...play,
    nitroLimits: nitro,
    regularLimits: regular,
    limits,
    kinds,
    nickHistory: (play.nickHistory ?? []).map((stamp) => ({ ...stamp })),
  };
}

export type ClubMember = {
  id: string;
  name: string;
  discord: string;
  discordId: string;
  discordDisplay?: string;
  discordGuildNick?: string;
  discordRoles?: string[];
  room: string;
  nickHistory?: string[];
  email: string;
  google?: string;
  phone?: string;
  telegram?: string;
  contactAlt?: string;
  birthday?: string;
  city?: string;
  country?: string;
  showExtraTz?: boolean;
  extraUtc?: number;
  joinedAt?: string;
  poolShare?: number;
  community?: CommunityKind;
  avatar?: string;
  tables?: number;
  passwordSet?: boolean;
  pays?: PayMethod[];
  plays?: RoomPlay[];
  limits: string[];
  status: MemberStatus;
  appAccess: boolean;
  isAdmin?: boolean;
  vipNitro: number;
  vipRegular: number;
  distance: number;
  mark: MemberMark;
};

export function emptyPay(primary = false): PayMethod {
  return {
    id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "custom",
    title: "",
    details: "",
    comment: "",
    primary,
  };
}

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
    appAccess: true,
    isAdmin: true,
    vipNitro: 1,
    vipRegular: 2,
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
    appAccess: true,
    vipNitro: 0,
    vipRegular: 0,
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
    appAccess: true,
    vipNitro: 2,
    vipRegular: 1,
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
    google: "you@gmail.com",
    discordDisplay: "you",
    discordGuildNick: "you",
    discordRoles: ["Member", "Nitro"],
    avatar: "https://cdn.discordapp.com/embed/avatars/2.png",
    nickHistory: ["YouOld", "YouNick"],
    phone: "",
    telegram: "you_rp",
    birthday: "1994-03-12",
    city: "Москва",
    country: "Россия",
    showExtraTz: false,
    extraUtc: 3,
    joinedAt: "2024-11-03",
    poolShare: 80,
    community: "club",
    tables: 11,
    passwordSet: false,
    pays: [
      { id: "pay-you-usdt", kind: "usdt_trc20", title: "USDT TRC20", details: "T…sandbox", comment: "", primary: true },
      { id: "pay-you-skrill", kind: "skrill", title: "Skrill", details: "", comment: "", primary: false },
      { id: "pay-you-1", kind: "custom", title: "Тинькофф", details: "2200 •••• 4412", comment: "", primary: false },
    ],
    plays: [
      {
        id: "play-you-1",
        roomId: "winamax",
        nick: "YouNick",
        limits: ["50", "100"],
        kinds: ["nitro"],
        nickHistory: [
          { nick: "YouNick", at: "2026-09-18T10:00:00.000Z" },
          { nick: "YouOld", at: "2026-08-01T12:00:00.000Z" },
        ],
      },
    ],
    limits: ["50", "100"],
    status: "active",
    appAccess: true,
    vipNitro: 0,
    vipRegular: 0,
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
    appAccess: true,
    vipNitro: 3,
    vipRegular: 0,
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
    community: "school",
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
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
    appAccess: true,
    vipNitro: 0,
    vipRegular: 0,
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
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
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
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 90,
    mark: mark(4, "GL"),
  },
];

/** На сервере Discord, расписание ещё не открывали. Дистанцию уже считаем. */
export const GUILD_ONLY: ClubMember[] = [
  {
    id: "RP-912",
    name: "Нина",
    discord: "nina",
    discordId: "601882110334",
    room: "",
    email: "",
    limits: [],
    status: "active",
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 6,
    mark: { colorId: -1, fg: "#111827", t: "", bg: "#6b7280" },
  },
  {
    id: "RP-913",
    name: "Костя",
    discord: "kostya",
    discordId: "712993441008",
    room: "",
    email: "",
    limits: [],
    status: "active",
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 18,
    mark: { colorId: -1, fg: "#111827", t: "", bg: "#6b7280" },
  },
  {
    id: "RP-914",
    name: "Даша",
    discord: "daria",
    discordId: "823104559117",
    room: "",
    email: "",
    limits: [],
    status: "active",
    appAccess: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 3,
    mark: { colorId: -1, fg: "#111827", t: "", bg: "#6b7280" },
  },
];

function cloneMember(row: ClubMember): ClubMember {
  return {
    ...row,
    limits: [...row.limits],
    mark: { ...row.mark },
    nickHistory: [...(row.nickHistory ?? [])],
    pays: (row.pays ?? []).map((item) => ({ ...item })),
    discordRoles: [...(row.discordRoles ?? [])],
    plays: (row.plays ?? []).map((item) => normalizePlay(item)),
  };
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
  return list.some((row) => row.id !== exceptId && row.mark.t.trim().toUpperCase() === needle);
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

export function memberVip(row: Pick<ClubMember, "vipNitro" | "vipRegular">, variant: "nitro" | "regular") {
  return asVip(variant === "nitro" ? row.vipNitro : row.vipRegular);
}

export function vipTaken(list: ClubMember[], variant: "nitro" | "regular", vip: number, exceptId?: string) {
  if (!vip) return false;
  return list.some((row) => row.id !== exceptId && memberVip(row, variant) === vip);
}

function migrateStatus(value: unknown): MemberStatus {
  if (value === "school" || value === "guest") return "pending";
  if (value === "club") return "active";
  if (MEMBER_STATUSES.includes(value as MemberStatus)) return value as MemberStatus;
  return "active";
}

function withAccess(row: ClubMember, fallback: boolean): ClubMember {
  const seed = SEED_MEMBERS.find((item) => item.id === row.id);
  const legacyNicks = Array.isArray(row.nickHistory) ? row.nickHistory.filter(Boolean) : [];
  const pays = Array.isArray(row.pays)
    ? row.pays.map((item, index) => ({
        id: item.id || `pay-${row.id}-${index}`,
        title: String(item.title ?? (item as { kind?: string }).kind ?? ""),
        details: String(item.details ?? ""),
        comment: String(item.comment ?? ""),
        primary: Boolean(item.primary),
      }))
    : (seed?.pays ?? []).map((item) => ({ ...item }));
  if (pays.length && !pays.some((item) => item.primary)) pays[0].primary = true;
  const asPlay = (item: Partial<RoomPlay> | undefined, index: number, nickFallback: string): RoomPlay => {
    const nick = String(item?.nick ?? nickFallback);
    const stamps = Array.isArray(item?.nickHistory)
      ? item.nickHistory.filter((stamp) => stamp?.nick).map((stamp) => ({ nick: String(stamp.nick), at: String(stamp.at || "") }))
      : [];
    const fromLegacy = legacyNicks.filter((value) => value !== nick).map((value, i) => ({ nick: value, at: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z` }));
    return normalizePlay({
      id: item?.id || `play-${row.id}-${index}`,
      roomId: item?.roomId || "winamax",
      nick,
      limits: (item?.limits ?? row.limits ?? []).filter((limit) => LIMIT_OPTIONS.includes(limit as (typeof LIMIT_OPTIONS)[number])),
      nitroLimits: item?.nitroLimits,
      regularLimits: item?.regularLimits,
      kinds: (item?.kinds ?? ["nitro"]).filter((kind) => kind === "nitro" || kind === "regular") as ("nitro" | "regular")[],
      nickHistory: (stamps.length ? stamps : nick ? [{ nick, at: new Date().toISOString() }, ...fromLegacy] : fromLegacy).slice(0, 20),
    });
  };
  const plays =
    Array.isArray(row.plays) && row.plays.length
      ? row.plays.map((item, index) => asPlay(item, index, row.room || row.discord || ""))
      : seed?.plays?.length
        ? seed.plays.map((item, index) => asPlay(item, index, row.room || row.discord || ""))
        : [asPlay({ ...emptyRoomPlay("winamax"), nick: row.room || row.discord || "", limits: row.limits }, 0, row.room || row.discord || "")];
  const extraUtc = Number(row.extraUtc ?? seed?.extraUtc ?? 3);
  const tables = Number(row.tables ?? seed?.tables);
  return {
    ...row,
    discordDisplay: String(row.discordDisplay ?? seed?.discordDisplay ?? row.discord ?? ""),
    discordGuildNick: String(row.discordGuildNick ?? seed?.discordGuildNick ?? row.discord ?? ""),
    discordRoles: Array.isArray(row.discordRoles) && row.discordRoles.length ? row.discordRoles.filter(Boolean) : [...(seed?.discordRoles ?? [])],
    nickHistory: legacyNicks.length ? legacyNicks : row.room ? [row.room] : [...(seed?.nickHistory ?? [])],
    google: String(row.google ?? seed?.google ?? ""),
    phone: String(row.phone ?? seed?.phone ?? ""),
    telegram: String(row.telegram ?? seed?.telegram ?? ""),
    contactAlt: String(row.contactAlt ?? seed?.contactAlt ?? ""),
    birthday: String(row.birthday ?? seed?.birthday ?? ""),
    city: String(row.city ?? seed?.city ?? ""),
    country: String(row.country ?? seed?.country ?? ""),
    showExtraTz: row.showExtraTz === true,
    extraUtc: Number.isFinite(extraUtc) ? Math.min(14, Math.max(-12, Math.round(extraUtc))) : 3,
    joinedAt: String(row.joinedAt || seed?.joinedAt || ""),
    poolShare: Number.isFinite(Number(row.poolShare ?? seed?.poolShare)) ? Math.min(100, Math.max(0, Math.round(Number(row.poolShare ?? seed?.poolShare ?? 80)))) : 80,
    community: row.community === "school" || row.community === "club" ? row.community : seed?.community === "school" ? "school" : row.status === "pending" ? "school" : "club",
    avatar: String(row.avatar || seed?.avatar || ""),
    tables: Number.isFinite(tables) && tables >= 1 ? Math.min(30, Math.round(tables)) : 1,
    vipNitro: asVip(row.vipNitro) || asVip((row as ClubMember & { vip?: number }).vip),
    vipRegular: asVip(row.vipRegular),
    passwordSet: Boolean(row.passwordSet),
    pays,
    plays,
    appAccess: typeof row.appAccess === "boolean" ? row.appAccess : fallback,
    isAdmin: Boolean(row.isAdmin) || row.discord === "polar",
  };
}

export function memberOfSession(list: ClubMember[], session: { memberId?: string; nick: string }) {
  if (session.memberId) {
    const byId = list.find((row) => row.id === session.memberId);
    if (byId) return byId;
  }
  const nick = session.nick.toLowerCase();
  if (!nick) return undefined;
  return list.find((row) => row.discord.toLowerCase() === nick || row.email.toLowerCase().startsWith(nick));
}

/** Бай-ины, которые человек отметил в кабинете у Winamax. */
export function loadStoredWinamaxLimits(memberId?: string): string[] {
  if (!memberId) return [];
  try {
    const raw = localStorage.getItem(`v2-winamax-limits:${memberId}`);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return LIMIT_OPTIONS.filter((limit) => parsed.includes(limit));
  } catch {
    return [];
  }
}

export function saveStoredWinamaxLimits(memberId: string | undefined, limits: string[]) {
  if (!memberId) return;
  localStorage.setItem(
    `v2-winamax-limits:${memberId}`,
    JSON.stringify(LIMIT_OPTIONS.filter((limit) => limits.includes(limit))),
  );
}

function playsStoreKey(memberId: string) {
  return `v2-member-plays:${memberId}`;
}

/** Полный набор румов из кабинета: Nitro/Regular отдельно, ник и история. */
export function loadStoredPlays(memberId?: string): RoomPlay[] {
  if (!memberId) return [];
  try {
    const raw = localStorage.getItem(playsStoreKey(memberId));
    const parsed = raw ? (JSON.parse(raw) as RoomPlay[]) : [];
    if (!Array.isArray(parsed) || !parsed.length) return [];
    return parsed.map((row) => normalizePlay(row));
  } catch {
    return [];
  }
}

export function saveStoredPlays(memberId: string | undefined, plays: RoomPlay[]) {
  if (!memberId) return;
  const cleaned = plays.map((row) => normalizePlay(row));
  localStorage.setItem(playsStoreKey(memberId), JSON.stringify(cleaned));
  const winamax = cleaned.find((row) => row.roomId === "winamax");
  saveStoredWinamaxLimits(memberId, winamax ? unionPlayLimits(winamax) : []);
}

export function winamaxPlayLimits(session: { memberId?: string; nick: string }): string[] {
  const row = memberOfSession(loadMembers(), session);
  const play =
    row?.plays?.find((item) => item.roomId === "winamax") ??
    loadStoredPlays(session.memberId).find((item) => item.roomId === "winamax");
  const stored = loadStoredWinamaxLimits(session.memberId);
  const raw = play ? unionPlayLimits(play) : stored.length ? stored : row?.limits ?? [];
  return LIMIT_OPTIONS.filter((limit) => raw.includes(limit));
}

export function loadMembers(): ClubMember[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ClubMember[]) : null;
    const base =
      Array.isArray(parsed) && parsed.length
        ? parsed.map((row) =>
            withAccess(
              {
                ...row,
                limits: (row.limits ?? []).filter((item) => LIMIT_OPTIONS.includes(item as (typeof LIMIT_OPTIONS)[number])),
                status: migrateStatus(row.status),
                vipNitro: asVip(row.vipNitro) || asVip((row as ClubMember & { vip?: number }).vip),
                vipRegular: asVip(row.vipRegular),
                mark: {
                  colorId: Number.isInteger(row.mark?.colorId) ? row.mark.colorId : -1,
                  bg: typeof row.mark?.bg === "string" && row.mark.bg ? row.mark.bg : MARK_CATALOG[row.mark?.colorId]?.bg,
                  fg: typeof row.mark?.fg === "string" ? row.mark.fg : "",
                  t: typeof row.mark?.t === "string" ? row.mark.t.trim().slice(0, 3).toUpperCase() : "",
                },
              },
              migrateStatus(row.status) === "active" || migrateStatus(row.status) === "paused",
            ),
          )
        : SEED_MEMBERS.map(cloneMember);
    const known = new Set(base.map((row) => row.id));
    const extra = GUILD_ONLY.filter((row) => !known.has(row.id)).map(cloneMember);
    return extra.length ? [...base, ...extra] : base;
  } catch {
    return [...SEED_MEMBERS, ...GUILD_ONLY].map(cloneMember);
  }
}

export function saveMembers(list: ClubMember[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}
