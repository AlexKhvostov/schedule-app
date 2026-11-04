export type SlotTint = { enabled: boolean; strength: number };
export const DEFAULT_SLOT_TINT: SlotTint = { enabled: true, strength: 8 };
export const MAX_SLOT_TINT = 30;

export function isSlotTint(value: unknown): value is SlotTint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const tint = value as Record<string, unknown>;
  return Object.keys(tint).length === 2 && typeof tint.enabled === "boolean"
    && typeof tint.strength === "number" && Number.isInteger(tint.strength)
    && tint.strength >= 0 && tint.strength <= MAX_SLOT_TINT;
}

export function normalizeSlotTint(value: unknown): SlotTint {
  return { ...(isSlotTint(value) ? value : DEFAULT_SLOT_TINT) };
}

export function sameSlotTint(a: SlotTint, b: SlotTint) {
  return a.enabled === b.enabled && a.strength === b.strength;
}

export function slotTintStrength(tint: SlotTint) {
  return `${tint.enabled ? tint.strength : 0}%`;
}
