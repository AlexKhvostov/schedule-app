import { describe, expect, it } from "vitest";
import { applyGridEdits, gridEdits } from "./gridEdits";
import { ME } from "./marks";
import { emptyMonth, patchSeat } from "./plan";

describe("schedule cell edits", () => {
  it("preserves unrelated realtime changes when applying an old gesture", () => {
    const before = emptyMonth(2026, 9);
    const gesture = patchSeat(before, 20, 2, 0, { ...ME, memberId: "self" });
    const remote = patchSeat(before, 21, 3, 0, { ...ME, t: "BB", memberId: "other" });
    const next = applyGridEdits(remote, gridEdits(before, gesture));
    expect(next[20][2][0]?.memberId).toBe("self");
    expect(next[21][3][0]?.memberId).toBe("other");
    expect(remote[20][2][0]).toBeNull();
  });
});
