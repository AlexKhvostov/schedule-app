import { expect, it } from "vitest";
import { includesPlayer, restoreRegSides } from "./playerNames";
it("matches legacy case-insensitive nick filters without broadening to other names", () => {
  expect(includesPlayer(["synthetic ONE"], "Synthetic One")).toBe(true);
  expect(includesPlayer(["Synthetic One"], "Synthetic Two")).toBe(false);
});
it("restores a missing side from the registry without changing names or numbers", () => {
  const report = { rows: [{ player_name: "SyntheticOne", reg_side: null, max_speed: 42 }, { player_name: "SyntheticTwo", reg_side: null }] };
  expect(restoreRegSides(report, { regs: [{ player_name: "syntheticone", side: "ours" }] })).toEqual({ rows: [{ player_name: "SyntheticOne", reg_side: "ours", max_speed: 42 }, { player_name: "SyntheticTwo", reg_side: null }] });
  expect(report.rows[0].reg_side).toBeNull();
});
it("rejects conflicting registry aliases and malformed registry instead of guessing", () => {
  const report = { rows: [{ player_name: "Synthetic", reg_side: null }] };
  expect(() => restoreRegSides(report, { regs: [{ player_name: "Synthetic", side: "ours" }, { player_name: "synthetic", side: "theirs" }] })).toThrow("ambiguous-registry");
  expect(() => restoreRegSides(report, {})).toThrow("invalid-registry");
});
