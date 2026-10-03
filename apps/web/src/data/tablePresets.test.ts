import { describe, expect, it } from "vitest";
import { normalizeTablePresets, tablePresetsToDraft, validateTablePresetDraft } from "./tablePresets";

describe("table presets", () => {
  it("compacts empty positions and preserves order", () => {
    expect(validateTablePresetDraft(["10", "", "6", " 8 ", ""])).toEqual({ ok: true, values: [10, 6, 8] });
  });

  it("rejects an empty set, duplicates, non-integers and out-of-range values", () => {
    expect(validateTablePresetDraft(["", "", "", "", ""])).toEqual({ ok: false, error: "required" });
    expect(validateTablePresetDraft(["8", "8"])).toEqual({ ok: false, error: "duplicate" });
    expect(validateTablePresetDraft(["2.5"])).toEqual({ ok: false, error: "integer" });
    expect(validateTablePresetDraft(["0"])).toEqual({ ok: false, error: "range" });
    expect(validateTablePresetDraft(["31"])).toEqual({ ok: false, error: "range" });
  });

  it("normalizes stored values and falls back safely", () => {
    expect(normalizeTablePresets([8, 8, 0, 6, 31, 10, 12, 14, 16, 18], 4)).toEqual([8, 6, 10, 12, 14]);
    expect(normalizeTablePresets([], 35)).toEqual([30]);
    expect(tablePresetsToDraft([10, 6])).toEqual(["10", "6", "", "", ""]);
  });
});
