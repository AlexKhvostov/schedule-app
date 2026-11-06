import type { MonthlyQuery, MonthlySection, MonthReport } from "../contracts/monthly";
import { analyticsLimits, audienceSegments, topOptions } from "../contracts/points";
import { madridDay, validDay } from "./time";

export const monthlyFields = { profile: ["month", "limit", "player"], speed: ["month", "limit", "segment", "players"], density: ["month", "limit", "segment", "players"] } as const;
export function defaultMonthQuery(now = new Date()): MonthlyQuery { return { month: madridDay(now).slice(0, 7), limit: "50", segment: "all", players: [], top: "10" }; }
export function validMonthQuery(query: MonthlyQuery, section: MonthlySection): boolean {
  return /^\d{4}-\d{2}$/.test(query.month) && validDay(`${query.month}-01`) && analyticsLimits.includes(query.limit)
    && audienceSegments.includes(query.segment) && topOptions.includes(query.top) && query.players.length <= (section === "profile" ? 1 : 100)
    && query.players.every(n => n.trim().length > 0 && n.length <= 100);
}
export function monthLength(month: string): number { return new Date(`${month}-01T12:00:00Z`).getUTCMonth() === 11 ? 31 : new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).getUTCDate(); }
// Profile averages include zero speeds, exactly as in ProfileHubView; the speed ranking has a different server definition.
export function profileMetrics(report: MonthReport) {
  const speeds = report.days.flatMap(d => d.hours.filter(c => !c.empty && !c.serverDown && c.speed !== null).map(c => c.speed!));
  const points = report.days.flatMap(d => d.total === null ? [] : [d.total]);
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const values = report.days.map(d => d.hours[hour]).filter(c => !c.empty && !c.serverDown && c.speed !== null).map(c => c.speed!);
    return values.length ? Math.round(values.reduce((a,b) => a+b, 0) / values.length * 10) / 10 : null;
  });
  return { maxPoints: points.length ? Math.max(...points) : null, maxSpeed: speeds.length ? Math.max(...speeds) : null, avgSpeed: speeds.length ? speeds.reduce((a,b) => a+b,0)/speeds.length : null, hourly };
}
