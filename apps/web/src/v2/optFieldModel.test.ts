import { describe, expect, it } from "vitest";
import { displayNick, markQuery, nowHeadLeft, packOwner, scheduleKindGroups, slotRangeSpan, slotSpan, tablesLabel } from "./optFieldModel";

describe("opt field presentation model", () => {
  it("formats wrapped half-hour spans", () => {
    expect(slotSpan(47)).toBe("23:30 – 00:00");
    expect(slotSpan(0, 3)).toBe("03:00 – 03:30");
    expect(slotRangeSpan(1, 6)).toBe("00:30 – 03:30");
    expect(slotRangeSpan(6, 1)).toBe("00:30 – 03:30");
  });

  it("normalizes search and hides internal club codes", () => {
    expect(markQuery(" ab-12_zz ")).toBe("AB12ZZ");
    expect(displayNick("RP-12aBcD")).toBe("—");
  });

  it("keeps owner identity formatting in one place", () => {
    const owner = packOwner({ t: "AX", discord: "fallback", guildNick: "Server Alex", username: "alex", room: "PokerNick", bg: "#000", fg: "#fff", tables: 1 });
    expect(owner).toMatchObject({ discord: "Server Alex", username: "alex", room: "PokerNick" });
  });

  it("formats table counts and clamps timeline progress", () => {
    expect(tablesLabel(1, "ru")).toBe("1 стол");
    expect(tablesLabel(3, "ru")).toBe("3 стола");
    expect(tablesLabel(11, "ru")).toBe("11 столов");
    expect(nowHeadLeft(48, 2)).toContain("/ 48");
    expect(nowHeadLeft(36, 0.5, [0, 1, 2, 3, 36, 37])).toContain("var(--opt-work-gap-w)");
  });

  it("groups rows by variant before limit and keeps equal limits distinct", () => {
    expect(scheduleKindGroups(["nitro", "regular"], ["50", "100"])).toEqual([
      {
        variant: "nitro",
        shortLabel: "N",
        rows: [
          { key: "nitro:50", limit: "50", label: "N50" },
          { key: "nitro:100", limit: "100", label: "N100" },
        ],
      },
      {
        variant: "regular",
        shortLabel: "E",
        rows: [
          { key: "regular:50", limit: "50", label: "E50" },
          { key: "regular:100", limit: "100", label: "E100" },
        ],
      },
    ]);
  });
});
