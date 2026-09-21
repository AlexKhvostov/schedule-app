import { type ReactNode } from "react";

export function OptNlChip({
  label,
  tone,
  lab,
}: {
  label: string;
  tone?: string;
  lab?: boolean;
}) {
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
}: {
  label: string;
  tone?: string;
  laneKey?: string;
  children: ReactNode;
  showNl?: boolean;
}) {
  return (
    <div data-lane={laneKey} className="v2-opt-lane">
      {showNl ? <OptNlChip label={label} tone={tone} /> : null}
      <div className="v2-opt-track">{children}</div>
    </div>
  );
}
