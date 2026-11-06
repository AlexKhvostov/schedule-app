import type { CSSProperties } from "react";
import type { SchedulePlayer } from "../data/players";
import type { Occupancy } from "../schedule/plan";
import { gridEdits } from "../schedule/gridEdits";

export type SeatDiff = {
  day: number;
  half: number;
  level: number;
  placed: boolean;
  tables: number;
  undone: Occupancy[number][number][number];
};

export function seatDiffs(prev: Occupancy, next: Occupancy) {
  return gridEdits(prev, next).map((edit): SeatDiff => ({
    day: edit.dayIdx + 1,
    half: edit.half,
    level: edit.level,
    placed: Boolean(edit.after),
    tables: edit.after?.tables ?? edit.before?.tables ?? 1,
    undone: edit.before,
  }));
}
function isClubCode(value?: string | null) {
  return Boolean(value && /^RP-[0-9A-Fa-f]{6}$/i.test(value.trim()));
}

export function showNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "";
  return text;
}

export function publicDiscordName(globalName?: string | null, username?: string | null, legacy?: string | null) {
  return showNick(globalName) || showNick(username) || showNick(legacy);
}

export function whoLines(row: SchedulePlayer) {
  return { title: publicDiscordName(row.globalName, row.username, row.guildNick ? "" : row.nick) || "—", sub: showNick(row.roomNick) };
}

export function rowInitials(nick: string, mark: string) {
  const letters = nick.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = letters.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (mark.trim()) return mark.trim().slice(0, 2).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

export function heatFill(value: number, max: number, tone: "day" | "cell"): CSSProperties | undefined {
  if (!value || !max) return undefined;
  const t = Math.min(1, value / max);
  const color = tone === "day" ? "var(--now, #e11d2e)" : "var(--chart-4, #a78bfa)";
  return {
    background: `color-mix(in srgb, ${color} ${Math.round(14 + t * 56)}%, var(--card))`,
    color: t > 0.55 ? "#fff7f7" : "var(--foreground)",
  };
}
