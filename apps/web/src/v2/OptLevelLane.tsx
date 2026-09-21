import { type ReactNode } from "react";

export function OptNlChip({
  label,
  tone,
  lab,
  ghost,
}: {
  label: string;
  tone?: string;
  lab?: boolean;
  ghost?: boolean;
}) {
  if (ghost) return <div className="v2-opt-nl is-ghost" aria-hidden />;
  return (
    <div className={`v2-opt-nl${lab ? " v2-opt-lab" : ""}`}>
      {lab ? (
        label
      ) : (
        <span className="v2-limit-chip" style={tone ? { color: tone } : undefined}>
          {label}
        </span>
      )}
    </div>
  );
}

export function OptLevelLane({
  label,
  tone,
  laneKey,
  children,
  showNl = true,
  ghost,
}: {
  label: string;
  tone?: string;
  laneKey?: string;
  children?: ReactNode;
  showNl?: boolean;
  ghost?: boolean;
}) {
  return (
    <div data-lane={laneKey} className={`v2-opt-lane${ghost ? " is-ghost" : ""}`} aria-hidden={ghost || undefined}>
      {showNl ? <OptNlChip label={label} tone={tone} ghost={ghost} /> : null}
      <div className={`v2-opt-track${ghost ? " is-ghost" : ""}`}>{ghost ? null : children}</div>
    </div>
  );
}
