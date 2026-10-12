export type PriorityKind = "nitro" | "regular";
export type PriorityEntry = { id: string; month: string; variant: PriorityKind; part: number; values: { limit: string; tournaments: number }[] };
export type PriorityPerson = {
  memberId: string; nick: string; avatarUrl: string | null; redParty: boolean; team50: boolean; hasActiveProfile: boolean;
  plays: PriorityKind[]; vipNitro: number; vipRegular: number; excludedNitro: boolean; excludedRegular: boolean; entries: PriorityEntry[];
};
export type PrioritySource = { periodStart: string; today: string; lastMonthEntries: number; people: PriorityPerson[]; canManage: boolean; revision: string };
export type PriorityMonth = { month: string; nitro50: number; regular50: number; nitro100: number; regular100: number };
export type CalculatedPriority = PriorityPerson & { months: PriorityMonth[]; cells: [number, number, number, number]; total: number; rank: number | null; excluded: boolean; vip: number };
export type PriorityFilters = { redParty: boolean; team50: boolean; active: boolean };

export function shiftPriorityMonth(month: string, offset: number) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
  return date.toISOString().slice(0, 10);
}
export function priorityToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function currentPriorityPeriod(today = priorityToday()) {
  const month = Number(today.slice(5, 7));
  const start = [11, 8, 5, 2].find((value) => value <= month);
  return start ? `${today.slice(0, 4)}-${String(start).padStart(2, "0")}-01` : `${Number(today.slice(0, 4)) - 1}-11-01`;
}
export function priorityMonths(period: string) { return Array.from({ length: 6 }, (_, i) => shiftPriorityMonth(period, i - 6)); }
export function isPriorityPreliminary(source: Pick<PrioritySource, "today" | "periodStart" | "lastMonthEntries">) {
  return source.today < `${source.periodStart.slice(0, 7)}-08` || source.lastMonthEntries < 20;
}
export function priorityBreakdown(months: PriorityMonth[]) {
  return (["nitro", "regular"] as const).map((kind) => {
    const periods = [0, 3].map((start) => {
      const periodMonths = months.slice(start, start + 3);
      const periodWeight = start === 0 ? 0.5 : 1;
      const limits = ([50, 100] as const).map((limit) => {
        const key = `${kind}${limit}` as "nitro50" | "nitro100" | "regular50" | "regular100";
        const monthly = periodMonths.map((m) => ({ month: m.month, tournaments: m[key] }));
        const tournaments = monthly.reduce((sum, m) => sum + m.tournaments, 0);
        const limitWeight = limit === 50 ? 1 : 2;
        return { limit, monthly, tournaments, limitWeight, points: tournaments * limitWeight * periodWeight };
      });
      return { periodWeight, limits, total: limits.reduce((sum, limit) => sum + limit.points, 0) };
    });
    return { kind, periods, total: periods.reduce((sum, period) => sum + period.total, 0) };
  });
}
export function calculatePriority(person: PriorityPerson, period: string): CalculatedPriority {
  const months: PriorityMonth[] = priorityMonths(period).map((month) => ({ month, nitro50: 0, regular50: 0, nitro100: 0, regular100: 0 }));
  for (const entry of person.entries) {
    const month = months.find((row) => row.month === entry.month);
    if (!month || !["nitro", "regular"].includes(entry.variant)) continue;
    for (const value of entry.values) {
      if (!["50", "100"].includes(value.limit) || !Number.isSafeInteger(value.tournaments) || value.tournaments < 0) continue;
      const key = `${entry.variant}${value.limit}` as "nitro50" | "regular50" | "nitro100" | "regular100";
      month[key] += value.tournaments;
    }
  }
  const cells: CalculatedPriority["cells"] = [0, 0, 0, 0];
  for (const kind of priorityBreakdown(months)) kind.periods.forEach((period, i) => period.limits.forEach((limit, j) => { cells[i * 2 + j] += limit.points; }));
  return { ...person, months, cells, total: cells.reduce((a, b) => a + b, 0), rank: null, excluded: false, vip: 0 };
}
export function rankPriorities(people: PriorityPerson[], period: string, kind: PriorityKind, vipEnabled: boolean): CalculatedPriority[] {
  const rows = people.filter((person) => person.plays.includes(kind)).map((person) => {
    const row = calculatePriority(person, period);
    row.excluded = kind === "nitro" ? row.excludedNitro : row.excludedRegular;
    row.vip = vipEnabled ? (kind === "nitro" ? row.vipNitro : row.vipRegular) : 0;
    return row;
  });
  const compare = (a: CalculatedPriority, b: CalculatedPriority) => b.total - a.total || a.nick.localeCompare(b.nick, "ru", { numeric: true, sensitivity: "base" }) || a.memberId.localeCompare(b.memberId);
  const assigned = new Set(rows.filter((row) => !row.excluded && row.vip > 0).map((row) => row.vip));
  const ordinary = rows.filter((row) => !row.excluded && row.vip <= 0).sort(compare);
  let rank = 1;
  for (const row of ordinary) { while (assigned.has(rank)) rank++; row.rank = rank++; }
  for (const row of rows) if (!row.excluded && row.vip > 0) row.rank = row.vip;
  return rows.sort((a, b) => Number(a.excluded) - Number(b.excluded) || (a.excluded ? compare(a, b) : (a.rank ?? 0) - (b.rank ?? 0)));
}
export function filterPriorities(rows: CalculatedPriority[], filters: PriorityFilters) {
  return rows.filter((row) => (!filters.redParty || row.redParty) && (!filters.team50 || row.team50) && (!filters.active || row.hasActiveProfile));
}
