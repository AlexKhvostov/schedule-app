import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { demoPrioritySlice } from "./priorities";
import { loadLimitMarks, markOf, type DirectoryRow } from "./players";
import type { Mark } from "../schedule/marks";
import type { PriorityGroup, PriorityKind } from "../schedule/priorities";
import { compactRosterPriorities, type RosterPrioritySource } from "../schedule/rosterPriorities";

export type RosterQuery = { period: string; kind: PriorityKind; group: PriorityGroup; limits: string[] };
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
    const source = compactRosterPriorities(demoPrioritySlice(query.period, false, query.kind, query.group), query.kind, query.group);
    const directory = await loadLimitMarks(query.kind, query.limits);
    if (directory.error || !directory.data) throw new Error(directory.error || "empty response");
    const directoryRevision = JSON.stringify(directory.data);
    return { ...source, people: previous?.source.revision === source.revision ? null : source.people,
      directoryRevision, faces: previous?.directoryRevision === directoryRevision ? null : directory.data };
  }
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const { data, error } = await db.rpc("load_month_roster", {
    p_period_start: query.period, p_variant: query.kind, p_group: query.group, p_limit_ids: query.limits,
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
        if (result.periodStart !== query.period || result.kind !== query.kind || result.group !== query.group
          || (result.people === null && (!previous || previous.source.revision !== result.revision))
          || (result.faces === null && (!previous || previous.directoryRevision !== result.directoryRevision))) {
          throw new Error("roster-response-mismatch");
        }
        const { faces, directoryRevision, ...source } = result;
        const next: RosterSnapshot = { source: { ...source, people: source.people ?? previous!.source.people },
          faces: faces ?? previous!.faces, directoryRevision };
        if (previous && next.source.people === previous.source.people
          && next.source.today === previous.source.today && next.source.lastMonthEntries === previous.source.lastMonthEntries
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
