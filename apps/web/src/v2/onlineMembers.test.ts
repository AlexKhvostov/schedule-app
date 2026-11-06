import { describe, expect, it } from "vitest";
import type { OnlineMember } from "../data/online";
import { presenceTime, sortOnlineMembers } from "./onlineMembers";

function row(id: string, activity: number, online: boolean, edit = 0): OnlineMember {
  return { member_id: id, nick: id, avatar_url: null, online, activity_minutes: activity,
    edit_minutes: edit, edit_variant: "nitro", edit_limit: "50" };
}
describe("presence list", () => {
  it("orders visible activity globally, even when an idle open page has the most recent edit", () => {
    const rows = [row("ten-hours", 600, true, 0), row("hour", 60, false, 800), row("quarter", 15, true, 900)];
    expect(sortOnlineMembers(rows, "ru").map(row => row.member_id)).toEqual(["quarter", "hour", "ten-hours"]);
    expect(rows.map(row => row.member_id)).toEqual(["ten-hours", "hour", "quarter"]);
  });
  it("uses a deterministic tie break and preserves every person", () => {
    const rows = [row("Борис", 5, true), row("Алексей", 5, false), row("Анна", 5, true)];
    expect(sortOnlineMembers(rows, "ru").map(row => row.nick)).toEqual(["Анна", "Борис", "Алексей"]);
    expect(sortOnlineMembers([], "ru")).toEqual([]);
  });
  it("updates order when fresh activity arrives", () => {
    const rows = [row("a", 10, true), row("b", 60, false)];
    rows[1] = { ...rows[1], activity_minutes: 0, online: true };
    expect(sortOnlineMembers(rows, "en").map(row => row.member_id)).toEqual(["b", "a"]);
  });
  it.each([[15, -15, "minute"], [60, -1, "hour"], [600, -10, "hour"], [1440, -1, "day"], [3000, -2, "day"]] as const)(
    "formats %i minutes without a misleading hour-only age", (minutes, amount, unit) => {
      expect(presenceTime(minutes)).toEqual({ amount, unit });
    });
});
