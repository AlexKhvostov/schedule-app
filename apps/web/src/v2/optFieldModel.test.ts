import { describe, expect, it } from "vitest";
import { displayNick, markQuery, nowHeadLeft, packOwner, slotSpan, tablesLabel } from "./optFieldModel";

describe("opt field presentation model", () => {
  it("formats wrapped half-hour spans", () => {
    expect(slotSpan(47)).toBe("23:30 – 00:00");
    expect(slotSpan(0, 3)).toBe("03:00 – 03:30");
  });

  it("normalizes search and hides internal club codes", () => {
    expect(markQuery(" ab-12_zz ")).toBe("AB12ZZ");
    expect(displayNick("RP-12aBcD")).toBe("—");
  });

  it("keeps owner identity formatting in one place", () => {
    const owner = packOwner({ t: "AX", discord: "RP-123ABC", guildNick: "Alex", username: "alex", room: "PokerNick", bg: "#000", fg: "#fff", tables: 1 });
    expect(owner).toMatchObject({ discord: "Alex", username: "", room: "PokerNick" });
  });

  it("formats table counts and clamps timeline progress", () => {
    expect(tablesLabel(1, "ru")).toBe("1 стол");
    expect(tablesLabel(3, "ru")).toBe("3 стола");
    expect(tablesLabel(11, "ru")).toBe("11 столов");
    expect(nowHeadLeft(48, 2)).toContain("/ 48");
  });
});
