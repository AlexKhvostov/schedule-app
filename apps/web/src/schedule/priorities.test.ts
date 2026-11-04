import { describe, expect, it } from "vitest";
import { calculatePriority, coreOf, groupsForLimits, currentPriorityPeriod, filterPriorities, isPriorityPreliminary, priorityBreakdown, priorityMonths, priorityToday, rankPriorities, type PriorityPerson } from "./priorities";
const person = (id: string, patch: Partial<PriorityPerson> = {}): PriorityPerson => ({ memberId: id, nick: id, avatarUrl: null, redParty: true, team50: true, hasActiveProfile: true, plays: ["nitro", "regular"], vipNitro: 0, vipRegular: 0, excludedNitro: false, excludedRegular: false, entries: [], ...patch });
describe("priority calculation", () => {
  it("uses six shifted months across year boundaries", () => {
    expect(priorityMonths("2026-08-01")).toEqual(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"]);
    expect(priorityMonths("2026-02-01")).toEqual(["2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01"]);
    expect(currentPriorityPeriod("2026-01-31")).toBe("2025-11-01");
    expect(currentPriorityPeriod("2026-02-01")).toBe("2026-02-01");
    expect(currentPriorityPeriod("2026-04-30")).toBe("2026-02-01");
    expect(currentPriorityPeriod("2026-05-01")).toBe("2026-05-01");
    expect(currentPriorityPeriod("2026-08-01")).toBe("2026-08-01");
    expect(currentPriorityPeriod("2026-11-01")).toBe("2026-11-01");
    expect(priorityToday(new Date("2026-07-31T21:01:00Z"))).toBe("2026-08-01");
  });
  it("combines both variants, all parts and only limits50/100 with exact half points", () => {
    const result = calculatePriority(person("a", { entries: [
      { id: "1", month: "2026-02-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 11 }, { limit: "100", tournaments: 7 }, { limit: "250", tournaments: 999 }] },
      { id: "2", month: "2026-02-01", variant: "regular", part: 2, values: [{ limit: "50", tournaments: 2 }] },
      { id: "3", month: "2026-07-01", variant: "regular", part: 1, values: [{ limit: "50", tournaments: 3 }, { limit: "100", tournaments: 4 }] },
      { id: "4", month: "2026-08-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 999 }] },
    ] }), "2026-08-01");
    expect(result.distanceCells).toEqual([13, 7, 3, 4]);
    expect(result.pointCells).toEqual([6.5, 7, 3, 8]); expect(result.total).toBe(24.5);
    expect(result.months[0]).toMatchObject({ nitro50: 11, regular50: 2, nitro100: 7 });
  });
  it("remains preliminary through day7 and below20 logical entries", () => {
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-07", lastMonthEntries: 40 })).toBe(true);
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-08", lastMonthEntries: 19 })).toBe(true);
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-08", lastMonthEntries: 20 })).toBe(false);
    expect(isPriorityPreliminary({ periodStart: "2026-11-01", today: "2026-10-12", lastMonthEntries: 40 })).toBe(true);
  });
  it("details each kind from monthly tournaments through both period weights to the combined cells", () => {
    const result = calculatePriority(person("breakdown", { entries: [
      { id: "n1", month: "2026-02-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 5 }, { limit: "100", tournaments: 7 }] },
      { id: "n2", month: "2026-02-01", variant: "nitro", part: 2, values: [{ limit: "50", tournaments: 6 }] },
      { id: "r1", month: "2026-02-01", variant: "regular", part: 1, values: [{ limit: "50", tournaments: 2 }] },
      { id: "r2", month: "2026-07-01", variant: "regular", part: 1, values: [{ limit: "50", tournaments: 3 }, { limit: "100", tournaments: 4 }] },
    ] }), "2026-08-01");
    const [nitro, regular] = priorityBreakdown(result.months);
    expect(nitro.periods[0].limits[0].monthly.map((m) => m.tournaments)).toEqual([11, 0, 0]);
    expect(nitro.periods[0].limits.map((l) => [l.limit, l.tournaments, l.limitWeight, l.points])).toEqual([[50, 11, 1, 5.5], [100, 7, 2, 7]]);
    expect(regular.periods[1].limits[0].monthly.map((m) => m.tournaments)).toEqual([0, 0, 3]);
    expect(regular.periods.map((p) => p.periodWeight)).toEqual([0.5, 1]);
    expect([nitro.total, regular.total]).toEqual([12.5, 12]);
    expect(nitro.periods.flatMap((p, i) => p.limits.map((l, j) => l.tournaments + regular.periods[i].limits[j].tournaments))).toEqual(result.distanceCells);
    expect(nitro.periods.flatMap((p, i) => p.limits.map((l, j) => l.points + regular.periods[i].limits[j].points))).toEqual(result.pointCells);
    expect(nitro.total + regular.total).toBe(result.total);
  });
  it("keeps all months, limits and zero points in an empty kind breakdown", () => {
    const row = calculatePriority(person("zero"), "2026-02-01");
    const kinds = priorityBreakdown(row.months);
    expect(kinds.map((k) => k.total)).toEqual([0, 0]);
    expect(kinds[0].periods[0].limits[0].monthly.map((m) => m.month)).toEqual(["2025-08-01", "2025-09-01", "2025-10-01"]);
    expect(kinds[1].periods[1].limits.map((l) => [l.tournaments, l.points])).toEqual([[0, 0], [0, 0]]);
  });
});
describe("priority places", () => {
  it("orders by weighted points even when the raw tournament order is different", () => {
    const ranked = rankPriorities([
      person("more-games", { entries: [{ id: "old", month: "2026-02-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 100 }] }] }),
      person("more-points", { entries: [{ id: "new", month: "2026-07-01", variant: "regular", part: 1, values: [{ limit: "100", tournaments: 40 }] }] }),
    ], "2026-08-01", "nitro", false);
    expect(ranked.map((r) => [r.memberId, r.total, r.distanceCells])).toEqual([["more-points", 80, [0, 0, 0, 40]], ["more-games", 50, [100, 0, 0, 0]]]);
  });
  const score = (n: number): PriorityPerson["entries"] => [{ id: String(n), month: "2026-07-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: n }] }];
  const people = [person("a", { entries: score(100) }), person("b", { entries: score(90) }), person("vip", { vipNitro: 3, vipRegular: 1 }), person("c", { entries: score(80) }), person("out", { entries: score(999), excludedNitro: true })];
  it("preserves exact VIP seats only for historical request snapshots", () => {
    expect(rankPriorities(people, "2026-08-01", "nitro", true, "legacy-vip-seats").map((r) => [r.memberId, r.rank])).toEqual([["a", 1], ["b", 2], ["vip", 3], ["c", 4], ["out", null]]);
    expect(rankPriorities(people, "2026-08-01", "regular", true, "legacy-vip-seats")[0].memberId).toBe("vip");
  });
  it("VIP visibility never changes distance ranks or scores", () => {
    for (const kind of ["nitro", "regular"] as const) {
      const on = rankPriorities(people, "2026-08-01", kind, true);
      const off = rankPriorities(people, "2026-08-01", kind, false);
      expect(on.map((p) => [p.memberId, p.rank, p.total])).toEqual(off.map((p) => [p.memberId, p.rank, p.total]));
      expect(on.find((p) => p.memberId === "vip")?.vip).toBeGreaterThan(0);
      expect(off.find((p) => p.memberId === "vip")?.vip).toBe(0);
      expect(on[0].memberId).not.toBe("vip");
    }
  });
  it("switches off manual VIP visually, with exclusions still effective", () => {
    expect(rankPriorities(people, "2026-08-01", "nitro", false).map((r) => r.memberId)).toEqual(["a", "b", "c", "vip", "out"]);
    expect(people[2].vipNitro).toBe(3);
  });
  it("preserves distance places after filtering regardless of VIP number", () => {
    const ranked = rankPriorities([person("hidden", { redParty: false, discordRoles: [], entries: score(10) }), person("visible", { vipNitro: 25, discordRoles: [{ id: "rp", name: "RedParty", color: null }] })], "2026-08-01", "nitro", true);
    expect(filterPriorities(ranked, { roleIds: ["rp"], active: false, scheduleActive: false }, "nitro").map((r) => r.rank)).toEqual([2]);
  });
  it("includes players without selected games and preserves old snapshot membership", () => {
    const p = [person("b", { plays: ["nitro"], entries: score(2) }), person("a", { entries: score(2) })];
    expect(rankPriorities(p, "2026-08-01", "nitro", true).map((r) => r.memberId)).toEqual(["a", "b"]);
    expect(rankPriorities(p, "2026-08-01", "regular", true).map((r) => [r.memberId, r.total])).toEqual([["a", 2], ["b", 2]]);
    expect(rankPriorities(p, "2026-08-01", "regular", true, "legacy-vip-seats").map((r) => r.memberId)).toEqual(["a"]);
  });
});


describe("explicit priority filters", () => {
  const role = (id: string) => ({ id, name: id, color: null });
  const rows = rankPriorities([
    person("vacation", { plays: [], discordRoles: [role("rp")], hasActiveProfile: false }),
    person("nitro", { plays: ["nitro"], discordRoles: [role("nitro"), role("rp")] }),
    person("regular", { plays: ["regular"], discordRoles: [role("regular")] }),
    person("no-roles", { plays: [], discordRoles: [] }),
  ], "2026-08-01", "nitro", true);
  const all = { roleIds: [], active: false, scheduleActive: false };
  it("empty filters include every player, including inactive profiles, no roles and no limits", () => {
    expect(filterPriorities(rows, all, "nitro")).toEqual(rows);
    expect(filterPriorities(rows, all, "regular")).toEqual(rows);
  });
  it("matches any selected Discord role, including a player on vacation", () => {
    expect(filterPriorities(rows, { ...all, roleIds: ["rp", "regular"] }, "nitro").map((p) => p.memberId)).toEqual(["nitro", "regular", "vacation"]);
    expect(filterPriorities(rows, { ...all, roleIds: ["unknown"] }, "nitro")).toEqual([]);
  });
  it("checks current kind limits only when enabled, separately from profile and role filters", () => {
    expect(filterPriorities(rows, { ...all, scheduleActive: true }, "nitro").map((p) => p.memberId)).toEqual(["nitro"]);
    expect(filterPriorities(rows, { ...all, scheduleActive: true }, "regular").map((p) => p.memberId)).toEqual(["regular"]);
    expect(filterPriorities(rows, { ...all, active: true }, "nitro")).toHaveLength(3);
    expect(filterPriorities(rows, { ...all, roleIds: ["rp"], scheduleActive: true }, "regular")).toEqual([]);
    expect(filterPriorities(rows, { ...all, scheduleActive: true }, "nitro")[0].rank).toBe(rows.find((p) => p.memberId === "nitro")?.rank);
  });
});


describe("independent priority slices", () => {
  const p = person("mixed", { vipNitro: 3, vipRegular: 4, coreNitro250: 1, coreRegular250: 2, entries: [
    { id: "n", month: "2026-02-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 11 }, { limit: "100", tournaments: 7 }, { limit: "250", tournaments: 900 }] },
    { id: "r", month: "2026-07-01", variant: "regular", part: 1, values: [{ limit: "100", tournaments: 9 }, { limit: "500", tournaments: 900 }] },
  ] });
  it("uses only the selected variant and exact 50/100, preserving legacy snapshots", () => {
    expect(calculatePriority(p, "2026-08-01", "nitro").total).toBe(12.5);
    expect(calculatePriority(p, "2026-08-01", "regular").total).toBe(18);
    expect(calculatePriority(p, "2026-08-01").total).toBe(30.5);
    expect(calculatePriority(p, "2026-08-01", "nitro").entries.map((e) => e.id)).toEqual(["n"]);
    expect(calculatePriority(p, "2026-08-01", "nitro", "250").total).toBe(0);
    expect(calculatePriority(p, "2026-08-01", "nitro", "250").entries).toEqual([]);
  });
  it("keeps all four Core values independent and 250 ordering independent of badge visibility", () => {
    expect([coreOf(p,"nitro"),coreOf(p,"regular"),coreOf(p,"nitro","250"),coreOf(p,"regular","250")]).toEqual([3,4,1,2]);
    const people = [person("alpha"), p, person("beta", { coreNitro250: 2, vipNitro: 1 })];
    for (const show of [true,false]) expect(rankPriorities(people,"2026-08-01","nitro",show,"slice","250").map((r) => r.memberId)).toEqual(["mixed","beta","alpha"]);
    expect(rankPriorities(people,"2026-08-01","regular",true,"slice","250").map((r) => r.memberId)).toEqual(["mixed","alpha","beta"]);
  });
  it("reuses saved calculations only for the exact period, kind and group", () => {
    const cached = { ...p, calculation: { periodStart: "2026-08-01", kind: "nitro" as const, group: "50-100" as const, months: [], distanceCells: [1,2,3,4] as [number,number,number,number], pointCells: [0.5,2,3,8] as [number,number,number,number], total: 13.5 } };
    expect(calculatePriority(cached,"2026-08-01","nitro").total).toBe(13.5);
    expect(calculatePriority(cached,"2026-08-01","regular").total).toBe(18);
    expect(calculatePriority(cached,"2026-08-01","nitro","250").total).toBe(0);
    expect(calculatePriority(cached,"2026-11-01","nitro").total).toBe(0);
  });
  it("derives available groups strictly from schedule filters", () => {
    expect(groupsForLimits(["50"])).toEqual(["50-100"]);
    expect(groupsForLimits(["100","250"])).toEqual(["50-100","250"]);
    expect(groupsForLimits(["250"])).toEqual(["250"]);
    expect(groupsForLimits(["25","500"])).toEqual([]);
  });
});
