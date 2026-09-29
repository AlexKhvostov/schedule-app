import { formatVariantLimit } from "../schedule/capacity";
import type { Occupancy } from "../schedule/plan";
import { monthGridKey, type MonthGridStore, type ScheduleVariant } from "../data/slots";

export type VariantGridItem = {
  key: string;
  label: string;
  variant: ScheduleVariant;
  limit: string;
  grid: Occupancy;
};

/** Stable projection used by all auxiliary schedule windows. */
export function variantGridItems(
  store: MonthGridStore,
  variants: readonly ScheduleVariant[],
  limits: readonly string[],
): VariantGridItem[] {
  return variants.flatMap((variant) =>
    limits.flatMap((limit) => {
      const grid = store[monthGridKey(variant, limit)];
      if (!grid) return [];
      return [{
        key: monthGridKey(variant, limit),
        label: formatVariantLimit(variant, limit),
        variant,
        limit,
        grid,
      }];
    }),
  );
}

export function gridsByVariantLabel(items: readonly VariantGridItem[]) {
  return Object.fromEntries(items.map((item) => [item.label, item.grid]));
}

export function displayScheduleColumn(value: string) {
  return /^[NE][0-9]/.test(value) ? value : `${value.replace(".", ",")} €`;
}
