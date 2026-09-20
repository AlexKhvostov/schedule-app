import { type CSSProperties } from "react";
import { MARK_PREVIEW_TABLES } from "../schedule/markCatalog";

export function MarkFace({
  letters,
  tables,
  showTables = true,
}: {
  letters?: string;
  tables?: number;
  showTables?: boolean;
}) {
  const tag = letters?.trim();
  if (!tag) return null;
  return (
    <span className={`v2-opt-face${showTables && tables != null ? " has-n" : ""}`}>
      <b>{tag}</b>
      {showTables && tables != null ? <i>{tables}</i> : null}
    </span>
  );
}

type SlotProps = {
  past?: boolean;
  locked?: boolean;
  letters?: string;
  bg?: string;
  fg?: string;
  tables?: number;
  showTables?: boolean;
  className?: string;
};

export function ScheduleSlot({
  past,
  locked,
  letters,
  bg,
  fg,
  tables = MARK_PREVIEW_TABLES,
  showTables = true,
  className,
}: SlotProps) {
  const on = Boolean(letters?.trim());
  return (
    <span
      className={`v2-opt-cell is-look${past ? " is-past" : ""}${locked ? " is-lock" : ""}${on ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      style={on ? ({ ["--mark"]: bg, ["--mark-ink"]: fg } as CSSProperties) : undefined}
    >
      <MarkFace letters={letters} tables={tables} showTables={showTables} />
    </span>
  );
}

type StripProps = {
  letters: string;
  bg: string;
  fg: string;
  pastLabel: string;
  futureLabel: string;
  lead: string;
};

export function ScheduleSlotStrip({ letters, bg, fg, pastLabel, futureLabel, lead }: StripProps) {
  const tag = letters.trim();
  return (
    <div className="v2-mark-look">
      <p className="v2-mark-look-lead">{lead}</p>
      <div className="v2-mark-look-row">
        <span>{pastLabel}</span>
        <div className="v2-opt v2-mark-look-grid is-kit">
          <div className="v2-opt-track v2-mark-look-track">
            <ScheduleSlot past />
            <ScheduleSlot past letters={tag} bg={bg} fg={fg} />
            <ScheduleSlot letters={tag} bg={bg} fg={fg} />
            <ScheduleSlot />
            <i className="v2-mark-look-now" aria-hidden />
          </div>
        </div>
        <span>{futureLabel}</span>
      </div>
    </div>
  );
}
