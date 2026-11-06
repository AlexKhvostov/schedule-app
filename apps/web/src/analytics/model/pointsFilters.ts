import { analyticsLimits, audienceSegments, sortOptions, topOptions, type PointsFilters, type PointsQuery, type AudienceSegment } from "../contracts/points";
import { madridDay, validDay } from "./time";

// These are the only server filters consumed by both Daily Points widgets.
export const pointsFilterFields = ["day", "limit", "segment", "players"] as const;
export function defaultPointsFilters(now = new Date()): PointsFilters {
  return { day: madridDay(now), limit: "50", players: [], segment: "all" };
}
export function parsePlayerNames(raw: string): string[] {
  return [...new Set(raw.split(/[,;\r\n]+/).map(name => name.trim()).filter(Boolean))];
}
export function normalizeFilters(filters: PointsFilters): PointsFilters {
  return { ...filters, players: [...new Set(filters.players.map(name => name.trim()).filter(Boolean))].sort() };
}
export function validFilters(filters: PointsFilters): boolean {
  return validDay(filters.day) && analyticsLimits.includes(filters.limit) && audienceSegments.includes(filters.segment)
    && filters.players.length <= 100 && filters.players.every(name => name.length <= 100 && !/[,;\r\n]/.test(name));
}
export function filtersKey(filters: PointsFilters): string { return JSON.stringify(normalizeFilters(filters)); }
export function queryKey(query: PointsQuery): string { return JSON.stringify({ ...normalizeFilters(query), top: query.top, sort: query.sort }); }
export function validQuery(query: PointsQuery): boolean {
  return validFilters(query) && topOptions.includes(query.top) && sortOptions.includes(query.sort);
}
export function matchesAudience(side: "ours" | "theirs" | null, segment: AudienceSegment): boolean {
  switch (segment) {
    case "all": return true;
    case "regs": return side !== null;
    case "ours": return side === "ours";
    case "theirs": return side === "theirs";
    case "not_ours": return side !== "ours";
    case "not_theirs": return side !== "theirs";
    case "nonregs": return side === null;
  }
}
