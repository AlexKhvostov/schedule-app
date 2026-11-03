// Same canonical calendar as apps/web/src/schedule/cet.ts. No fixed UTC offset.
export const SCHEDULE_TIMEZONE = "Europe/Madrid";
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localAt(ms: number): string {
  const p = Object.fromEntries(formatter.formatToParts(ms).map((v) => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// Cache is per response, never an unbounded process cache of user-supplied dates.
export function timeResolver() {
  const offsets = new Map<string, number[]>();
  const resolved = new Map<string, number[]>();
  function candidates(local: string): number[] {
    const cached = resolved.get(local);
    if (cached) return cached;
    const date = local.slice(0, 10);
    let possibleOffsets = offsets.get(date);
    if (!possibleOffsets) {
      const midnight = Date.parse(`${date}T00:00:00Z`);
      const values = new Set<number>();
      for (let hour = -24; hour <= 48; hour += 6) {
        const ms = midnight + hour * 3600000;
        values.add(Date.parse(`${localAt(ms)}Z`) - ms);
      }
      possibleOffsets = [...values];
      offsets.set(date, possibleOffsets);
    }
    const civil = Date.parse(`${local}Z`);
    const matches = possibleOffsets.map((offset) => civil - offset)
      .filter((ms) => localAt(ms) === local).sort((a, b) => a - b);
    resolved.set(local, matches);
    return matches;
  }
  return (date: string, half: number) => {
    const civil = Date.parse(`${date}T00:00:00Z`) + half * 1800000;
    const start_local = new Date(civil).toISOString().slice(0, 19);
    const end_local = new Date(civil + 1800000).toISOString().slice(0, 19);
    const start = candidates(start_local), end = candidates(end_local);
    const time_resolution = start.length === 0 || end.length === 0
      ? "nonexistent"
      : start.length > 1 || end.length > 1
      ? "ambiguous"
      : end[0] - start[0] !== 1800000
      ? "transition"
      : "exact";
    return {
      start_local,
      end_local,
      start_at: time_resolution === "exact" ? new Date(start[0]).toISOString() : null,
      end_at: time_resolution === "exact" ? new Date(end[0]).toISOString() : null,
      time_resolution,
    };
  };
}
