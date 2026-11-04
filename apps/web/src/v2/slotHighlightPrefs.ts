export function slotHighlightStorageKey(memberId: string | undefined, scope: string) {
  return memberId ? `v2-slot-highlight-1:${encodeURIComponent(scope)}:${encodeURIComponent(memberId)}` : null;
}

export function loadSlotHighlightDisabled(key: string | null): boolean {
  try { return !!key && localStorage.getItem(key) === "true"; }
  catch { return false; }
}

export function saveSlotHighlightDisabled(key: string | null, disabled: boolean) {
  if (!key) return;
  try { localStorage.setItem(key, String(disabled)); }
  catch { /* Local storage may be unavailable; the choice still applies for this visit. */ }
}
