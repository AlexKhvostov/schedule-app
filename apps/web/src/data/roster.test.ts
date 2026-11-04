import { describe, expect, it, vi } from "vitest";
import { createRosterLoader, type RosterQuery, type RosterResponse, type RosterRead } from "./roster";

const query: RosterQuery = { period: "2026-11-01", kind: "nitro", group: "50-100", limits: ["100", "50"] };
function response(q = query): RosterResponse {
  return { periodStart: q.period, kind: q.kind, group: q.group, today: "2026-11-04", lastMonthEntries: 20, revision: "p1",
    people: [{ memberId: "a", core: 0, score: 12, excluded: false }], directoryRevision: "d1",
    faces: [{ memberId: "a", discord: "Alpha", t: "AA", bg: "#000", fg: "#fff", room: "", tables: 1 }] };
}
describe("conditional monthly roster", () => {
  it("shares concurrent reads and reuses both unchanged arrays while updating status metadata", async () => {
    const read = vi.fn().mockResolvedValue(response());
    const loader = createRosterLoader(read);
    const [first, duplicate] = await Promise.all([loader.load(query), loader.load({ ...query, limits: ["50", "100", "50"] })]);
    expect(read).toHaveBeenCalledTimes(1); expect(duplicate).toBe(first);
    read.mockResolvedValue({ ...response(), today: "2026-11-08", people: null, faces: null });
    const next = await loader.load(query);
    expect(read.mock.calls[1][1]).toBe(first);
    expect(next.source.people).toBe(first.source.people); expect(next.faces).toBe(first.faces);
    expect(next.source.today).toBe("2026-11-08");
  });
  it("updates directory independently of points and accepts an empty membership", async () => {
    const read = vi.fn().mockResolvedValue(response()); const loader = createRosterLoader(read);
    const first = await loader.load(query);
    read.mockResolvedValue({ ...response(), people: null, directoryRevision: "d2", faces: [] });
    const next = await loader.load(query);
    expect(next.source.people).toBe(first.source.people); expect(next.faces).toEqual([]);
  });
  it("does not send revisions across period, kind, group, limits or a new account loader", async () => {
    const read = vi.fn<RosterRead>(async (q) => response(q)); const loader = createRosterLoader(read);
    await loader.load(query);
    for (const change of [{ period: "2026-08-01" }, { kind: "regular" as const }, { group: "250" as const }, { limits: ["50"] }]) await loader.load({ ...query, ...change });
    await createRosterLoader(read).load(query);
    expect(read.mock.calls.every((call) => call[1] === undefined)).toBe(true);
  });
  it("rejects a conditional response without its matching prior data and recovers from failure", async () => {
    const read = vi.fn().mockResolvedValue({ ...response(), people: null, faces: null }); const loader = createRosterLoader(read);
    await expect(loader.load(query)).rejects.toThrow("roster-response-mismatch");
    read.mockRejectedValueOnce(new Error("offline"));
    await expect(loader.load(query)).rejects.toThrow("offline");
    read.mockResolvedValue(response()); expect((await loader.load(query)).source.people).toHaveLength(1);
    read.mockResolvedValue({ ...response(), revision: "unexpected", people: null });
    await expect(loader.load(query)).rejects.toThrow("roster-response-mismatch");
  });
});
