import type { PriorityFilters } from "../schedule/priorities";

export function priorityFiltersStorageKey(memberId: string | undefined, scope: string) {
  return memberId ? `v2-priority-filters-1:${encodeURIComponent(scope)}:${encodeURIComponent(memberId)}` : null;
}

export function parsePriorityFilters(raw: string | null): PriorityFilters {
  const defaults: PriorityFilters = { roleIds: [], active: false, scheduleActive: false };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const saved = value as Record<string, unknown>;
    return {
      ...(saved.kind === "nitro" || saved.kind === "regular" ? { kind: saved.kind } : {}),
      ...(saved.group === "50-100" || saved.group === "250" ? { group: saved.group } : {}),
      roleIds: Array.isArray(saved.roleIds)
        ? [...new Set(saved.roleIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
        : [],
      active: saved.active === true,
      scheduleActive: saved.scheduleActive === true,
    };
  } catch {
    return defaults;
  }
}

export function loadPriorityFilters(key: string | null): PriorityFilters {
  try {
    return parsePriorityFilters(key ? localStorage.getItem(key) : null);
  } catch {
    return parsePriorityFilters(null);
  }
}

export function savePriorityFilters(key: string | null, filters: PriorityFilters) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Storage can be unavailable or full; filtering still works for this visit.
  }
}
