import { formatDayLabel } from "../schedule/formatDate";
import type { Mark } from "../schedule/marks";
import { seatsOf, type Occupancy } from "../schedule/plan";

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
  limit: string;
  people: OverwritePerson[];
  memberIds: string[];
  slots: OverwriteSlot[];
  next: Occupancy;
  empty?: Occupancy;
};

const SLOT_COUNT = 48;

export function slotSpan(half: number, hourShift = 0) {
  const start = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  const end = (start + 30) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
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
    visibleNick(mark.discord) ||
    visibleNick(mark.guildNick) ||
    visibleNick(mark.globalName) ||
    visibleNick(mark.username) ||
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
  return `.v2-opt.is-find[data-opt-find="${query}"] .v2-opt-cell.is-on[data-mark="${query}"]{z-index:8;opacity:1;outline:1.5px solid var(--ring);outline-offset:0;animation:v2-chip-pulse 1.1s ease-in-out infinite}`;
}

export function nowAlongTrack(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `var(--opt-pad-l) + (100% - var(--opt-pad-l) - var(--opt-pad-r) - 47 * var(--opt-gap)) * ${cell + frac} / ${SLOT_COUNT} + ${cell} * var(--opt-gap)`;
}

export function nowHeadLeft(half: number, progress: number) {
  return `calc(${nowAlongTrack(half, progress)})`;
}

export function nowLineLeft(half: number, progress: number) {
  return `calc(${nowAlongTrack(half, progress)})`;
}
