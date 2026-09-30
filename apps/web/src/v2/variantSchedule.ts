import { formatVariantLimit } from "../schedule/capacity";
import type { Occupancy } from "../schedule/plan";
import { monthGridKey, type MonthGridStore, type ScheduleVariant } from "../data/slots";
import type { ScheduleFilterLimits } from "../data/scheduleSettings";

export type VariantGridItem = {
  key: string;
  label: string;
  variant: ScheduleVariant;
  limit: string;
  grid: Occupancy;
};

export type SchedulePairRow = {
  variant: ScheduleVariant;
  limit: string;
  disabled: boolean;
};

function hasOccupancy(grid?: Occupancy) {
  return Boolean(grid?.some((day) => day.some((half) => half.some(Boolean))));
}

export function schedulePairRows(
  available: ScheduleFilterLimits,
  variants: readonly ScheduleVariant[],
  selectedLimits: readonly string[],
  store: MonthGridStore,
): SchedulePairRow[] {
  return variants.flatMap((variant) => {
    const enabled = new Set(available[variant]);
    const visible = new Set(selectedLimits.filter((limit) => enabled.has(limit)));
    for (const limit of Object.keys(store).filter((key) => key.startsWith(`${variant}:`)).map((key) => key.slice(variant.length + 1))) {
      if (!enabled.has(limit) && hasOccupancy(store[monthGridKey(variant, limit)])) visible.add(limit);
    }
    return [...visible]
      .sort((a, b) => Number(a) - Number(b))
      .map((limit) => ({ variant, limit, disabled: !enabled.has(limit) }));
  });
}

/** Stable projection used by all auxiliary schedule windows. */
export function variantGridItems(
  store: MonthGridStore,
  variants: readonly ScheduleVariant[],
  limits: readonly string[],
  pairRows?: readonly SchedulePairRow[],
): VariantGridItem[] {
  const pairs = pairRows ?? variants.flatMap((variant) => limits.map((limit) => ({ variant, limit, disabled: false })));
  return pairs.flatMap(({ variant, limit }) => {
      const grid = store[monthGridKey(variant, limit)];
      if (!grid) return [];
      return [{
        key: monthGridKey(variant, limit),
        label: formatVariantLimit(variant, limit),
        variant,
        limit,
        grid,
      }];
    });
}

export function gridsByVariantLabel(items: readonly VariantGridItem[]) {
  return Object.fromEntries(items.map((item) => [item.label, item.grid]));
}

export function displayScheduleColumn(value: string) {
  return /^[NE][0-9]/.test(value) ? value : `${value.replace(".", ",")} €`;
}
