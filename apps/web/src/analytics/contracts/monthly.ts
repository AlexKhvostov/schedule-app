import type { AnalyticsLimit, AudienceSegment, PointsControls, HourCell } from "./points";
export type MonthlySection = "profile" | "speed" | "density";
export type MonthlyQuery = { month: string; limit: AnalyticsLimit; players: string[]; segment: AudienceSegment; top: PointsControls["top"] };
export type MonthDay = { day: string; total: number | null; hours: HourCell[] };
export type MonthReport = { mode: "player" | "density"; month: string; limit: AnalyticsLimit; player: string | null; playerCount: number; days: MonthDay[]; byHour: (number | null)[]; total: number | null };
export type SpeedRow = { name: string; max: number; avg: number; points: number; side: "ours" | "theirs" | null; bestDelta: number | null; bestMinutes: number | null; bestDay: string | null; bestHour: number | null };
export type SpeedReport = { rows: SpeedRow[]; topHours: (number | null)[]; allHours: (number | null)[] };
export type CellSelection = { hour: number; day: string | null };
export type CellReport = { total: number; sum: number; players: { name: string; delta: number; speed: number | null }[] };
