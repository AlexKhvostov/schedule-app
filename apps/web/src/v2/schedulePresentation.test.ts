import { describe, expect, it } from "vitest";
import { ME } from "../schedule/marks";
import { emptyMonth } from "../schedule/plan";
import { heatFill, rowInitials, seatDiffs, showNick } from "./schedulePresentation";

describe("schedule presentation helpers", () => {
  it("does not expose internal club codes as nicknames", () => {
    expect(showNick("RP-12abEF")).toBe("");
    expect(showNick(" player ")).toBe("player");
  });

  it("creates stable initials", () => {
    expect(rowInitials("John Doe", "JD")).toBe("JD");
    expect(rowInitials("Player", "PX")).toBe("PX");
    expect(rowInitials("", "")).toBe("?");
  });

  it("clamps heat intensity", () => {
    expect(heatFill(0, 10, "day")).toBeUndefined();
    expect(heatFill(20, 10, "cell")?.background).toContain("70%");
  });

  it("describes placed and removed seats without mutating either grid", () => {
    const empty = emptyMonth(2026, 0);
    const marked = emptyMonth(2026, 0);
    marked[0][0] = [{ ...ME, t: "YO", tables: 2 }];
    const emptyBefore = JSON.stringify(empty);
    const markedBefore = JSON.stringify(marked);

    expect(seatDiffs(empty, marked)).toMatchObject([
      { day: 1, half: 0, level: 0, placed: true, tables: 2, undone: null },
    ]);
    expect(seatDiffs(marked, empty)).toMatchObject([
      { day: 1, half: 0, level: 0, placed: false, tables: 2, undone: { t: "YO" } },
    ]);
    expect(JSON.stringify(empty)).toBe(emptyBefore);
    expect(JSON.stringify(marked)).toBe(markedBefore);
  });
});
