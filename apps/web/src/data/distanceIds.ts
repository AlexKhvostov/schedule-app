/** The first ID is primary. IDs are text, so leading zeroes remain significant. */
export function parseDistanceIds(value: string): string[] | null {
  const ids = value.trim() ? value.trim().split(/[\s;]+/).map((id) => id.replace(/[,.]0+$/, "")) : [];
  if (ids.some((id) => !/^\d{1,12}$/.test(id)) || new Set(ids).size !== ids.length) return null;
  return ids;
}

export function memberDistanceIds(person: { distanceIds?: string[]; distanceExtId: string | null }): string[] {
  return person.distanceIds ?? (person.distanceExtId ? [person.distanceExtId] : []);
}
