import { describe, expect, it } from "vitest";
import { calculatePriority, currentPriorityPeriod, filterPriorities, isPriorityPreliminary, priorityMonths, priorityToday, rankPriorities, type PriorityPerson } from "./priorities";
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
    expect(result.cells).toEqual([6.5, 7, 3, 8]); expect(result.total).toBe(24.5);
    expect(result.months[0]).toMatchObject({ nitro50: 11, regular50: 2, nitro100: 7 });
  });
  it("remains preliminary through day7 and below20 logical entries", () => {
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-07", lastMonthEntries: 40 })).toBe(true);
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-08", lastMonthEntries: 19 })).toBe(true);
    expect(isPriorityPreliminary({ periodStart: "2026-08-01", today: "2026-08-08", lastMonthEntries: 20 })).toBe(false);
    expect(isPriorityPreliminary({ periodStart: "2026-11-01", today: "2026-10-12", lastMonthEntries: 40 })).toBe(true);
  });
});
describe("priority places", () => {
  const score = (n: number): PriorityPerson["entries"] => [{ id: String(n), month: "2026-07-01", variant: "nitro", part: 1, values: [{ limit: "50", tournaments: n }] }];
  const people = [person("a", { entries: score(100) }), person("b", { entries: score(90) }), person("vip", { vipNitro: 3, vipRegular: 1 }), person("c", { entries: score(80) }), person("out", { entries: score(999), excludedNitro: true })];
  it("reserves exact VIP seats and puts excluded people below everyone", () => {
    expect(rankPriorities(people, "2026-08-01", "nitro", true).map((r) => [r.memberId, r.rank])).toEqual([["a", 1], ["b", 2], ["vip", 3], ["c", 4], ["out", null]]);
    expect(rankPriorities(people, "2026-08-01", "regular", true)[0].memberId).toBe("vip");
  });
  it("switches off manual VIP visually, with exclusions still effective", () => {
    expect(rankPriorities(people, "2026-08-01", "nitro", false).map((r) => r.memberId)).toEqual(["a", "b", "c", "vip", "out"]);
    expect(people[2].vipNitro).toBe(3);
  });
  it("preserves places after filtering and permits a VIP beyond the visible count", () => {
    const ranked = rankPriorities([person("hidden", { redParty: false, entries: score(10) }), person("visible", { vipNitro: 25 })], "2026-08-01", "nitro", true);
    expect(filterPriorities(ranked, { redParty: true, team50: true, active: true }).map((r) => r.rank)).toEqual([25]);
  });
  it("filters kinds using chosen games without changing the total and breaks ties stably", () => {
    const p = [person("b", { plays: ["nitro"], entries: score(2) }), person("a", { entries: score(2) })];
    expect(rankPriorities(p, "2026-08-01", "nitro", true).map((r) => r.memberId)).toEqual(["a", "b"]);
    expect(rankPriorities(p, "2026-08-01", "regular", true).map((r) => [r.memberId, r.total])).toEqual([["a", 2]]);
  });
});
