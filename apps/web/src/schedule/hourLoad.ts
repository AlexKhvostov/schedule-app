import { LIMIT_OPTIONS } from "./capacity";

/** Таблица hour_load: limit × hour(0–23) × color. Позже можно унести в БД как есть. */
export type HourLoadRow = (string | null)[];
export type HourLoadMap = Record<string, HourLoadRow>;

/** Пастельная радуга: полупрозрачный слой поверх сетки. */
export const LOAD_PASTELS = [
  { id: "clear", color: null, swatch: "transparent" },
  { id: "rose", color: "rgba(244, 170, 176, 0.22)", swatch: "rgba(244, 170, 176, 0.40)" },
  { id: "peach", color: "rgba(250, 196, 150, 0.22)", swatch: "rgba(250, 196, 150, 0.40)" },
  { id: "lemon", color: "rgba(248, 228, 150, 0.22)", swatch: "rgba(248, 228, 150, 0.40)" },
  { id: "lime", color: "rgba(210, 230, 160, 0.22)", swatch: "rgba(210, 230, 160, 0.40)" },
  { id: "mint", color: "rgba(170, 220, 186, 0.22)", swatch: "rgba(170, 220, 186, 0.40)" },
  { id: "aqua", color: "rgba(155, 214, 214, 0.22)", swatch: "rgba(155, 214, 214, 0.40)" },
  { id: "sky", color: "rgba(160, 196, 236, 0.22)", swatch: "rgba(160, 196, 236, 0.40)" },
  { id: "iris", color: "rgba(176, 180, 230, 0.22)", swatch: "rgba(176, 180, 230, 0.40)" },
  { id: "lilac", color: "rgba(206, 180, 230, 0.22)", swatch: "rgba(206, 180, 230, 0.40)" },
  { id: "pink", color: "rgba(236, 180, 210, 0.22)", swatch: "rgba(236, 180, 210, 0.40)" },
] as const;

const KEY = "v2-hour-load";

export function emptyLoadRow(): HourLoadRow {
  return Array.from({ length: 24 }, () => null);
}

export function cloneHourLoad(map: HourLoadMap): HourLoadMap {
  return Object.fromEntries(Object.entries(map).map(([limit, row]) => [limit, row.slice()]));
}

export function sameHourLoad(a: HourLoadMap, b: HourLoadMap) {
  return LIMIT_OPTIONS.every((limit) => {
    const left = a[limit] ?? emptyLoadRow();
    const right = b[limit] ?? emptyLoadRow();
    return left.length === right.length && left.every((color, hour) => color === right[hour]);
  });
}

export function defaultHourLoad(): HourLoadMap {
  return Object.fromEntries(LIMIT_OPTIONS.map((limit) => [limit, emptyLoadRow()]));
}

export function loadHourLoad(): HourLoadMap {
  const base = defaultHourLoad();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const limit of LIMIT_OPTIONS) {
      const row = parsed[limit];
      if (!Array.isArray(row)) continue;
      base[limit] = emptyLoadRow().map((_, hour) => (typeof row[hour] === "string" ? row[hour] : null));
    }
  } catch {
    return base;
  }
  return base;
}

export function saveHourLoad(map: HourLoadMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

/** Старые сохранения в localStorage держат 0.14 — поднимаем до текущей глубины слоя. */
function washFill(color: string | null) {
  if (!color) return "transparent";
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.22)`;
}

export function loadGradient(row: HourLoadRow | undefined) {
  const hours = row ?? emptyLoadRow();
  if (hours.every((color) => !color)) return "none";
  const stops = hours.map((color, hour) => {
    const from = (hour / 24) * 100;
    const to = ((hour + 1) / 24) * 100;
    return `${washFill(color)} ${from}% ${to}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
