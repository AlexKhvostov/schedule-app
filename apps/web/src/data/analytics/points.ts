import { includesPlayer } from "./playerNames";
import type { PointsQuery, PointsHeatmap, PointsReport, PlayerSeries, AnalyticsLimit, HourCell } from "../../analytics/contracts/points";
import { validQuery } from "../../analytics/model/pointsFilters";
import { parseUtc } from "../../analytics/model/time";

export type PointsSource = {
  heatmap: (params: URLSearchParams, signal: AbortSignal) => Promise<unknown>;
  timeline: (params: URLSearchParams, signal: AbortSignal) => Promise<unknown>;
};
export function heatmapParams(query: PointsQuery): URLSearchParams {
  if (!validQuery(query)) throw new Error("invalid-filters");
  const params = new URLSearchParams({ day: query.day, limit: query.limit, limits: query.limit, topN: query.top, sort: query.sort === "points" ? "day_max" : query.sort });
  if (query.players.length) params.set("players", query.players.join(","));
  if (query.segment !== "all") params.set("segment", query.segment);
  return params;
}
export function timelineParams(query: PointsQuery, names: string[]): URLSearchParams {
  if (!validQuery(query) || !names.length) throw new Error("empty-selection");
  return new URLSearchParams({ day: query.day, dateFrom: query.day, dateTo: query.day, limits: query.limit, players: names.join(","), segment: "all", topN: "all" });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-response");
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("invalid-response"); return value; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid-response"); return value; }
function nullable(value: unknown): number | null { return value == null ? null : number(value); }
function name(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("invalid-response"); return value; }
function context(value: unknown, query: PointsQuery) {
  const row = object(value);
  if (row.day !== query.day || row.limit !== query.limit) throw new Error("mismatched-response");
  return row;
}
export function parseHeatmap(value: unknown, query: PointsQuery): PointsHeatmap {
  const row = context(value, query);
  const players = list(row.players).map(raw => {
    const p = object(raw);
    const hours = list(p.hours).map((rawCell): HourCell => {
      const cell = object(rawCell);
      return { hour: number(cell.hour), carry: nullable(cell.max_points_carry), delta: nullable(cell.diff_points), speed: nullable(cell.speed), empty: cell.empty === true, serverDown: cell.serverDown === true, stale: cell.stale_yesterday_tail === true, hasSnapshot: cell.has_snapshot === 1 };
    });
    if (hours.length !== 24 || hours.some((cell, index) => cell.hour !== index)) throw new Error("invalid-hours");
    return { name: name(p.player_name), dayMax: number(p.dayMax), maxSpeed: number(p.maxSpeed), hours };
  });
  if (new Set(players.map(p => p.name)).size !== players.length) throw new Error("duplicate-player");
  if (query.players.length && players.some(p => !includesPlayer(query.players, p.name))) throw new Error("unexpected-player");
  const total = row.totalPlayers == null && !players.length ? 0 : number(row.totalPlayers);
  if (!Number.isInteger(total) || total < players.length || (query.top !== "all" && players.length > Number(query.top))) throw new Error("invalid-count");
  const downtime = players.length ? players[0].hours.filter(cell => cell.serverDown).map(cell => cell.hour) : [];
  return { day: query.day, limit: query.limit, players, total, downtime };
}
export function parseTimeline(value: unknown, query: PointsQuery, names: string[]): PlayerSeries[] {
  const row = context(value, query);
  const series = list(row.series).map(raw => {
    const p = object(raw); const player = name(p.player_name);
    if (!names.includes(player) || p.limit !== query.limit) throw new Error("unexpected-series");
    const points = list(p.points).map(rawPoint => {
      const point = object(rawPoint); const at = name(point.at);
      if (!parseUtc(at) || point.limit !== query.limit) throw new Error("invalid-point");
      return { at, points: number(point.points), limit: query.limit as AnalyticsLimit };
    });
    return { name: player, points };
  });
  if (new Set(series.map(p => p.name)).size !== series.length) throw new Error("duplicate-series");
  return names.flatMap(player => series.filter(item => item.name === player));
}
export async function loadPoints(source: PointsSource, query: PointsQuery, signal: AbortSignal): Promise<PointsReport> {
  const heatmap = parseHeatmap(await source.heatmap(heatmapParams(query), signal), query);
  signal.throwIfAborted();
  const names = heatmap.players.map(p => p.name);
  // Never turn an empty or failed heatmap into an unbounded timeline request.
  if (!names.length) return { heatmap, series: [], timelineError: false, missingPlayers: [] };
  try {
    const series = parseTimeline(await source.timeline(timelineParams(query, names), signal), query, names);
    signal.throwIfAborted();
    return { heatmap, series, timelineError: false, missingPlayers: names.filter(player => !series.some(p => p.name === player && p.points.length)) };
  } catch (error) {
    if (signal.aborted) throw error;
    return { heatmap, series: [], timelineError: true, missingPlayers: [] };
  }
}
