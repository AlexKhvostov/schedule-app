import { describe, expect, it } from "vitest";
import { defaultLogFilters, matchesLog, logDate, type LogEntry } from "./rootLogs";
import { resolveShellPage } from "../v2/shellNavigation";

const row: LogEntry = { id: "1", at: "2026-11-06T23:00:00Z", action: "place", actor: { id: "actor", name: "Alex" }, member: { id: "member", name: "Polar", discord_id: "123456789012345678" }, detail: { date: "2027-01-01" } };
describe("root logs", () => {
  it("filters event dates in schedule CET, not the scheduled slot date", () => {
    expect(logDate("2026-11-06T22:59:59Z")).toBe("2026-11-06");
    expect(logDate(row.at)).toBe("2026-11-07");
    expect(matchesLog(row, { ...defaultLogFilters, from: "2026-11-07", to: "2026-11-07" })).toBe(true);
    expect(matchesLog(row, { ...defaultLogFilters, to: "2026-11-06" })).toBe(false);
  });
  it("follows summer time just like the schedule", () => {
    expect(logDate("2026-07-01T21:59:59Z")).toBe("2026-07-01");
    expect(logDate("2026-07-01T22:00:00Z")).toBe("2026-07-02");
  });
  it("distinguishes the actor from the member and preserves exact Discord ID digits", () => {
    expect(matchesLog(row, { ...defaultLogFilters, person: " polar " })).toBe(false);
    expect(matchesLog(row, { ...defaultLogFilters, person: " POLAR ", role: "member" })).toBe(true);
    expect(matchesLog(row, { ...defaultLogFilters, person: "123456789012345678", role: "member" })).toBe(true);
    expect(matchesLog(row, { ...defaultLogFilters, person: "%" })).toBe(false);
    expect(matchesLog(row, { ...defaultLogFilters, action: "remove" })).toBe(false);
  });
  it("only routes Root to logs", () => {
    expect(resolveShellPage({ isRoot: true, access: "active" }, "#root-logs")).toBe("root-logs");
    expect(resolveShellPage({ isRoot: false, permissions: ["admin.people"], access: "active" }, "#root-logs")).toBe("admin-people");
  });
});
