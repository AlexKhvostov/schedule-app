export type Mark = {
  t: string;
  discord: string;
  room: string;
  bg: string;
  fg: string;
  tables: number;
};

/** Цвета как в старой таблице: светлая плашка, тёмные буквы */
export const MARKS: Mark[] = [
  { t: "PL", discord: "polar", room: "PolarWin", bg: "#ffd966", fg: "#1a2118", tables: 1 },
  { t: "SV", discord: "svetka", room: "Svet50", bg: "#ea9999", fg: "#1a2118", tables: 2 },
  { t: "OK", discord: "oks", room: "OksanaN", bg: "#9fc5e8", fg: "#1a2118", tables: 1 },
  { t: "AL", discord: "alex", room: "AlexK", bg: "#b6d7a8", fg: "#1a2118", tables: 2 },
  { t: "XP", discord: "xplay", room: "Xplay1", bg: "#d5a6bd", fg: "#1a2118", tables: 1 },
  { t: "LO", discord: "lora", room: "LoraSpin", bg: "#f9cb9c", fg: "#1a2118", tables: 1 },
];

export const ME: Mark = { t: "YO", discord: "you", room: "YouNick", bg: "#76a5af", fg: "#1a2118", tables: 1 };
