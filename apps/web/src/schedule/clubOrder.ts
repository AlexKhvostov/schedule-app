/** Public position in the complete RedParty list, computed before filtering. */
export type ClubOrderRow = { memberId: string; number: number };
export type ClubOrderSnapshot = { revision: string; rows: ClubOrderRow[] };
export type ClubOrderKey = { memberId: string; key: number };

export function compareClubOrder(a?: number | null, b?: number | null) {
  return Number(a == null) - Number(b == null) || (a ?? 0) - (b ?? 0);
}

export function validClubOrder(rows: readonly ClubOrderRow[]) {
  return rows.every(row => Number.isSafeInteger(row.number) && row.number > 0 && row.number <= rows.length)
    && new Set(rows.map(row => row.memberId)).size === rows.length
    && new Set(rows.map(row => row.number)).size === rows.length;
}

export function validClubOrderKeys(rows: readonly ClubOrderKey[]) {
  return rows.every(row => row && typeof row.memberId === "string" && Number.isSafeInteger(row.key) && row.key > 0)
    && new Set(rows.map(row => row.memberId)).size === rows.length
    && new Set(rows.map(row => row.key)).size === rows.length;
}

export function clubOrderPositions(keys: readonly ClubOrderKey[]): ClubOrderRow[] {
  return [...keys].sort((a, b) => a.key - b.key).map((row, index) => ({ memberId: row.memberId, number: index + 1 }));
}

/** Role loss removes only that membership; new and returning members append. */
export function reconcileClubOrder(keys: readonly ClubOrderKey[], memberIds: readonly string[]): ClubOrderKey[] {
  const eligible = new Set(memberIds);
  const next = keys.filter(row => eligible.has(row.memberId)).map(row => ({ ...row }));
  const present = new Set(next.map(row => row.memberId));
  let max = Math.max(0, ...next.map(row => row.key));
  for (const memberId of eligible) if (!present.has(memberId)) next.push({ memberId, key: ++max });
  return next.sort((a, b) => a.key - b.key);
}

/** Reuse occupied keys; moving to an existing position shifts the interval. */
export function applyClubOrderPositions(keys: readonly ClubOrderKey[], rows: readonly ClubOrderRow[]): ClubOrderKey[] {
  if (!validClubOrderKeys(keys) || !validClubOrder(rows) || rows.length !== keys.length
    || rows.some(row => !keys.some(key => key.memberId === row.memberId))) throw new Error("club-order-invalid");
  const sorted = [...keys].sort((a, b) => a.key - b.key);
  return [...rows].sort((a, b) => a.number - b.number).map((row, index) => ({ memberId: row.memberId, key: sorted[index].key }));
}

export function moveClubOrderTo(rows: readonly ClubOrderRow[], memberId: string, position: number): ClubOrderRow[] {
  if (!validClubOrder(rows) || !Number.isInteger(position) || position < 1 || position > rows.length) return [...rows];
  const ordered = [...rows].sort((a, b) => a.number - b.number);
  const index = ordered.findIndex(row => row.memberId === memberId);
  if (index < 0) return [...rows];
  const [member] = ordered.splice(index, 1);
  ordered.splice(position - 1, 0, member);
  return ordered.map((row, index) => ({ ...row, number: index + 1 }));
}

export function moveClubOrder(rows: readonly ClubOrderRow[], memberId: string, direction: -1 | 1): ClubOrderRow[] {
  const current = rows.find(row => row.memberId === memberId);
  return current ? moveClubOrderTo(rows, memberId, current.number + direction) : [...rows];
}
