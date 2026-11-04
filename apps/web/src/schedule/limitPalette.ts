// The six club palette limits do not change the existing playable limit catalog.
export const PALETTE_LIMITS = ["5", "25", "50", "100", "250", "500"] as const;
export type PaletteLimit = (typeof PALETTE_LIMITS)[number];
export type PaletteTheme = "light" | "dark";
export type LimitPalette = Record<PaletteLimit, Record<PaletteTheme, string>>;

export const DEFAULT_LIMIT_PALETTE: LimitPalette = {
  "5": { light: "#c62828", dark: "#ff7070" },
  "25": { light: "#177446", dark: "#4bd694" },
  "50": { light: "#2563c4", dark: "#5ba8ff" },
  "100": { light: "#343b46", dark: "#d8dee9" },
  "250": { light: "#b52a74", dark: "#f58bc5" },
  "500": { light: "#793eb5", dark: "#b79afa" },
};

export const PALETTE_BACKGROUNDS = { light: "#ffffff", dark: "#151a24" };
const hex = /^#[0-9a-f]{6}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function isLimitPalette(value: unknown): value is LimitPalette {
  return object(value) && Object.keys(value).length === PALETTE_LIMITS.length &&
    PALETTE_LIMITS.every((limit) => {
      const pair = value[limit];
      return object(pair) && Object.keys(pair).length === 2 &&
        [pair.light, pair.dark].every((color) => typeof color === "string" && hex.test(color));
    });
}

export function normalizeLimitPalette(value: unknown): LimitPalette {
  const source = isLimitPalette(value) ? value : DEFAULT_LIMIT_PALETTE;
  return Object.fromEntries(PALETTE_LIMITS.map((limit) =>
    [limit, { light: source[limit].light.toLowerCase(), dark: source[limit].dark.toLowerCase() }],
  )) as LimitPalette;
}

export function sameLimitPalette(a: LimitPalette, b: LimitPalette) {
  return PALETTE_LIMITS.every((limit) =>
    a[limit].light.toLowerCase() === b[limit].light.toLowerCase() &&
    a[limit].dark.toLowerCase() === b[limit].dark.toLowerCase());
}

export function palettePaint(limit: string, theme: PaletteTheme, palette = DEFAULT_LIMIT_PALETTE) {
  return palette[limit as PaletteLimit]?.[theme] ?? (theme === "light" ? "#343b46" : "#d8dee9");
}

export function paletteCssVars(palette: LimitPalette): Record<string, string> {
  return Object.fromEntries(PALETTE_LIMITS.flatMap((limit) =>
    (["light", "dark"] as const).map((theme) => [`--club-limit-${limit}-${theme}`, palette[limit][theme]]),
  ));
}

/** Relative luminance contrast of two opaque sRGB colors. */
export function paletteContrast(ink: string, background: string) {
  const luminance = (color: string) => [1, 3, 5].map((offset) => {
    const c = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(ink);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
