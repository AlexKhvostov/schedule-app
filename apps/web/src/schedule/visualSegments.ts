import { markKey, type Mark } from "./marks";

export type VisualSlot = {
  day: number;
  half: number;
  variant: "nitro" | "regular";
  limit: string;
  level: number;
  mark: Mark;
};

export type VisualSegment = Omit<VisualSlot, "half"> & {
  startHalf: number;
  endHalf: number;
};

function samePlayer(a: Mark, b: Mark) {
  if (a.memberId && b.memberId) return a.memberId === b.memberId;
  return markKey(a) === markKey(b);
}

function extendsSegment(segment: VisualSegment, slot: VisualSlot) {
  return segment.day === slot.day
    && segment.variant === slot.variant
    && segment.limit === slot.limit
    && segment.level === slot.level
    && segment.endHalf === slot.half
    && segment.mark.tables === slot.mark.tables
    && segment.mark.t.trim() === slot.mark.t.trim()
    && samePlayer(segment.mark, slot.mark);
}

/** Builds a visual projection only; stored occupancy and time calculations stay slot-based. */
export function mergeVisualSlots(slots: readonly VisualSlot[]): VisualSegment[] {
  const segments: VisualSegment[] = [];
  for (const slot of slots) {
    const last = segments.at(-1);
    if (last && extendsSegment(last, slot)) {
      last.endHalf = slot.half + 1;
      continue;
    }
    segments.push({
      day: slot.day,
      startHalf: slot.half,
      endHalf: slot.half + 1,
      variant: slot.variant,
      limit: slot.limit,
      level: slot.level,
      mark: slot.mark,
    });
  }
  return segments;
}
