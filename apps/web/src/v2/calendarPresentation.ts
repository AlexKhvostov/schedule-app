import type { ScheduleVariant } from "../data/slots";

export const calendarKindLetter = (variant: ScheduleVariant) => variant === "nitro" ? "N" : "E";

/** Only the player's actual shifts determine whether a kind label is needed. */
export function calendarHasBothKinds(runs: readonly { variant: ScheduleVariant }[]) {
  return runs.some((run) => run.variant === "nitro") && runs.some((run) => run.variant === "regular");
}

export function calendarLegendGroups<T extends { variant: ScheduleVariant; limit: string }>(columns: readonly T[]) {
  return (["nitro", "regular"] as const).flatMap((variant) => {
    const items = columns.filter((column) => column.variant === variant)
      .sort((a, b) => Number(a.limit) - Number(b.limit));
    return items.length ? [{ variant, items }] : [];
  });
}
