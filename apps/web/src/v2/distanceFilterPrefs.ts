import type { DistanceIdFilter, DistancePresenceFilter, DistanceSort } from "../data/distanceBook";

export type DistanceFilters = {
  monthStart: string; roomSlug: string; query: string; showNitro: boolean; showRegular: boolean;
  onlyRedParty: boolean; onlyActiveProfiles: boolean; idFilter: DistanceIdFilter;
  presenceFilter: DistancePresenceFilter; sort: DistanceSort; hiddenLimits: string[];
};

export function distanceFiltersStorageKey(memberId: string | undefined, scope: string) {
  return memberId ? `v2-distance-filters-1:${encodeURIComponent(scope)}:${encodeURIComponent(memberId)}` : null;
}

export function parseDistanceFilters(raw: string | null): DistanceFilters {
  const defaults: DistanceFilters = { monthStart: "", roomSlug: "winamax", query: "", showNitro: true, showRegular: true,
    onlyRedParty: false, onlyActiveProfiles: false, idFilter: "all", presenceFilter: "all", sort: "total", hiddenLimits: [] };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const saved = value as Record<string, unknown>;
    const showNitro = saved.showNitro !== false, showRegular = saved.showRegular !== false;
    return {
      monthStart: typeof saved.monthStart === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(saved.monthStart) ? saved.monthStart : "",
      roomSlug: typeof saved.roomSlug === "string" && /^[a-z0-9-]+$/.test(saved.roomSlug) ? saved.roomSlug : "winamax",
      query: typeof saved.query === "string" ? saved.query : "",
      showNitro: showNitro || !showRegular, showRegular: showRegular || !showNitro,
      onlyRedParty: saved.onlyRedParty === true, onlyActiveProfiles: saved.onlyActiveProfiles === true,
      idFilter: saved.idFilter === "set" || saved.idFilter === "missing" ? saved.idFilter : "all",
      presenceFilter: saved.presenceFilter === "with" || saved.presenceFilter === "without" ? saved.presenceFilter : "all",
      sort: ["discord", "game", "distanceId", "updated"].includes(String(saved.sort)) ? saved.sort as DistanceSort : "total",
      hiddenLimits: Array.isArray(saved.hiddenLimits) ? [...new Set(saved.hiddenLimits.filter((limit): limit is string => typeof limit === "string" && /^\d+(\.\d+)?$/.test(limit)))] : [],
    };
  } catch { return defaults; }
}

export function loadDistanceFilters(key: string | null): DistanceFilters {
  try { return parseDistanceFilters(key ? localStorage.getItem(key) : null); }
  catch { return parseDistanceFilters(null); }
}

export function saveDistanceFilters(key: string | null, filters: DistanceFilters) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(filters)); }
  catch { /* Unavailable storage must not prevent filtering for this visit. */ }
}
