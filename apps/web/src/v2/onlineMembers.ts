import type { OnlineMember } from "../data/online";

/** Order by the time users actually see, independent of background heartbeats. */
export function sortOnlineMembers(rows: readonly OnlineMember[], language: string) {
  const names = new Intl.Collator(language, { sensitivity: "base", numeric: true });
  return [...rows].sort((a, b) => a.activity_minutes - b.activity_minutes
    || Number(b.online) - Number(a.online) || names.compare(a.nick, b.nick) || a.member_id.localeCompare(b.member_id));
}

export function presenceTime(minutes: number): { amount: number; unit: "minute" | "hour" | "day" } {
  if (minutes < 60) return { amount: -Math.max(0, minutes), unit: "minute" };
  if (minutes < 1440) return { amount: -Math.floor(minutes / 60), unit: "hour" };
  return { amount: -Math.floor(minutes / 1440), unit: "day" };
}
