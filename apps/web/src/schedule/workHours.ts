export const DAY_HALF_SLOTS = 48;

export type WorkHours = {
  startHalf: number;
  endHalf: number;
};

export const DEFAULT_WORK_HOURS: WorkHours = { startHalf: 0, endHalf: DAY_HALF_SLOTS };

function validHalf(value: unknown, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

export function normalizeWorkHours(startHalf: unknown, endHalf: unknown): WorkHours {
  if (!validHalf(startHalf, DAY_HALF_SLOTS - 1) || !validHalf(endHalf, DAY_HALF_SLOTS)) {
    return { ...DEFAULT_WORK_HOURS };
  }
  if ((startHalf as number) >= (endHalf as number)) return { ...DEFAULT_WORK_HOURS };
  return { startHalf: startHalf as number, endHalf: endHalf as number };
}

export function workHalfSlots(startHalf: number, endHalf: number) {
  return Array.from({ length: endHalf - startHalf }, (_, index) => startHalf + index);
}

export function halfTimeLabel(half: number) {
  if (half === DAY_HALF_SLOTS) return "24:00";
  const minutes = half * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export type WorkHourSegment = {
  hour: number;
  startHalf: number;
  span: number;
};

export function workHourSegments(startHalf: number, endHalf: number): WorkHourSegment[] {
  const firstHour = Math.floor(startHalf / 2);
  const lastHour = Math.ceil(endHalf / 2);
  return Array.from({ length: lastHour - firstHour }, (_, index) => {
    const hour = firstHour + index;
    const first = Math.max(startHalf, hour * 2);
    const last = Math.min(endHalf, hour * 2 + 2);
    return { hour, startHalf: first, span: last - first };
  });
}

export function workTrackProgress(half: number, progress: number, startHalf: number, endHalf: number) {
  const point = half + Math.min(1, Math.max(0, progress));
  if (point < startHalf || point >= endHalf) return null;
  return (point - startHalf) / (endHalf - startHalf);
}

export function clipWorkRun(start: number, end: number, startHalf: number, endHalf: number) {
  const clippedStart = Math.max(start, startHalf);
  const clippedEnd = Math.min(end, endHalf);
  return clippedStart < clippedEnd ? { start: clippedStart, end: clippedEnd } : null;
}
