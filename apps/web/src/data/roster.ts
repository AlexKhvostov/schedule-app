import { demoActivePriority } from "./activePriority";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { loadMembers } from "../schedule/members";
import { isPriorityPeriod, priorityToday } from "../schedule/priorities";
import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { demoPrioritySlice } from "./priorities";
import { loadLimitMarks, markOf, type DirectoryRow } from "./players";
import type { Mark } from "../schedule/marks";
import type { PriorityGroup } from "../schedule/priorities";
import { combinedCorePriority, compactRosterPriorities, type RosterKind, type RosterPrioritySource } from "../schedule/rosterPriorities";

export type RosterQuery = { period: string | null; kind: RosterKind; group: PriorityGroup; limits: string[] };
export type RosterSnapshot = { source: RosterPrioritySource; faces: Mark[]; directoryRevision: string };
export type RosterResponse = Omit<RosterPrioritySource, "people"> & {
  people: RosterPrioritySource["people"] | null; directoryRevision: string; faces: Mark[] | null;
};
export type RosterRead = (query: RosterQuery, previous?: RosterSnapshot) => Promise<RosterResponse>;
export function rosterQueryKey(query: RosterQuery) {
  return JSON.stringify([query.period, query.kind, query.group, [...new Set(query.limits)].sort()]);
}

async function readRoster(query: RosterQuery, previous?: RosterSnapshot): Promise<RosterResponse> {
  if (!isLiveData()) {
    const period = query.period ?? demoActivePriority().activePeriod;
    const { kind, group } = query;
    let source: RosterPrioritySource;
    let faces: Mark[];
    if (kind === "both") {
      const members = loadMembers();
      const directories = await Promise.all((["nitro", "regular"] as const).map((variant) => loadLimitMarks(variant, [...LIMIT_OPTIONS])));
      const people = members.flatMap((member) => {
        const priority = combinedCorePriority(member.id, member.coreNitro250 ?? 0, member.coreRegular250 ?? 0, member.vipNitro, member.vipRegular);
        return priority ? [priority] : [];
      });
      const ids = new Set(people.map((person) => person.memberId));
      faces = [...new Map(directories.flatMap((directory) => directory.data ?? [])
        .filter((face) => face.memberId && ids.has(face.memberId))
        .map((face) => [face.memberId, face])).values()];
      source = { periodStart: period, kind, group, today: priorityToday(), lastMonthEntries: 0, revision: JSON.stringify([period, people]), people };
    } else {
      source = compactRosterPriorities(demoPrioritySlice(period, false, kind, group), kind, group);
      const directory = await loadLimitMarks(kind, query.limits);
      if (directory.error || !directory.data) throw new Error(directory.error || "empty response");
      faces = directory.data;
    }
    const directoryRevision = JSON.stringify(faces);
    return { ...source, people: previous?.source.revision === source.revision ? null : source.people,
      directoryRevision, faces: previous?.directoryRevision === directoryRevision ? null : faces };
  }
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const { data, error } = await db.rpc(query.period === null ? "load_active_month_roster" : "load_month_roster", {
    ...(query.period === null ? {} : { p_period_start: query.period }), p_variant: query.kind, p_group: query.group, p_limit_ids: query.limits,
    p_priority_revision: previous?.source.revision ?? null, p_directory_revision: previous?.directoryRevision ?? null,
  });
  if (error || !data) throw new Error(error?.message || "empty response");
  const wire = data as Omit<RosterResponse, "faces"> & { directory: DirectoryRow[] | null };
  return { periodStart: wire.periodStart, kind: wire.kind, group: wire.group, today: wire.today,
    lastMonthEntries: wire.lastMonthEntries, calculatedAt: wire.calculatedAt, revision: wire.revision,
    people: wire.people, directoryRevision: wire.directoryRevision, faces: wire.directory === null ? null : wire.directory.map(markOf) };
}

/** Owned by one mounted/account-scoped view, never shared across sign-ins. */
export function createRosterLoader(read: RosterRead = readRoster) {
  const cache = new Map<string, RosterSnapshot>();
  const pending = new Map<string, Promise<RosterSnapshot>>();
  return {
    load(query: RosterQuery): Promise<RosterSnapshot> {
      const key = rosterQueryKey(query);
      const existing = pending.get(key);
      if (existing) return existing;
      const previous = cache.get(key);
      const request = read(query, previous).then((result) => {
        if (!isPriorityPeriod(result.periodStart) || (query.period !== null && result.periodStart !== query.period) || result.kind !== query.kind || result.group !== query.group
          || (result.people === null && (!previous || previous.source.revision !== result.revision))
          || (result.faces === null && (!previous || previous.directoryRevision !== result.directoryRevision))) {
          throw new Error("roster-response-mismatch");
        }
        const { faces, directoryRevision, ...source } = result;
        const next: RosterSnapshot = { source: { ...source, people: source.people ?? previous!.source.people },
          faces: faces ?? previous!.faces, directoryRevision };
        if (previous && next.source.people === previous.source.people
          && next.source.periodStart === previous.source.periodStart && next.source.today === previous.source.today && next.source.lastMonthEntries === previous.source.lastMonthEntries
          && next.source.calculatedAt === previous.source.calculatedAt && next.source.revision === previous.source.revision) {
          next.source = previous.source;
        }
        cache.delete(key); cache.set(key, next);
        if (cache.size > 8) cache.delete(cache.keys().next().value!);
        return next;
      }).finally(() => { pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}
