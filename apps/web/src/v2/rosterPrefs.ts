import type { PriorityTab } from "./PriorityTabLabel";

const KEY = "v2-roster-tab";

export function loadRosterTab(fallback: PriorityTab): PriorityTab {
  try {
    const value = localStorage.getItem(KEY);
    return value === "nitro" || value === "regular" || value === "both" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveRosterTab(tab: PriorityTab) {
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    // Switching still works when browser storage is unavailable.
  }
}
