import { type ReactNode } from "react";

export function OptLevelLane({
  label,
  tone,
  laneKey,
  children,
}: {
  label: string;
  tone?: string;
  laneKey?: string;
  children: ReactNode;
}) {
  return (
    <div data-lane={laneKey} className="v2-opt-lane">
      <div className="v2-opt-nl">
        <span className="v2-limit-chip" style={tone ? { color: tone } : undefined}>
          {label}
        </span>
      </div>
      <div className="v2-opt-track">{children}</div>
    </div>
  );
}
