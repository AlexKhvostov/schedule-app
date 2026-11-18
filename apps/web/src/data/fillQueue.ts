import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { loadBots } from "./botSettings";
import { createRosterLoader } from "./roster";
import { firstWaiting, type FillCompletion, type FillOffer, type FillQueueState } from "../schedule/fillQueue";
import { orderRosterRows, rosterFromGrids } from "../schedule/roster";
import { readCet } from "../schedule/cet";
import type { RosterKind } from "../schedule/rosterPriorities";

export const demoFillStorageKey = "redparty.demo.fill-completions.v1";
export const demoFillEvent = "redparty:demo-fill-completions";

export function demoFillCompletions(): FillCompletion[] {
  try { return JSON.parse(localStorage.getItem(demoFillStorageKey) ?? "[]") as FillCompletion[]; }
  catch { return []; }
}

async function demoRoster(queue: RosterKind) {
  const group = queue === "both" ? "250" : "50-100";
  const { source, faces } = await createRosterLoader().load({ period: null, kind: queue, group,
    limits: group === "250" ? ["250", "500"] : ["50", "100"] });
  const kind = queue === "both" ? "nitro" : queue;
  const now = new Date();
  return orderRosterRows(rosterFromGrids([], now.getFullYear(), now.getMonth(), readCet(), faces, kind), source, kind)
    .filter(row => row.n > 0 && row.mark.memberId);
}

function demoState(month: string, queue: RosterKind, order: string[]): FillQueueState {
  const completions = demoFillCompletions().filter(row => row.month === month && row.queue === queue);
  const done = completions.map(row => row.member);
  const skipped = completions.filter(row => row.skipped).map(row => row.member);
  const now = readCet();
  const currentMonth = `${now.year}-${String(now.monthIndex + 1).padStart(2, "0")}-01`;
  return { order, done, skipped, current: month >= currentMonth ? firstWaiting(order, done) : null };
}

export async function loadFillQueue(month: string, queue: RosterKind): Promise<FillQueueState> {
  if (!isLiveData()) return demoState(month, queue, (await demoRoster(queue)).map(row => row.mark.memberId!));
  const { data, error } = await getSupabase()!.rpc("load_fill_queue", { p_month: month, p_queue: queue });
  const state = data as Partial<FillQueueState> | null;
  if (error || !state || !Array.isArray(state.order) || !Array.isArray(state.done) || !Array.isArray(state.skipped)
    || (state.current !== null && typeof state.current !== "string")) {
    throw new Error(error?.message ?? "fill-queue-unavailable");
  }
  return { order: state.order, done: state.done, skipped: state.skipped, current: state.current };
}

export async function previewFill(month: string, queue: RosterKind, actor: string, member: string): Promise<FillOffer> {
  if (!isLiveData()) {
    const roster = await demoRoster(queue);
    const names = new Map(roster.map(row => [row.mark.memberId!, row.mark.discord]));
    const { order, done, current } = demoState(month, queue, [...names.keys()]);
    if (current !== member) {
      if (!current || actor !== member || !names.has(member) || done.includes(member)) throw new Error("fill-queue-stale");
      return { mode: "skip", member, name: names.get(member)!, next: null, nextName: null, channel: null, dm: false };
    }
    const next = firstWaiting(order, [...done, member]);
    const bot = (await loadBots()).discord;
    return { mode: "complete", member, name: names.get(member)!, next, nextName: next ? names.get(next)! : null,
      channel: next && bot.notifyFillQueue ? bot.fillChannels[queue] || null : null, dm: Boolean(next && bot.notifyFillQueue) };
  }
  const { data, error } = await getSupabase()!.rpc("preview_fill_completion", { p_month: month, p_queue: queue, p_member: member });
  if (error || !data) throw new Error(error?.message ?? "fill-queue-unavailable");
  return data as FillOffer;
}

export async function confirmFill(month: string, queue: RosterKind, actor: string, offer: FillOffer, notify: boolean): Promise<{ offer?: FillOffer }> {
  if (!isLiveData()) {
    const latest = await previewFill(month, queue, actor, offer.member);
    if (JSON.stringify(latest) !== JSON.stringify(offer)) return { offer: latest };
    const rows = demoFillCompletions();
    if (rows.some(row => row.month === month && row.queue === queue && row.member === offer.member)) throw new Error("fill-queue-stale");
    rows.unshift({ id: String(Date.now()), at: new Date().toISOString(), month, queue, actor, member: offer.member, skipped: offer.mode === "skip" });
    localStorage.setItem(demoFillStorageKey, JSON.stringify(rows));
    window.dispatchEvent(new Event(demoFillEvent));
    return {};
  }
  const db = getSupabase()!;
  const { data, error } = await db.rpc("confirm_fill_completion", {
    p_month: month, p_queue: queue, p_member: offer.member, p_expected: offer, p_notify: notify,
  });
  if (error || !data) throw new Error(error?.message ?? "fill-queue-unavailable");
  const result = data as { id?: string; offer?: FillOffer };
  if (result.id && notify && offer.dm) void db.functions.invoke("notify-fill-queue", { body: { id: result.id } }).catch(() => {});
  return result;
}
