import { cn } from "@/lib/utils";
import type { Mark } from "./marks";

export const MARK_W = 18;
export const MARK_H = 18;

type Props = {
  mark: Mark;
  muted?: boolean;
  past?: boolean;
  compact?: boolean;
  showTables?: boolean;
  width?: number | string;
  height?: number | string;
};

function outline(color: string) {
  return {
    textShadow: `-0.7px 0 0 ${color}, 0.7px 0 0 ${color}, 0 -0.7px 0 ${color}, 0 0.7px 0 ${color}`,
  };
}

export function MarkChip({
  mark,
  muted = false,
  past = false,
  compact = false,
  showTables = true,
  width = MARK_W,
  height = MARK_H,
}: Props) {
  const fluid = typeof width !== "number";
  const bg = past ? `color-mix(in srgb, ${mark.bg} 50%, #1e232c)` : mark.bg;
  const fg = past ? `color-mix(in srgb, ${mark.fg} 42%, #6e7671)` : mark.fg;
  return (
    <span
      className={cn(
        "relative flex overflow-hidden rounded-[2px] font-mono text-[8px] font-bold leading-none",
        showTables
          ? compact
            ? "items-start justify-start px-px pt-px"
            : "items-start justify-start p-[3px]"
          : "items-center justify-center",
        fluid ? "min-h-0 min-w-0 h-full w-full" : "shrink-0",
      )}
      style={{
        width,
        minWidth: fluid ? 0 : width,
        maxWidth: fluid ? "100%" : width,
        height,
        background: bg,
        color: fg,
        opacity: muted ? 0.34 : 1,
      }}
    >
      <span className="relative z-0">{mark.t}</span>
      {showTables && (
        <span
          className={cn(
            "absolute z-10 font-mono text-[5px] leading-none tabular-nums",
            compact ? "right-px bottom-px" : "right-[3px] bottom-[3px]",
          )}
          style={outline(bg)}
        >
          {mark.tables}
        </span>
      )}
    </span>
  );
}
