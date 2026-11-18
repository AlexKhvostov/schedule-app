import type { RosterKind } from "./rosterPriorities";

export type FillQueueState = { order: string[]; done: string[]; skipped: string[]; current: string | null };
export type FillOffer = {
  mode: "complete" | "skip"; member: string; name: string; next: string | null; nextName: string | null; channel: string | null; dm: boolean;
};
export type FillCompletion = { id: string; at: string; month: string; queue: RosterKind; actor: string; member: string; skipped?: boolean };

export function scheduleMonth(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

export function fillQueueOf(variant: "nitro" | "regular", limit: string): RosterKind | null {
  if (limit === "50" || limit === "100") return variant;
  return limit === "250" || limit === "500" ? "both" : null;
}

export function firstWaiting(order: readonly string[], done: readonly string[]) {
  const completed = new Set(done);
  return order.find((member) => !completed.has(member)) ?? null;
}

export function waitingForFill(state: FillQueueState, member?: string) {
  return Boolean(member && state.current && member !== state.current && state.order.includes(member)
    && (!state.done.includes(member) || state.skipped.includes(member)));
}
