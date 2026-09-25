import type { Mark } from "./marks";
import { emptyMonth, type Occupancy } from "./plan";

const KEY = "v2-demo-schedule-v1";

type SavedCell = [dayIndex: number, half: number, seats: (Mark | null)[]];
type SavedGrid = { days: number; cells: SavedCell[] };
type DemoScheduleStore = Record<string, SavedGrid>;

function storage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function gridKey(year: number, monthIndex: number, variant: "nitro" | "regular", limit: string) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}:${variant}:${limit}`;
}

function readStore(): DemoScheduleStore {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DemoScheduleStore) : {};
  } catch {
    return {};
  }
}

function pack(grid: Occupancy): SavedGrid {
  const cells: SavedCell[] = [];
  grid.forEach((day, dayIndex) => {
    day.forEach((seats, half) => {
      if (seats.some(Boolean)) cells.push([dayIndex, half, seats]);
    });
  });
  return { days: grid.length, cells };
}

function unpack(saved: SavedGrid, year: number, monthIndex: number): Occupancy | null {
  if (!saved || !Number.isInteger(saved.days) || !Array.isArray(saved.cells)) return null;
  const grid = emptyMonth(year, monthIndex);
  if (saved.days !== grid.length) return null;
  for (const cell of saved.cells) {
    if (!Array.isArray(cell) || cell.length !== 3) return null;
    const [dayIndex, half, seats] = cell;
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= grid.length) return null;
    if (!Number.isInteger(half) || half < 0 || half >= 48 || !Array.isArray(seats)) return null;
    grid[dayIndex][half] = seats;
  }
  return grid;
}

export function loadDemoSchedule(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  limit: string,
  fallback: () => Occupancy,
) {
  const saved = readStore()[gridKey(year, monthIndex, variant, limit)];
  return (saved && unpack(saved, year, monthIndex)) || fallback();
}

export function saveDemoSchedule(
  year: number,
  monthIndex: number,
  variant: "nitro" | "regular",
  limit: string,
  grid: Occupancy,
) {
  const target = storage();
  if (!target) return;
  try {
    const current = readStore();
    current[gridKey(year, monthIndex, variant, limit)] = pack(grid);
    target.setItem(KEY, JSON.stringify(current));
  } catch {
    // Demo persistence is best-effort: a full/disabled browser store must not break the schedule.
  }
}

export function resetDemoSchedules() {
  storage()?.removeItem(KEY);
}
