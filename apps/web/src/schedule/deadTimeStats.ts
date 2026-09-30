import type { DeadTimeInterval, ScheduleVariant } from "../data/deadTime";
import { formatVariantLimit } from "./capacity";
import { hoursFromSlots } from "./roster";

export type ScheduledHalf = {
  day: number;
  half: number;
  variant: ScheduleVariant;
  limit: string;
};

export type DeadTimeBreakdown = {
  byPair: Record<string, number>;
  total: number;
};

export function isDeadTimeHalf(slot: ScheduledHalf, intervals: readonly DeadTimeInterval[]) {
  return intervals.some((interval) =>
    interval.variant === slot.variant &&
    interval.limit === slot.limit &&
    slot.half >= interval.startHalf &&
    slot.half < interval.endHalf,
  );
}

/** Detail is unique inside each variant/limit pair; total is unique physical day/half time. */
export function deadTimeBreakdown(
  slots: readonly ScheduledHalf[],
  intervals: readonly DeadTimeInterval[],
): DeadTimeBreakdown {
  const pairHalves = new Map<string, Set<string>>();
  const physicalHalves = new Set<string>();

  for (const slot of slots) {
    if (!isDeadTimeHalf(slot, intervals)) continue;
    const physicalKey = `${slot.day}:${slot.half}`;
    const pairKey = formatVariantLimit(slot.variant, slot.limit);
    const halves = pairHalves.get(pairKey) ?? new Set<string>();
    halves.add(physicalKey);
    pairHalves.set(pairKey, halves);
    physicalHalves.add(physicalKey);
  }

  return {
    byPair: Object.fromEntries([...pairHalves].map(([key, halves]) => [key, hoursFromSlots(halves.size)])),
    total: hoursFromSlots(physicalHalves.size),
  };
}
