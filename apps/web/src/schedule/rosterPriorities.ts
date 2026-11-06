import { calculatePriority, coreOf, type PriorityGroup, type PriorityKind, type PrioritySource } from "./priorities";

export type RosterKind = PriorityKind | "both";

export type RosterPriority = { memberId: string; core: number; tier?: number; score: number; excluded: boolean };
export type RosterPrioritySource = {
  periodStart: string; kind: RosterKind; group: PriorityGroup; today: string;
  lastMonthEntries: number; calculatedAt?: string; revision: string; people: RosterPriority[];
};

/** Demo and contract tests use the same projection as the database RPC. */
export function compactRosterPriorities(source: PrioritySource, kind: PriorityKind, group: PriorityGroup): RosterPrioritySource {
  const people = source.people.map((person) => ({
    memberId: person.memberId, core: coreOf(person, kind, group),
    score: calculatePriority(person, source.periodStart, kind, group).total,
    excluded: kind === "nitro" ? person.excludedNitro : person.excludedRegular,
  }));
  return { periodStart: source.periodStart, kind, group, today: source.today, lastMonthEntries: source.lastMonthEntries,
    calculatedAt: source.calculatedAt, revision: JSON.stringify([source.periodStart, kind, group, people]), people };
}

export function combinedCorePriority(memberId: string, nitroHigh: number, regularHigh: number, nitroLow: number, regularLow: number): RosterPriority | null {
  const high = Math.min(nitroHigh || Infinity, regularHigh || Infinity);
  if (Number.isFinite(high)) return { memberId, core: high, tier: 0, score: 0, excluded: false };
  if (nitroLow > 0) return { memberId, core: nitroLow, tier: 1, score: 0, excluded: false };
  if (regularLow > 0) return { memberId, core: regularLow, tier: 2, score: 0, excluded: false };
  return null;
}
