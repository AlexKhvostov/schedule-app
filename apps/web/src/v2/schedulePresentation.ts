import type { CSSProperties } from "react";
import type { SchedulePlayer } from "../data/players";
import type { ClubMember } from "../schedule/members";
import type { Occupancy } from "../schedule/plan";
import type { RosterRow } from "../schedule/roster";

export type SeatDiff = {
  day: number;
  half: number;
  level: number;
  placed: boolean;
  tables: number;
  undone: Occupancy[number][number][number];
};

export function seatDiffs(prev: Occupancy, next: Occupancy) {
  const out: SeatDiff[] = [];
  for (let dayIdx = 0; dayIdx < next.length; dayIdx += 1) {
    for (let half = 0; half < 48; half += 1) {
      const before = prev[dayIdx]?.[half] ?? [];
      const after = next[dayIdx]?.[half] ?? [];
      const max = Math.max(before.length, after.length);
      for (let level = 0; level < max; level += 1) {
        if ((before[level]?.t ?? "") !== (after[level]?.t ?? "")) {
          out.push({
            day: dayIdx + 1,
            half,
            level,
            placed: Boolean(after[level]),
            tables: after[level]?.tables ?? before[level]?.tables ?? 1,
            undone: before[level] ?? null,
          });
        }
      }
    }
  }
  return out;
}
export function decorateDemoRoster(rows: RosterRow[], people: ClubMember[]): RosterRow[] {
  return rows.map((row) => {
    const person = people.find((item) => (row.mark.t && item.mark.t === row.mark.t) || item.discord === row.mark.discord);
    if (!person) return row;
    return {
      ...row,
      mark: {
        ...row.mark,
        memberId: person.id,
        avatarUrl: person.avatar || row.mark.avatarUrl,
        vipNitro: person.vipNitro || row.mark.vipNitro,
        vipRegular: person.vipRegular || row.mark.vipRegular,
      },
    };
  });
}

function isClubCode(value?: string | null) {
  return Boolean(value && /^RP-[0-9A-Fa-f]{6}$/i.test(value.trim()));
}

export function showNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "";
  return text;
}

export function whoLines(row: SchedulePlayer) {
  const server = showNick(row.guildNick);
  const handle = showNick(row.username) ? `@${row.username}` : "";
  const discord = showNick(row.globalName) || handle || showNick(row.nick);
  const title = discord || server || "—";
  const extra = [server, handle].filter((value) => {
    if (!value) return false;
    const bare = value.replace(/^@/, "");
    return bare.toLowerCase() !== title.replace(/^@/, "").toLowerCase();
  });
  return { title, sub: [...new Set(extra)].join(" · ") };
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
