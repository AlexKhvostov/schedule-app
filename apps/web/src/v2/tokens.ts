export const LAYOUT = {
  app: 1320,
  day: 80,
  slots: 48,
  gap: 1,
} as const;

/** Live chrome — follows club navy/cyan tokens on html. Not for canvas. */
export const R = {
  bg: "var(--background)",
  header: "var(--header)",
  panel: "var(--card)",
  line: "var(--border)",
  line2: "var(--border)",
  text: "var(--foreground)",
  muted: "var(--muted-foreground)",
  faint: "var(--muted-foreground)",
  soft: "var(--foreground)",
  cyan: "var(--primary)",
  cyanInk: "var(--primary-foreground)",
  ring: "var(--ring)",
  night: "transparent",
  weekend: "var(--muted)",
  today: "color-mix(in srgb, var(--ring) 10%, transparent)",
} as const;
