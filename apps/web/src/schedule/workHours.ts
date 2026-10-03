export const DAY_HOURS = 24;
export const DAY_HALF_SLOTS = DAY_HOURS * 2;

export type WorkHours = number[];

export const DEFAULT_WORK_HOURS: WorkHours = Array.from({ length: DAY_HOURS }, (_, hour) => hour);

function validHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < DAY_HOURS;
}

function validHalf(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

export function normalizeWorkHours(value: unknown, legacyStartHalf?: unknown, legacyEndHalf?: unknown): WorkHours {
  if (Array.isArray(value)) {
    const hours = [...new Set(value.filter(validHour))].sort((a, b) => a - b);
    if (hours.length) return hours;
  }

  if (
    validHalf(legacyStartHalf, DAY_HALF_SLOTS - 1)
    && validHalf(legacyEndHalf, DAY_HALF_SLOTS)
    && legacyStartHalf < legacyEndHalf
  ) {
    const first = Math.floor(legacyStartHalf / 2);
    const last = Math.ceil(legacyEndHalf / 2);
    return Array.from({ length: last - first }, (_, index) => first + index);
  }

  return [...DEFAULT_WORK_HOURS];
}

export function workHalfSlots(hours: WorkHours) {
  return hours.flatMap((hour) => [hour * 2, hour * 2 + 1]);
}

export function workGapBefore(visibleHalves: number[], half: number) {
  const index = visibleHalves.indexOf(half);
  return index > 0 && visibleHalves[index - 1] !== half - 1;
}

export type HiddenWorkBoundary = {
  key: string;
  kind: "start" | "gap" | "end";
  fromHalf: number;
  toHalf: number;
  beforeHalf?: number;
};

/** Boundaries of the hidden parts of a compressed 24-hour axis. */
export function hiddenWorkBoundaries(visibleHalves: number[]): HiddenWorkBoundary[] {
  if (!visibleHalves.length) return [];
  const boundaries: HiddenWorkBoundary[] = [];
  const first = visibleHalves[0];
  if (first > 0) boundaries.push({ key: "start", kind: "start", fromHalf: 0, toHalf: first });
  for (let index = 1; index < visibleHalves.length; index += 1) {
    const half = visibleHalves[index];
    const previous = visibleHalves[index - 1];
    if (half > previous + 1) {
      boundaries.push({
        key: `gap-${half}`,
        kind: "gap",
        fromHalf: previous + 1,
        toHalf: half,
        beforeHalf: half,
      });
    }
  }
  const last = visibleHalves.at(-1) ?? DAY_HALF_SLOTS - 1;
  if (last < DAY_HALF_SLOTS - 1) {
    boundaries.push({ key: "end", kind: "end", fromHalf: last + 1, toHalf: DAY_HALF_SLOTS });
  }
  return boundaries;
}

export function clampWorkRangeHalf(originHalf: number, targetHalf: number, hours: WorkHours) {
  const visibleHalves = workHalfSlots(hours);
  const originIndex = visibleHalves.indexOf(originHalf);
  if (originIndex < 0) return originHalf;
  let first = originIndex;
  let last = originIndex;
  while (first > 0 && visibleHalves[first - 1] === visibleHalves[first] - 1) first -= 1;
  while (last < visibleHalves.length - 1 && visibleHalves[last + 1] === visibleHalves[last] + 1) last += 1;
  return Math.min(visibleHalves[last], Math.max(visibleHalves[first], targetHalf));
}

export type WorkHourSegment = {
  hour: number;
  startHalf: number;
  span: 2;
  visibleStart: number;
};

export function workHourSegments(hours: WorkHours): WorkHourSegment[] {
  return hours.map((hour, index) => ({ hour, startHalf: hour * 2, span: 2, visibleStart: index * 2 }));
}

export function workTrackProgress(half: number, progress: number, hours: WorkHours) {
  const visibleHalves = workHalfSlots(hours);
  const index = visibleHalves.indexOf(half);
  if (index < 0) return null;
  return (index + Math.min(1, Math.max(0, progress))) / visibleHalves.length;
}

export type VisibleWorkRun = {
  start: number;
  end: number;
  visibleStart: number;
  span: number;
};

export function visibleWorkRuns(start: number, end: number, hours: WorkHours): VisibleWorkRun[] {
  const visibleHalves = workHalfSlots(hours);
  const included = visibleHalves
    .map((half, visibleIndex) => ({ half, visibleIndex }))
    .filter(({ half }) => half >= start && half < end);
  const runs: VisibleWorkRun[] = [];

  for (const item of included) {
    const previous = runs.at(-1);
    if (previous && previous.end === item.half && previous.visibleStart + previous.span === item.visibleIndex) {
      previous.end += 1;
      previous.span += 1;
    } else {
      runs.push({ start: item.half, end: item.half + 1, visibleStart: item.visibleIndex, span: 1 });
    }
  }
  return runs;
}
