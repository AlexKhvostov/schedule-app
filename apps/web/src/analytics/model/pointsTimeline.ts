import type { AnalyticsLimit, PlayerSeries, TimelineSeries, TimelinePoint } from "../contracts/points";
import { madridMinute, parseUtc } from "./time";

// Preserve the reference's 24-hour wall-clock grid, 6-minute MAX buckets and carry.
// The repeated autumn DST hour is merged; the skipped spring hour has no raw samples.
export function buildTimeline(series: PlayerSeries[], day: string, limit: AnalyticsLimit, now: Date): TimelineSeries[] {
  const nowKey = madridMinute(now);
  return series.map(player => {
    const buckets = new Map<number, number>();
    for (const point of player.points) {
      if (point.limit !== limit) continue;
      const at = parseUtc(point.at);
      if (!at) continue;
      const local = madridMinute(at);
      if (local.slice(0, 10) !== day) continue;
      const minute = Math.floor((Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16))) / 6) * 6;
      buckets.set(minute, Math.max(buckets.get(minute) ?? -Infinity, point.points));
    }
    let last: number | null = null;
    const values = Array.from({ length: 240 }, (_, index) => {
      const minute = index * 6;
      const key = `${day} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      if (key > nowKey) return { minute, value: null };
      if (buckets.has(minute)) last = buckets.get(minute)!;
      return { minute, value: last };
    });
    return { name: player.name, values };
  });
}
export function timelineSpeed(values: TimelinePoint[], index: number): number | null {
  const now = values[index]?.value;
  if (now == null) return null;
  // Reference preference: 30min, then 36..60min, then 24/18min.
  for (const back of [5, 6, 7, 8, 9, 10, 4, 3]) {
    const prev = values[index - back]?.value;
    if (prev != null) return Math.round((now - prev) / (back * 6) * 600) / 10;
  }
  return null;
}
