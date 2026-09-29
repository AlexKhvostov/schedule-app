import { type ReactNode } from "react";

export function OptNlChip({
  label,
  tone,
  variant,
  lab,
  ghost,
}: {
  label: string;
  tone?: string;
  variant?: "nitro" | "regular";
  lab?: boolean;
  ghost?: boolean;
}) {
  if (ghost) return <div className="v2-opt-nl is-ghost" aria-hidden />;
  const chipTone = variant === "nitro"
    ? `color-mix(in srgb, var(--primary) 68%, ${tone ?? "var(--muted-foreground)"})`
    : variant === "regular"
      ? `color-mix(in srgb, var(--warning) 68%, ${tone ?? "var(--muted-foreground)"})`
      : tone;
  return (
    <div className={`v2-opt-nl${lab ? " v2-opt-lab" : ""}`} data-variant={variant}>
      {lab ? (
        label
      ) : (
        <span className="v2-limit-chip" style={chipTone ? { color: chipTone } : undefined}>
          {label}
        </span>
      )}
    </div>
  );
}

export function OptLevelLane({
  label,
  tone,
  variant,
  laneKey,
  children,
  showNl = true,
  ghost,
}: {
  label: string;
  tone?: string;
  variant?: "nitro" | "regular";
  laneKey?: string;
  children?: ReactNode;
  showNl?: boolean;
  ghost?: boolean;
}) {
  return (
    <div data-lane={laneKey} className={`v2-opt-lane${ghost ? " is-ghost" : ""}`} aria-hidden={ghost || undefined}>
      {showNl ? <OptNlChip label={label} tone={tone} variant={variant} ghost={ghost} /> : null}
      <div className={`v2-opt-track${ghost ? " is-ghost" : ""}`}>{ghost ? null : children}</div>
    </div>
  );
}
