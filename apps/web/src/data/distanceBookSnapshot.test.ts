import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), settings: vi.fn() }));
vi.mock("./config", () => ({ isLiveData: () => true }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc: mock.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.settings }) }) }),
}) }));
import { loadDistanceBook, filterDistancePeople, distanceBookCsv } from "./distanceBook";

const entry = { id: "history", member_id: null, distance_ext_id: "123", discord_id: "111111111111111111", game_nick: "HistoryPlayer", variant_id: "nitro", part: 1,
  source: "historical", created_at: "2026-10-01", updated_at: "2026-10-01", values: [{ limit_id: "50", tournaments: 120 }],
  present: true, roles: [{ id: "role-rp" }], has_active_profile: false };
afterEach(() => { vi.resetAllMocks(); });
function setup(entries: Array<typeof entry & { avatar_url?: string; discord_nick?: string }> = [entry]) {
  mock.rpc.mockResolvedValue({ data: { people_filters_version: 1, people: [], entries, limits: ["50"] } });
  mock.settings.mockResolvedValue({ data: { required_discord_role_id: "role-rp" } });
}
describe("current people metadata in distance snapshots", () => {
  it("reads the role of historical rows without an active playing card", async () => {
    setup();
    const book = await loadDistanceBook("2026-10-01");
    expect(book.error).toBeNull();
    expect(book.people[0]).toMatchObject({ orphan: true, redParty: true, hasActiveProfile: false, total: 120 });
  });
  it("keeps current Discord names and avatars on historical rows without a card", async () => {
    setup([{ ...entry, avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png", discord_nick: "CurrentGuildNick" }]);
    const book = await loadDistanceBook("2026-10-01");
    expect(book.people[0]).toMatchObject({ avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png", nick: "CurrentGuildNick", gameNick: "HistoryPlayer" });
  });
  it("does not treat saved roles of someone who left Discord as current membership", async () => {
    setup([{ ...entry, present: false, has_active_profile: true }]);
    const book = await loadDistanceBook("2026-10-01");
    expect(book.people[0]).toMatchObject({ redParty: false, hasActiveProfile: true });
  });
  it("groups unlinked history with a current playing profile without duplicating the person", async () => {
    setup();
    mock.rpc.mockResolvedValue({ data: { people_filters_version: 1, people: [{ member_id: "current-profile", distance_ext_id: "123", discord_id: entry.discord_id,
      discord_nick: "CurrentPlayer", present: true, roles: entry.roles, has_active_profile: true }],
      entries: [{ ...entry, profile_member_id: "current-profile", has_active_profile: true }], limits: ["50"] } });
    const book = await loadDistanceBook("2026-10-01");
    expect(book.people).toHaveLength(1);
    expect(book.people[0]).toMatchObject({ memberId: "current-profile", hasActiveProfile: true, total: 120 });
  });
  it("groups multiple IDs once and exports each record with its own ID and source nickname", async () => {
    setup();
    mock.rpc.mockResolvedValue({ data: { people_filters_version: 1,
      people: [{ member_id: "current", distance_ext_id: "123", distance_ids: ["123", "456"],
        discord_nick: "CurrentPlayer", present: true, roles: entry.roles, has_active_profile: true }],
      entries: [{ ...entry, member_id: "current" }, { ...entry, id: "second", member_id: "current",
        distance_ext_id: "456", game_nick: "SecondNick" }], limits: ["50"] } });
    const book = await loadDistanceBook("2026-10-01");
    expect(book.people).toHaveLength(1);
    expect(book.people[0].total).toBe(240);
    expect(filterDistancePeople(book.people, { variants: ["nitro"], query: "456", onlyRedParty: true,
      onlyActiveProfiles: true, id: "all", presence: "all" })).toHaveLength(1);
    const csv = distanceBookCsv({ monthStart: "2026-10-01", roomTitle: "Winamax", people: book.people,
      limits: ["50"], variants: ["nitro"], labels: { month: "", room: "", distanceId: "", discordId: "",
        discordNick: "", gameNick: "", variant: "", part: "", comment: "", created: "", updated: "", total: "" } });
    expect(csv).toContain('123');
    expect(csv).toContain('456');
    expect(csv).toContain("SecondNick");
    expect(csv).toContain("HistoryPlayer");
  });
  it("fails explicitly when the current-role contract or settings cannot be loaded", async () => {
    setup(); mock.rpc.mockResolvedValue({ data: { entries: [entry] } });
    expect((await loadDistanceBook("2026-10-01")).error).toBe("distance-filter-metadata-unavailable");
    setup(); mock.settings.mockResolvedValue({ data: null, error: { message: "network" } });
    expect((await loadDistanceBook("2026-10-01")).error).toBe("network");
  });
  it("keeps multiple IDs of an inactive card together without enabling manual creation", async () => {
    setup();
    mock.rpc.mockResolvedValue({ data: { people_filters_version: 1, people: [], limits: ["50"],
      entries: [{ ...entry, member_id: "inactive-card" }, { ...entry, id: "second",
        member_id: "inactive-card", distance_ext_id: "456" }] } });
    const book = await loadDistanceBook("2026-10-01");
    expect(book.people).toHaveLength(1);
    expect(book.people[0]).toMatchObject({ memberId: null, distanceIds: ["123", "456"], total: 240 });
    expect(filterDistancePeople(book.people, { variants: ["nitro"], query: "456", onlyRedParty: false,
      onlyActiveProfiles: true, id: "all", presence: "all" })).toHaveLength(0);
  });
});
