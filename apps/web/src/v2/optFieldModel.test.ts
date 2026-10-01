import { describe, expect, it } from "vitest";
import { displayNick, hiddenSelfHalves, markQuery, markWithPlayerIdentity, nowHeadLeft, packOwner, playerForMark, scheduleKindGroups, slotHoursValue, slotRangeSpan, slotSpan, tablesLabel } from "./optFieldModel";

describe("opt field presentation model", () => {
  it("formats wrapped half-hour spans", () => {
    expect(slotSpan(47)).toBe("23:30 – 00:00");
    expect(slotSpan(0, 3)).toBe("03:00 – 03:30");
    expect(slotRangeSpan(1, 6)).toBe("00:30 – 03:30");
    expect(slotRangeSpan(6, 1)).toBe("00:30 – 03:30");
    expect(slotHoursValue(4, 11, "ru")).toBe("3,5");
    expect(slotHoursValue(4, 11, "en")).toBe("3.5");
  });

  it("normalizes search and hides internal club codes", () => {
    expect(markQuery(" ab-12_zz ")).toBe("AB12ZZ");
    expect(displayNick("RP-12aBcD")).toBe("—");
  });

  it("keeps owner identity formatting in one place", () => {
    const owner = packOwner({ t: "AX", discord: "fallback", guildNick: "Server Alex", username: "alex", room: "PokerNick", bg: "#000", fg: "#fff", tables: 1 });
    expect(owner).toMatchObject({ discord: "Server Alex", username: "alex", room: "PokerNick" });
  });

  it("enriches an old slot snapshot from the current player directory", () => {
    const enriched = markWithPlayerIdentity(
      { t: "AX", discord: "old", room: "OldRoom", bg: "#000", fg: "#fff", tables: 6, memberId: "member-1" },
      [{
        id: "member-1",
        nick: "Server Alex",
        publicCode: "RP-1",
        roomNick: "PokerAlex",
        markTag: "AX",
        markBg: "#123456",
        markFg: "#ffffff",
        tables: 8,
        avatarUrl: "https://cdn.example/avatar.png",
        username: "alex",
        globalName: "Alex",
        guildNick: "Server Alex",
      }],
    );

    expect(enriched).toMatchObject({
      discord: "Server Alex",
      room: "PokerAlex",
      avatarUrl: "https://cdn.example/avatar.png",
      guildNick: "Server Alex",
      tables: 6,
      bg: "#000",
    });
  });

  it("does not guess a player when an old two-letter mark is ambiguous", () => {
    const mark = { t: "AX", discord: "", room: "", bg: "#000", fg: "#fff", tables: 6 };
    const players = ["member-1", "member-2"].map((id) => ({
      id,
      nick: id,
      publicCode: id,
      roomNick: id,
      markTag: "AX",
      markBg: "#123456",
      markFg: "#ffffff",
      tables: 8,
      avatarUrl: `https://cdn.example/${id}.png`,
    }));

    expect(markWithPlayerIdentity(mark, players)).toBe(mark);
  });

  it("finds the profile behind a slot and detects own marks hidden by working hours", () => {
    const self = { t: "AX", discord: "alex", room: "PokerAlex", bg: "#123456", fg: "#fff", tables: 6, memberId: "member-1" };
    const player = {
      id: "member-1", nick: "Server Alex", publicCode: "RP-1", roomNick: "PokerAlex", markTag: "AX",
      markBg: "#123456", markFg: "#fff", tables: 6, profileName: "Алексей",
    };
    expect(playerForMark(self, [player])).toBe(player);
    const grids = { "nitro:50": [[[], [self], [], [self]]] };
    expect([...hiddenSelfHalves(grids, 0, [0, 1], self)]).toEqual([3]);
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
          { key: "nitro:50", limit: "50", label: "N50", disabled: false },
          { key: "nitro:100", limit: "100", label: "N100", disabled: false },
        ],
      },
      {
        variant: "regular",
        shortLabel: "E",
        rows: [
          { key: "regular:50", limit: "50", label: "E50", disabled: false },
          { key: "regular:100", limit: "100", label: "E100", disabled: false },
        ],
      },
    ]);
  });
});
