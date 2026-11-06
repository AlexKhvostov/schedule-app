import { demoRegSide } from "./demoRegs";
import type { PointsQuery, AnalyticsLimit, AudienceSegment } from "../../analytics/contracts/points";
import { matchesAudience } from "../../analytics/model/pointsFilters";
import { madridMinute } from "../../analytics/model/time";
import type { PointsSource } from "./points";

// Invented names and values only. Never used as a fallback for an unavailable live API.
function samples(day: string, limit: AnalyticsLimit) {
  if (day < "2020-01-01") return [];
  const seed = Number(day.slice(-2));
  const now = new Date();
  const nowLocal = madridMinute(now);
  const weight = { "16-25": 1, "50": 2, "100": 3, "250": 4 }[limit];
  const instants = new Map<number, string>();
  const start = new Date(`${day}T00:00:00Z`).getTime();
  for (let offset = -180; offset < 1620; offset += 6) {
    const date = new Date(start + offset * 60000); const local = madridMinute(date);
    if (local.startsWith(day)) instants.set(Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)), date.toISOString());
  }
  return Array.from({ length: 16 }, (_, index) => {
    const name = `Demo ${String(index + 1).padStart(2, "0")}`;
    const side = demoRegSide(name);
    let carry = 0;
    const points: { at: string; points: number; limit: AnalyticsLimit }[] = [];
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const serverDown = hour === 12;
      const future = `${day} ${String(hour).padStart(2, "0")}:00` > nowLocal;
      const empty = future || hour < 6 + index % 3 || hour > 21 || serverDown || (index === 2 && hour === 9);
      if (empty) return { hour, diff_points: null, empty: true, serverDown };
      const delta = index === 15 ? 0 : (5 + (index * 7 + hour * 3 + seed) % 18) * weight;
      const before = carry;
      for (let step = 0; step < 10; step++) {
        const at = instants.get(hour * 60 + step * 6);
        if (at && at <= now.toISOString()) {
          carry = Math.round(before + delta * step / 9);
          points.push({ at, points: carry, limit });
        }
      }
      return { hour, diff_points: carry - before, max_points_carry: carry, speed: Math.round(delta * 60 / 54 * 10) / 10, has_snapshot: 1, empty: false, serverDown: false };
    });
    return { player_name: name, side, dayMax: carry, maxSpeed: Math.max(0, ...hours.map(h => h.speed ?? 0)), hours, points };
  });
}
async function pause(signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 100);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export const demoPointsSource: PointsSource = {
  async heatmap(params, signal) {
    await pause(signal);
    const day = params.get("day")!; const limit = params.get("limit") as AnalyticsLimit;
    const names = params.get("players")?.split(",") ?? [];
    let players = samples(day, limit).filter(p => (!names.length || names.includes(p.player_name)) && matchesAudience(p.side, (params.get("segment") ?? "all") as AudienceSegment));
    const sort = params.get("sort");
    players.sort((a, b) => (sort === "name" ? 0 : sort === "speed" ? b.maxSpeed - a.maxSpeed : b.dayMax - a.dayMax) || a.player_name.localeCompare(b.player_name));
    const totalPlayers = players.length;
    if (params.get("topN") !== "all") players = players.slice(0, Number(params.get("topN")));
    return { day, limit, totalPlayers, players, downtimeHours: [12] };
  },
  async timeline(params, signal) {
    await pause(signal);
    const day = params.get("day")!; const limit = params.get("limits") as AnalyticsLimit;
    const names = params.get("players")!.split(",");
    const players = samples(day, limit).filter(p => names.includes(p.player_name));
    return { day, limit, series: players.map(p => ({ player_name: p.player_name, limit, points: p.points })) };
  },
};
export function demoQuery(day: string): PointsQuery { return { day, limit: "50", players: [], segment: "all", top: "10", sort: "points" }; }
