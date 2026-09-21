export type Mark = {
  t: string;
  discord: string;
  room: string;
  bg: string;
  fg: string;
  tables: number;
  memberId?: string;
  avatarUrl?: string;
  username?: string;
  globalName?: string;
  guildNick?: string;
  priority?: number | null;
  vipNitro?: number | null;
  vipRegular?: number | null;
};

export function asVip(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(999, Math.round(n)) : 0;
}

export function vipOf(mark: Pick<Mark, "vipNitro" | "vipRegular">, variant: "nitro" | "regular") {
  return asVip(variant === "nitro" ? mark.vipNitro : mark.vipRegular);
}

export function markLabel(tag?: string | null) {
  const letters = tag?.trim() ?? "";
  return letters || "—";
}

export function markKey(mark: Mark) {
  return mark.t.trim() || `~${mark.discord}|${mark.room}`;
}

export function isOwnMark(seat: Mark | null | undefined, me: Mark) {
  if (!seat) return false;
  const tag = me.t.trim();
  if (tag) return seat.t.trim() === tag;
  return seat.discord === me.discord;
}

/** Цвета как в старой таблице: светлая плашка, тёмные буквы */
export const MARKS: Mark[] = [
  { t: "PL", discord: "polar", room: "PolarWin", bg: "#ffd966", fg: "#1a2118", tables: 12 },
  { t: "SV", discord: "svetka", room: "Svet50", bg: "#ea9999", fg: "#1a2118", tables: 14 },
  { t: "OK", discord: "oks", room: "OksanaN", bg: "#9fc5e8", fg: "#1a2118", tables: 16 },
  { t: "AL", discord: "alex", room: "AlexK", bg: "#b6d7a8", fg: "#1a2118", tables: 12 },
  { t: "XP", discord: "xplay", room: "Xplay1", bg: "#d5a6bd", fg: "#1a2118", tables: 14 },
  { t: "LO", discord: "lora", room: "LoraSpin", bg: "#f9cb9c", fg: "#1a2118", tables: 16 },
];

export const ME: Mark = { t: "YO", discord: "you", room: "YouNick", bg: "#76a5af", fg: "#1a2118", tables: 11 };
