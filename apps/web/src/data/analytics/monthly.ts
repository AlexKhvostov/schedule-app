import { includesPlayer } from "./playerNames";
import type { CellReport, CellSelection, MonthReport, MonthlyQuery, MonthlySection, SpeedReport } from "../../analytics/contracts/monthly";
import type { HourCell } from "../../analytics/contracts/points";
import { monthLength, validMonthQuery } from "../../analytics/model/monthly";
import { validDay } from "../../analytics/model/time";

export type MonthlySource = { heatmap: (params: URLSearchParams, signal: AbortSignal) => Promise<unknown>; speed: (params: URLSearchParams, signal: AbortSignal) => Promise<unknown>; cell: (params: URLSearchParams, signal: AbortSignal) => Promise<unknown> };
export function monthlyParams(query: MonthlyQuery, section: MonthlySection) {
  if (!validMonthQuery(query, section) || (section === "profile" && query.players.length !== 1)) throw new Error("invalid-filters");
  const params = new URLSearchParams({ month: query.month, limit: query.limit });
  if (section === "profile") params.set("player", query.players[0]);
  else { params.set("segment", query.segment); if (query.players.length) params.set("players", query.players.join(",")); }
  if (section === "density") params.set("mode", "density");
  if (section === "speed") { params.set("limits", query.limit); params.set("topN", query.top); }
  return params;
}
export function cellParams(query: MonthlyQuery, selection: CellSelection) {
  const params = monthlyParams(query, "density"); params.delete("mode");
  if (!Number.isInteger(selection.hour) || selection.hour < 0 || selection.hour > 23) throw new Error("invalid-hour");
  params.set("hour", String(selection.hour));
  if (selection.day !== null) {
    if (!validDay(selection.day) || !selection.day.startsWith(query.month + "-")) throw new Error("invalid-day");
    params.delete("month"); params.set("day", selection.day);
  }
  return params;
}
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("invalid-response"); return v as Record<string, unknown>; }
function arr(v: unknown): unknown[] { if (!Array.isArray(v)) throw new Error("invalid-response"); return v; }
function num(v: unknown): number { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("invalid-response"); return v; }
function nullable(v: unknown): number | null { return v == null ? null : num(v); }
function str(v: unknown): string { if (typeof v !== "string" || !v.trim()) throw new Error("invalid-response"); return v; }
function hours<T>(raw: unknown, parse: (r: Record<string, unknown>) => T): T[] {
  const list = arr(raw); if (list.length !== 24) throw new Error("invalid-hours");
  return list.map((v, h) => { const r = obj(v); if (r.hour !== h) throw new Error("invalid-hours"); return parse(r); });
}
export function parseMonth(raw: unknown, query: MonthlyQuery, section: "profile" | "density"): MonthReport {
  const r = obj(raw); const mode = section === "profile" ? "player" : "density";
  if (r.month !== query.month || r.limit !== query.limit || r.mode !== mode || (section === "profile" && r.player !== query.players[0])) throw new Error("mismatched-response");
  const days = arr(r.days).map((d, index) => {
    const row = obj(d); const day = `${query.month}-${String(index + 1).padStart(2,"0")}`;
    if (row.day !== day) throw new Error("invalid-days");
    return { day, total: nullable(row.dayMax), hours: hours(row.hours, (c): HourCell => ({ hour: num(c.hour), carry: nullable(c.max_points_carry), delta: nullable(c.diff_points), speed: nullable(c.speed), empty: c.empty === true, serverDown: c.serverDown === true, stale: false, hasSnapshot: c.has_snapshot === 1 })) };
  });
  if (days.length !== monthLength(query.month)) throw new Error("invalid-days");
  return { mode, month: query.month, limit: query.limit, player: mode === "player" ? query.players[0] : null, playerCount: mode === "density" ? num(r.playerCount) : 1, days, byHour: mode === "density" ? hours(r.byHour, c => nullable(c.diff_points)) : [], total: mode === "density" ? nullable(r.byHourTotal) : null };
}
export function parseSpeed(raw: unknown, query: MonthlyQuery): SpeedReport {
  const r = obj(raw); const meta = obj(r.meta);
  if (meta.month !== query.month || meta.limit !== query.limit) throw new Error("mismatched-response");
  const rows = arr(r.rows).map(v => { const p = obj(v); const name = str(p.player_name);
    if (query.players.length && !includesPlayer(query.players, name)) throw new Error("unexpected-player");
    if (p.reg_side != null && p.reg_side !== "ours" && p.reg_side !== "theirs") throw new Error("invalid-side");
    return { name, max: num(p.max_speed), avg: num(p.avg_speed), points: num(p.max_points), side: (p.reg_side ?? null) as "ours" | "theirs" | null, bestDelta: nullable(p.best_delta), bestMinutes: nullable(p.best_minutes), bestDay: p.best_day == null ? null : str(p.best_day), bestHour: nullable(p.best_hour) };
  });
  if (new Set(rows.map(r => r.name)).size !== rows.length || (query.top !== "all" && rows.length > Number(query.top))) throw new Error("invalid-players");
  return { rows, topHours: hours(r.byHour, h => nullable(h.avg_speed)), allHours: hours(r.byHour, h => nullable(h.avg_speed_all)) };
}
export function parseCell(raw: unknown, query: MonthlyQuery, selection: CellSelection): CellReport {
  const r = obj(raw);
  if (r.month !== query.month || r.limit !== query.limit || r.hour !== selection.hour || r.day !== selection.day || r.scope !== (selection.day ? "day" : "month")) throw new Error("mismatched-response");
  const players = arr(r.players).map(v => { const p = obj(v); const name = str(p.player_name); if (query.players.length && !includesPlayer(query.players, name)) throw new Error("unexpected-player"); return { name, delta: num(p.diff_points), speed: nullable(p.speed) }; });
  const total = num(r.total); if (total !== players.length || new Set(players.map(p=>p.name)).size !== total) throw new Error("invalid-count");
  return { total, sum: num(r.sum_diff), players };
}
export async function loadMonth(source: MonthlySource, query: MonthlyQuery, section: "profile" | "density", signal: AbortSignal) { const raw = await source.heatmap(monthlyParams(query, section), signal); signal.throwIfAborted(); return parseMonth(raw, query, section); }
export async function loadSpeed(source: MonthlySource, query: MonthlyQuery, signal: AbortSignal) { const raw = await source.speed(monthlyParams(query, "speed"), signal); signal.throwIfAborted(); return parseSpeed(raw, query); }
export async function loadCell(source: MonthlySource, query: MonthlyQuery, selection: CellSelection, signal: AbortSignal) { const raw = await source.cell(cellParams(query, selection), signal); signal.throwIfAborted(); return parseCell(raw, query, selection); }
