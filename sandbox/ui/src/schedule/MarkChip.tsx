import { cn } from "@/lib/utils";
import type { Mark } from "./marks";

export const MARK_W = 16;
export const MARK_H = 16;

type Props = {
  mark: Mark;
  muted?: boolean;
  width?: number;
  height?: number;
};

export function MarkChip({ mark, muted = false, width = MARK_W, height = MARK_H }: Props) {
  const compact = height < 14;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] font-mono leading-none font-bold",
        compact ? "text-[7px]" : "text-[8px]",
      )}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        height,
        background: mark.bg,
        color: mark.fg,
        opacity: muted ? 0.34 : 1,
      }}
    >
      {mark.t}
      <span className="absolute right-0 bottom-0 pr-px text-[5px] leading-none opacity-80">{mark.tables}</span>
    </span>
  );
}
