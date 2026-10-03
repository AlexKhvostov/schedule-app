import { normalizeTablePresets } from "../data/tablePresets";

const STORAGE_KEY = "redparty.schedule.table-presets.v1";

type StoredSelections = Record<string, number>;

function readSelections(): StoredSelections {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([memberId, value]) => [memberId, Number(value)] as const)
        .filter(([memberId, value]) => memberId.length > 0 && Number.isInteger(value)),
    );
  } catch {
    return {};
  }
}

export function resolveTablePresetSelection(
  presets: readonly unknown[] | null | undefined,
  fallback: unknown,
  selected?: unknown,
) {
  const values = normalizeTablePresets(presets, fallback);
  const wanted = Number(selected);
  const fallbackNumber = Number(fallback);
  const active = values.includes(wanted)
    ? wanted
    : values.includes(fallbackNumber)
      ? fallbackNumber
      : values[0];
  return { values, active };
}

export function loadTablePresetSelection(memberId: string, presets: readonly unknown[], fallback: unknown) {
  return resolveTablePresetSelection(presets, fallback, readSelections()[memberId]);
}

export function saveTablePresetSelection(memberId: string, value: number) {
  if (typeof localStorage === "undefined" || !memberId || !Number.isInteger(value)) return;
  const current = readSelections();
  current[memberId] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A blocked or full localStorage must not prevent schedule editing.
  }
}
