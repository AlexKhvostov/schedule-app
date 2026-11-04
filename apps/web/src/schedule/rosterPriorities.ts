import { calculatePriority, coreOf, type PriorityGroup, type PriorityKind, type PrioritySource } from "./priorities";

export type RosterPriority = { memberId: string; core: number; score: number; excluded: boolean };
export type RosterPrioritySource = {
  periodStart: string; kind: PriorityKind; group: PriorityGroup; today: string;
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
