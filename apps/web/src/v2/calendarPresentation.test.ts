import { describe, expect, it } from "vitest";
import { calendarHasBothKinds, calendarKindLetter, calendarLegendGroups } from "./calendarPresentation";

describe("calendar presentation shared with JPEG", () => {
  it("omits shift letters for empty months and for either single kind", () => {
    expect(calendarHasBothKinds([])).toBe(false);
    expect(calendarHasBothKinds([{ variant: "nitro" }, { variant: "nitro" }])).toBe(false);
    expect(calendarHasBothKinds([{ variant: "regular" }])).toBe(false);
    expect(calendarHasBothKinds([{ variant: "regular" }, { variant: "nitro" }])).toBe(true);
    expect([calendarKindLetter("nitro"), calendarKindLetter("regular")]).toEqual(["N", "E"]);
  });

  it("groups and sorts the legend without reordering the source or adding absent kinds", () => {
    const columns = [
      { variant: "regular" as const, limit: "100" },
      { variant: "nitro" as const, limit: "250" },
      { variant: "regular" as const, limit: "50" },
      { variant: "nitro" as const, limit: "50" },
    ];
    const before = [...columns];
    expect(calendarLegendGroups(columns)).toEqual([
      { variant: "nitro", items: [columns[3], columns[1]] },
      { variant: "regular", items: [columns[2], columns[0]] },
    ]);
    expect(columns).toEqual(before);
    expect(calendarLegendGroups([])).toEqual([]);
    expect(calendarLegendGroups([columns[0]])).toEqual([{ variant: "regular", items: [columns[0]] }]);
  });
});
