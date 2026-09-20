export const SLOT_THEME_KEY = "v2-slot-theme";
export const SLOT_THEME_EVENT = "v2-slot-theme";

export const SLOT_FILL_ROLES = ["hours", "timeline", "day", "level", "date", "lane", "cell", "past"] as const;
export type SlotFillRole = (typeof SLOT_FILL_ROLES)[number];

export type SlotFill = {
  from: "auto" | "token" | "hex";
  token?: string;
  hex?: string;
};

export const SLOT_FILL_VARS: Record<SlotFillRole, string> = {
  hours: "--slot-hours",
  timeline: "--slot-hours-chip",
  day: "--slot-day",
  level: "--slot-level",
  date: "--slot-date",
  lane: "--slot-lane",
  cell: "--slot-cell",
  past: "--slot-past-cell",
};

export const FILL_TOKEN_GROUPS = {
  surfaces: ["background", "card", "popover", "muted", "header", "sidebar"],
  slots: ["slot", "slot-past", "day", "level", "lane"],
  brand: ["primary", "title", "ring", "border", "input", "secondary", "destructive", "success", "warning", "foreground"],
} as const;

export const FILL_TOKENS = [
  ...FILL_TOKEN_GROUPS.surfaces,
  ...FILL_TOKEN_GROUPS.slots,
  ...FILL_TOKEN_GROUPS.brand,
] as const;

export type SlotTheme = {
  /** Сколько светлого/тёмного ink подмешать в muted, чтобы слот отделился от фона. */
  lift: number;
  pastLift: number;
  /** Фон блока дня: на тёмной теме светлее слота. */
  dayLift: number;
  /** Плёнка прошлого на метке, % токена --background. */
  film: number;
  /** Снять насыщенность с метки под плёнкой, 0…1. */
  gray: number;
  fills?: Partial<Record<SlotFillRole, SlotFill>>;
};

export const DEFAULT_SLOT_THEME: SlotTheme = {
  lift: 0,
  pastLift: 5,
  dayLift: 18,
  film: 60,
  gray: 0.9,
  fills: {
    timeline: { from: "token", token: "day" },
    day: { from: "token", token: "card" },
    level: { from: "token", token: "card" },
    date: { from: "token", token: "day" },
    lane: { from: "token", token: "card" },
    cell: { from: "token", token: "background" },
    past: { from: "token", token: "slot-past" },
  },
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value: string, fallback = "#454954") {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const a = raw[1];
    const b = raw[2];
    const c = raw[3];
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return fallback;
}

export function fillToCss(fill?: SlotFill) {
  if (!fill || fill.from === "auto") return;
  if (fill.from === "token" && fill.token) return `var(--${fill.token})`;
  if (fill.from === "hex" && fill.hex && HEX.test(fill.hex.trim())) return normalizeHex(fill.hex);
}

export function slotThemeVars(look: SlotTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--slot-lift": String(look.lift),
    "--slot-past-lift": String(look.pastLift),
    "--day-lift": String(look.dayLift),
    "--slot-film": `${look.film}%`,
    "--slot-film-gray": String(look.gray),
  };
  for (const role of SLOT_FILL_ROLES) {
    const css = fillToCss(look.fills?.[role]);
    if (css) vars[SLOT_FILL_VARS[role]] = css;
  }
  return vars;
}

function cloneSlotTheme(): SlotTheme {
  return { ...DEFAULT_SLOT_THEME, fills: { ...DEFAULT_SLOT_THEME.fills } };
}

export function loadSlotTheme(): SlotTheme {
  try {
    const raw = localStorage.getItem(SLOT_THEME_KEY);
    if (!raw) return cloneSlotTheme();
    const parsed = JSON.parse(raw) as Partial<SlotTheme>;
    const fills = parsed.fills && Object.keys(parsed.fills).length > 0 ? parsed.fills : { ...DEFAULT_SLOT_THEME.fills };
    return { ...DEFAULT_SLOT_THEME, ...parsed, fills };
  } catch {
    return cloneSlotTheme();
  }
}

export function saveSlotTheme(look: SlotTheme) {
  localStorage.setItem(SLOT_THEME_KEY, JSON.stringify(look));
  window.dispatchEvent(new Event(SLOT_THEME_EVENT));
}
