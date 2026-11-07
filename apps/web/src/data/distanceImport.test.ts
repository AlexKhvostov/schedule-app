import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mock.rpc }) }));
vi.mock("./priorityUpdates", () => ({ notifyPriorityDistanceChanged: mock.notify }));
import { distanceImportWillWrite, saveDistanceDump, saveHistoricalDistanceDump, type ExistingDistanceState } from "./distanceDump";

beforeEach(() => { mock.rpc.mockReset().mockResolvedValue({ data: { inserted: 1, skipped: 0, unknown: 0 }, error: null }); mock.notify.mockReset(); });
const row = { distance_ext_id: "42", variant_id: "regular" as const, limit_id: "10", hands: 9, game_nick: "Player" };
const state = (manual: boolean, value?: number): ExistingDistanceState => ({
  values: new Map(value === undefined ? [] : [["42|regular|10", value]]), manualEntries: new Set(manual ? ["42|regular"] : []),
});
describe("distance import policy", () => {
  it("protects a manually cleared entry and missing limits by default", () => {
    expect(distanceImportWillWrite(row, state(true), false)).toBe(false);
    expect(distanceImportWillWrite(row, state(true), true)).toBe(true);
  });
  it("only counts changed explicit values when overwriting manual edits", () => {
    expect(distanceImportWillWrite(row, state(true, 9), true)).toBe(false);
    expect(distanceImportWillWrite({ ...row, hands: 0 }, state(true, 9), true)).toBe(true);
    expect(distanceImportWillWrite({ ...row, hands: 0 }, state(true), true)).toBe(false);
  });
  it("keeps duplicate import values unchanged and ignores new zero-only cells", () => {
    expect(distanceImportWillWrite(row, state(false, 4), true)).toBe(false);
    expect(distanceImportWillWrite(row, state(false), false)).toBe(true);
    expect(distanceImportWillWrite({ ...row, hands: 0 }, state(false), true)).toBe(false);
  });
  it.each([undefined, false, true])("sends the explicit monthly policy %s", async overwriteManual => {
    await saveDistanceDump({ roomSlug: "winamax", monthStart: "2026-10-01", entryKind: "primary", part: 1, batchLabel: "fixture", note: "", rows: [row], overwriteManual });
    expect(mock.rpc).toHaveBeenCalledWith("save_distance_dump", expect.objectContaining({ p_overwrite_manual: overwriteManual ?? false, p_rows: [row] }));
  });
  it.each([undefined, false, true])("sends the explicit historical policy %s", async overwriteManual => {
    await saveHistoricalDistanceDump({ roomSlug: "winamax", variantId: "regular", rows: [], overwriteManual });
    expect(mock.rpc).toHaveBeenCalledWith("save_historical_distance_dump", expect.objectContaining({ p_overwrite_manual: overwriteManual ?? false }));
  });
});
