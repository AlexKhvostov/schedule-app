import type { DeadTimeInterval, ScheduleVariant } from "../data/deadTime";
import { formatVariantLimit } from "./capacity";
import { markKey, type Mark } from "./marks";
import type { Occupancy } from "./plan";
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

export type DeadTimeGridItem = {
  variant: ScheduleVariant;
  limit: string;
  grid: Occupancy;
};

export function deadTimeMemberKey(mark: Mark) {
  return mark.memberId || markKey(mark);
}

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

/** One grid pass for all people; each pair and the grand total deduplicate stacked levels. */
export function deadTimeBreakdownsByMember(
  items: readonly DeadTimeGridItem[],
  intervals: readonly DeadTimeInterval[],
): Record<string, DeadTimeBreakdown> {
  const tallies = new Map<string, { pairs: Map<string, Set<string>>; physical: Set<string> }>();

  for (const item of items) {
    const rules = intervals.filter((interval) => interval.variant === item.variant && interval.limit === item.limit);
    if (!rules.length) continue;
    const pairKey = formatVariantLimit(item.variant, item.limit);
    item.grid.forEach((day, dayIndex) => day.forEach((cell, half) => {
      if (!rules.some((rule) => half >= rule.startHalf && half < rule.endHalf)) return;
      const physicalKey = `${dayIndex + 1}:${half}`;
      for (const mark of cell) {
        if (!mark) continue;
        const memberKey = deadTimeMemberKey(mark);
        const tally = tallies.get(memberKey) ?? { pairs: new Map<string, Set<string>>(), physical: new Set<string>() };
        const pair = tally.pairs.get(pairKey) ?? new Set<string>();
        pair.add(physicalKey);
        tally.pairs.set(pairKey, pair);
        tally.physical.add(physicalKey);
        tallies.set(memberKey, tally);
      }
    }));
  }

  return Object.fromEntries([...tallies].map(([memberKey, tally]) => [memberKey, {
    byPair: Object.fromEntries([...tally.pairs].map(([pairKey, halves]) => [pairKey, hoursFromSlots(halves.size)])),
    total: hoursFromSlots(tally.physical.size),
  }]));
}
