import { LIMIT_OPTIONS } from "./capacity";
import type { ScheduleVariant } from "../data/slots";

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

export type LoadTone = Exclude<(typeof LOAD_PASTELS)[number]["id"], "clear">;
export type HourLoadRow = (LoadTone | null)[];
export type HourLoadMap = Record<string, HourLoadRow>;
export const hourLoadKey = (variant: ScheduleVariant, limit: string) => `${variant}:${limit}`;
export const emptyLoadRow = (): HourLoadRow => Array.from({ length: 24 }, () => null);
export const defaultHourLoad = (): HourLoadMap => ({});
export const sameLoadRow = (a: HourLoadRow, b: HourLoadRow) => a.length === b.length && a.every((tone, hour) => tone === b[hour]);
export const loadToneColor = (tone: LoadTone) => LOAD_PASTELS.find((entry) => entry.id === tone)?.color ?? "transparent";
export function validLoadKey(key: string) {
  const [variant, limit, extra] = key.split(":");
  return extra === undefined && (variant === "nitro" || variant === "regular") && LIMIT_OPTIONS.some((item) => item === limit);
}
export function isHourLoadRow(value: unknown): value is HourLoadRow {
  return Array.isArray(value) && value.length === 24 && value.every((tone) =>
    tone === null || LOAD_PASTELS.some((entry) => entry.id !== "clear" && entry.id === tone));
}
export function isHourLoadMap(value: unknown): value is HourLoadMap {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([key, row]) => validLoadKey(key) && isHourLoadRow(row));
}

/** Old browser colors have no tournament kind. Import only into an explicitly selected pair. */
export function legacyLoadRow(value: unknown, limit: string): HourLoadRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const old = (value as Record<string, unknown>)[limit];
  if (!Array.isArray(old)) return null;
  const rgb = (color: string) => color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)?.slice(1).join(",");
  const row = emptyLoadRow().map((_, hour) => {
    const color = old[hour];
    if (typeof color !== "string") return null;
    const tone = LOAD_PASTELS.find((entry) => entry.color && rgb(entry.color) === rgb(color));
    return tone && tone.id !== "clear" ? tone.id : null;
  });
  return row.some(Boolean) ? row : null;
}

/** Static CSS spans follow real half-slots, excluding hidden hours and unavailable capacity. */
export function hourLoadSegments(row: HourLoadRow | undefined, visibleHalves: number[], allowed: (half: number) => boolean = () => true) {
  const spans: { startHalf: number; endHalf: number; tone: LoadTone }[] = [];
  for (const half of visibleHalves) {
    const tone = row?.[Math.floor(half / 2)];
    if (!tone || !allowed(half)) continue;
    const last = spans.at(-1);
    if (last && last.endHalf === half && last.tone === tone) last.endHalf = half + 1;
    else spans.push({ startHalf: half, endHalf: half + 1, tone });
  }
  return spans;
}
