import { type CSSProperties, type ReactNode } from "react";
import { PairLabel } from "./PairLabel";

export function OptNlChip({
  label,
  tone,
  variant,
  lab,
  ghost,
  groupLabel,
}: {
  label: string;
  tone?: string;
  variant?: "nitro" | "regular";
  lab?: boolean;
  ghost?: boolean;
  groupLabel?: string;
}) {
  if (ghost) return <div className="v2-opt-nl is-ghost" aria-hidden />;
  const [limitLabel, laneNumber] = label.split("·");
  const chipTone = tone;
  return (
    <div className={`v2-opt-nl${lab ? " v2-opt-lab" : ""}`} data-variant={variant}>
      {lab ? (
        label
      ) : (
        <span className="v2-limit-chip" aria-label={groupLabel ?? label} style={chipTone ? { color: chipTone } : undefined}>
          <span className="v2-opt-limit-label" aria-hidden><PairLabel label={limitLabel} /></span>
          {laneNumber && <span className="v2-opt-lane-number" aria-hidden>{laneNumber}</span>}
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
    <div data-lane={laneKey} className={`v2-opt-lane${ghost ? " is-ghost" : ""}`} aria-hidden={ghost || undefined}
      style={{ "--slot-limit-tone": tone } as CSSProperties}>
      {showNl ? <OptNlChip label={label} tone={tone} variant={variant} ghost={ghost} /> : null}
      <div className={`v2-opt-track${ghost ? " is-ghost" : ""}`}>{ghost ? null : children}</div>
    </div>
  );
}
