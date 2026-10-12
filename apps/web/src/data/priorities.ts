import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { demoDistanceBook } from "./distanceBook";
import { priorityMonths, priorityToday, shiftPriorityMonth, type PriorityKind, type PriorityPerson, type PrioritySource } from "../schedule/priorities";

export type PriorityRequestSummary = { id: string; periodStart: string; variant: PriorityKind; createdAt: string; closedAt: string | null; response: string | null; targets: { memberId: string; nick: string }[] };
export type PriorityRequestDetail = { id: string; variant: PriorityKind; author: string; comment: string; createdAt: string; closedAt: string | null; response: string | null; snapshot: Pick<PrioritySource, "periodStart" | "today" | "lastMonthEntries" | "people"> & { version: number; rankingPeople: PriorityPerson[]; vipEnabled: boolean } };
type DemoRequest = PriorityRequestSummary & { detail: PriorityRequestDetail };
const DEMO_REQUESTS = "v2-priority-requests-1";
const DEMO_EXCLUSIONS = "v2-priority-exclusions-1";
function readDemo<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function writeDemo(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const db = getSupabase();
  if (!db) return { data: null, error: "not-configured" };
  const { data, error } = await db.rpc(name, args);
  return { data: data as T | null, error: error?.message ?? null };
}
export function demoPrioritySource(periodStart: string, canManage: boolean): PrioritySource {
  const months = priorityMonths(periodStart);
  const exclusions = readDemo<Record<string, { nitro?: boolean; regular?: boolean }>>(DEMO_EXCLUSIONS, {});
  const firstBook = demoDistanceBook(months[0]);
  const people: PriorityPerson[] = firstBook.people.filter((p) => p.memberId).map((p) => ({
    memberId: p.memberId!, nick: p.nick, avatarUrl: p.avatarUrl, redParty: p.redParty, team50: true, hasActiveProfile: p.hasActiveProfile,
    plays: ["nitro", "regular"], vipNitro: 0, vipRegular: 0, excludedNitro: false, excludedRegular: false,
    entries: months.flatMap((month) => demoDistanceBook(month).people.find((row) => row.memberId === p.memberId)?.slices.map((s) => ({
      id: s.id, month, variant: s.variant, part: s.part, values: Object.entries(s.byLimit).map(([limit, cell]) => ({ limit, tournaments: cell.hands })),
    })) ?? []),
  }));
  for (let i = 0; i < 20; i++) people.push({
    memberId: `demo-priority-${i}`, nick: ["Alina", "Boris", "Vera", "Daniil"][i] ?? `Player ${i + 1}`,
    avatarUrl: null, redParty: i !== 19, team50: i !== 18, hasActiveProfile: i !== 17, plays: i === 16 ? ["regular"] : ["nitro", "regular"],
    vipNitro: i === 2 ? 3 : 0, vipRegular: i === 2 ? 1 : 0, excludedNitro: false, excludedRegular: false,
    entries: months.map((month, m) => ({ id: `demo-${i}-${month}`, month, variant: m % 2 ? "regular" : "nitro", part: 1,
      values: [{ limit: "50", tournaments: (i === 3 ? 19 : 20 - i) * 100 + m * 7 }, { limit: "100", tournaments: (i === 3 ? 19 : 20 - i) * 10 + m * 3 }] })),
  });
  for (const p of people) { p.excludedNitro = exclusions[p.memberId]?.nitro ?? false; p.excludedRegular = exclusions[p.memberId]?.regular ?? false; }
  return { periodStart, today: priorityToday(), canManage, people, revision: JSON.stringify(people), lastMonthEntries: people.flatMap((p) => p.entries).filter((e) => e.month === shiftPriorityMonth(periodStart, -1) && e.values.some((v) => ["50", "100"].includes(v.limit) && v.tournaments > 0)).length };
}
export async function loadPriorities(periodStart: string, demoCanManage: boolean) {
  return !isLiveData() ? { data: demoPrioritySource(periodStart, demoCanManage), error: null } : rpc<PrioritySource>("load_priorities", { p_period_start: periodStart });
}
export async function listPriorityRequests(periodStart: string) {
  if (isLiveData()) return rpc<PriorityRequestSummary[]>("list_priority_requests", { p_period_start: periodStart });
  const rows = readDemo<DemoRequest[]>(DEMO_REQUESTS, []).filter((r) => r.periodStart === periodStart);
  return { data: rows.map((row) => ({ id: row.id, periodStart: row.periodStart, variant: row.variant, createdAt: row.createdAt, closedAt: row.closedAt, response: row.response, targets: row.targets })), error: null };
}
export async function submitPriorityRequest(input: { periodStart: string; variant: PriorityKind; people: PriorityPerson[]; comment: string; author: string; vipEnabled: boolean; revision: string }) {
  if (isLiveData()) return rpc<string>("submit_priority_request", { p_period_start: input.periodStart, p_variant: input.variant, p_expected: input.people, p_comment: input.comment, p_vip_enabled: input.vipEnabled, p_revision: input.revision });
  const source = demoPrioritySource(input.periodStart, false);
  if (input.revision !== source.revision || input.people.some((p) => JSON.stringify(source.people.find((row) => row.memberId === p.memberId)) !== JSON.stringify(p))) return { data: null, error: "priority-stale" };
  const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
  const row: DemoRequest = { id, periodStart: input.periodStart, variant: input.variant, targets: input.people.map((p) => ({ memberId: p.memberId, nick: p.nick })), createdAt, closedAt: null, response: null,
    detail: { id, variant: input.variant, author: input.author, comment: input.comment, createdAt, closedAt: null, response: null, snapshot: { periodStart: source.periodStart, today: source.today, lastMonthEntries: source.lastMonthEntries, version: 1, people: structuredClone(input.people), rankingPeople: structuredClone(source.people), vipEnabled: input.vipEnabled } } };
  writeDemo(DEMO_REQUESTS, [row, ...readDemo<DemoRequest[]>(DEMO_REQUESTS, [])]);
  return { data: id, error: null };
}
export async function getPriorityRequest(id: string, demoCanManage: boolean) {
  if (isLiveData()) return rpc<PriorityRequestDetail>("get_priority_request", { p_id: id });
  if (!demoCanManage) return { data: null, error: "forbidden" };
  const row = readDemo<DemoRequest[]>(DEMO_REQUESTS, []).find((r) => r.id === id);
  return { data: row?.detail ?? null, error: row ? null : "priority-request-not-found" };
}
// Reuse the server-protected detail endpoint; public summaries never contain authors.
export async function loadPriorityRequestAuthors(ids: string[], demoCanManage: boolean) {
  const data: Record<string, string> = {};
  for (let start = 0; start < ids.length; start += 8) {
    const batch = await Promise.all(ids.slice(start, start + 8).map(async (id) => ({ id, ...await getPriorityRequest(id, demoCanManage) })));
    for (const row of batch) {
      if (row.error || !row.data) return { data: null, error: row.error || "priority-request-not-found" };
      data[row.id] = row.data.author;
    }
  }
  return { data, error: null };
}
export async function closePriorityRequest(id: string, response: string, demoCanManage: boolean) {
  if (isLiveData()) return rpc<null>("close_priority_request", { p_id: id, p_response: response });
  if (!demoCanManage) return { data: null, error: "forbidden" };
  const rows = readDemo<DemoRequest[]>(DEMO_REQUESTS, []); const row = rows.find((r) => r.id === id);
  if (!row || row.closedAt) return { data: null, error: "priority-request-closed-or-missing" };
  if (!response.trim()) return { data: null, error: "priority-response-required" };
  row.response = response.trim(); row.closedAt = new Date().toISOString();
  row.detail.response = row.response; row.detail.closedAt = row.closedAt; writeDemo(DEMO_REQUESTS, rows);
  return { data: null, error: null };
}
export async function deletePriorityRequest(id: string, demoCanManage: boolean) {
  if (isLiveData()) return rpc<null>("delete_priority_request", { p_id: id });
  if (!demoCanManage) return { data: null, error: "forbidden" };
  const rows = readDemo<DemoRequest[]>(DEMO_REQUESTS, []);
  if (!rows.some((r) => r.id === id)) return { data: null, error: "priority-request-not-found" };
  writeDemo(DEMO_REQUESTS, rows.filter((r) => r.id !== id));
  return { data: null, error: null };
}
export async function setPriorityExclusion(person: PriorityPerson, variant: PriorityKind, excluded: boolean, demoCanManage: boolean) {
  if (isLiveData()) return rpc<null>("set_priority_exclusion", { p_member_id: person.memberId, p_variant: variant, p_excluded: excluded });
  if (!demoCanManage) return { data: null, error: "forbidden" };
  if (excluded && (variant === "nitro" ? person.vipNitro : person.vipRegular) > 0) return { data: null, error: "priority-vip-exclusion-conflict" };
  const rows = readDemo<Record<string, { nitro?: boolean; regular?: boolean }>>(DEMO_EXCLUSIONS, {});
  rows[person.memberId] = { ...rows[person.memberId], [variant]: excluded }; writeDemo(DEMO_EXCLUSIONS, rows);
  return { data: null, error: null };
}
