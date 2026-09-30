import { formatDayLabel } from "../schedule/formatDate";
import { formatVariantLimit } from "../schedule/capacity";
import type { SchedulePlayer } from "../data/players";
import type { Mark } from "../schedule/marks";
import { seatsOf, type Occupancy } from "../schedule/plan";
import type { ScheduleVariant } from "../data/slots";

export type OverwriteSlot = { date: string; half: number; level: number };

export type OverwritePerson = {
  key: string;
  memberId?: string;
  tag: string;
  bg: string;
  fg: string;
  avatarUrl?: string;
  discord: string;
  username?: string;
  room: string;
  slots: OverwriteSlot[];
};

export type OverwriteAsk = {
  kind: "remove" | "place";
  variant: ScheduleVariant;
  limit: string;
  people: OverwritePerson[];
  memberIds: string[];
  slots: OverwriteSlot[];
  next: Occupancy;
  empty?: Occupancy;
};

export function scheduleKindGroups(
  variants: ScheduleVariant[],
  limits: string[],
  pairRows?: readonly { variant: ScheduleVariant; limit: string; disabled: boolean }[],
) {
  return [...new Set(variants)].map((variant) => ({
    variant,
    shortLabel: variant === "nitro" ? "N" : "E",
    rows: (pairRows?.filter((row) => row.variant === variant) ?? limits.map((limit) => ({ variant, limit, disabled: false }))).map(({ limit, disabled }) => ({
      key: `${variant}:${limit}`,
      limit,
      label: formatVariantLimit(variant, limit),
      disabled,
    })),
  })).filter((group) => group.rows.length);
}

export function slotSpan(half: number, hourShift = 0) {
  return slotRangeSpan(half, half, hourShift);
}

export function slotRangeSpan(fromHalf: number, toHalf: number, hourShift = 0) {
  const first = Math.min(fromHalf, toHalf);
  const last = Math.max(fromHalf, toHalf);
  const start = (first * 30 + hourShift * 60 + 24 * 60) % (24 * 60);
  const end = ((last + 1) * 30 + hourShift * 60 + 24 * 60) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function slotHoursValue(fromHalf: number, toHalfExclusive: number, lang: string) {
  const hours = Math.max(0, toHalfExclusive - fromHalf) / 2;
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(hours);
}

export function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  return formatDayLabel(year, monthIndex, day, lang);
}

export function tablesLabel(count: number, lang: string) {
  if (lang.startsWith("en")) return count === 1 ? "1 table" : `${count} tables`;
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return `${count} стол`;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${count} стола`;
  return `${count} столов`;
}

export function displayNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || /^RP-[0-9A-Fa-f]{6}$/i.test(text)) return "—";
  return text;
}

export function markWithPlayerIdentity(mark: Mark, players: readonly SchedulePlayer[]) {
  const identity = [mark.guildNick, mark.globalName, mark.username, mark.discord]
    .map((value) => value?.trim().toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));
  const byIdentity = identity.length
    ? players.find((row) => [row.guildNick, row.globalName, row.username, row.nick]
      .some((value) => value?.trim() && identity.includes(value.trim().toLocaleLowerCase())))
    : undefined;
  const sameTag = mark.t.trim()
    ? players.filter((row) => row.markTag.trim().toLocaleUpperCase() === mark.t.trim().toLocaleUpperCase())
    : [];
  const player = (mark.memberId ? players.find((row) => row.id === mark.memberId) : undefined)
    ?? byIdentity
    ?? (sameTag.length === 1 ? sameTag[0] : undefined);
  if (!player) return mark;
  return {
    ...mark,
    memberId: player.id,
    avatarUrl: player.avatarUrl || mark.avatarUrl,
    discord: player.nick || mark.discord,
    room: player.roomNick || mark.room,
    username: player.username || mark.username,
    globalName: player.globalName || mark.globalName,
    guildNick: player.guildNick || mark.guildNick,
  };
}

function visibleNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || /^RP-[0-9A-Fa-f]{6}$/i.test(text)) return "";
  return text;
}

export function writeSeat(item: Occupancy[number][number] | undefined, level: number, next: Mark | null) {
  const seats = seatsOf(item, Math.max(level + 1, 2));
  const out = seats.slice();
  out[level] = next;
  return out;
}

export function packOwner(mark: Mark): Omit<OverwritePerson, "slots"> {
  const discord =
    visibleNick(mark.guildNick) ||
    visibleNick(mark.globalName) ||
    visibleNick(mark.username) ||
    visibleNick(mark.discord) ||
    mark.t.trim() ||
    "—";
  const username = visibleNick(mark.username);
  return {
    key: mark.memberId || mark.discord || mark.t || "mark",
    memberId: mark.memberId,
    tag: mark.t,
    bg: mark.bg,
    fg: mark.fg,
    avatarUrl: mark.avatarUrl,
    discord,
    username: username && username.toLowerCase() !== discord.replace(/^@/, "").toLowerCase() ? username : "",
    room: visibleNick(mark.room),
  };
}

export function markQuery(focus: string) {
  return focus.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function findHitCss(query: string) {
  if (!query) return "";
  const root = `.v2-opt.is-find[data-opt-find="${query}"]`;
  return `${root} .v2-opt-cell.is-on[data-mark="${query}"],${root} .v2-opt-merged[data-mark="${query}"]{z-index:8;opacity:1;outline:1.5px solid var(--ring);outline-offset:0;animation:v2-chip-pulse 1.1s ease-in-out infinite}`;
}

export function nowAlongTrack(half: number, progress: number, startHalfOrVisible: number | number[] = 0, endHalf = 48) {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const visible = Array.isArray(startHalfOrVisible) ? startHalfOrVisible : undefined;
  const startHalf = typeof startHalfOrVisible === "number" ? startHalfOrVisible : 0;
  const slotCount = visible ? visible.length : endHalf - startHalf;
  const t = visible
    ? Math.max(0, visible.indexOf(half)) + clampedProgress
    : Math.min(endHalf, Math.max(startHalf, half + clampedProgress)) - startHalf;
  const cell = Math.min(slotCount - 1, Math.floor(t));
  const frac = t - cell;
  if (visible) {
    let gaps = 0;
    for (let at = 1; at <= cell; at += 1) {
      if (visible[at] !== visible[at - 1] + 1) gaps += 1;
    }
    return `var(--opt-pad-l) + ${cell} * (var(--opt-cell-w) + var(--opt-gap)) + ${gaps} * (var(--opt-work-gap-w) + var(--opt-gap)) + ${frac} * var(--opt-cell-w)`;
  }
  return `var(--opt-pad-l) + (100% - var(--opt-pad-l) - var(--opt-pad-r) - ${slotCount - 1} * var(--opt-gap)) * ${cell + frac} / ${slotCount} + ${cell} * var(--opt-gap)`;
}

export function nowHeadLeft(half: number, progress: number, startHalfOrVisible: number | number[] = 0, endHalf = 48) {
  return `calc(${nowAlongTrack(half, progress, startHalfOrVisible, endHalf)})`;
}

export function nowLineLeft(half: number, progress: number, startHalfOrVisible: number | number[] = 0, endHalf = 48) {
  return `calc(${nowAlongTrack(half, progress, startHalfOrVisible, endHalf)})`;
}
