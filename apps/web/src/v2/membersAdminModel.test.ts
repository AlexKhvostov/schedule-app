import { describe, expect, it } from "vitest";
import type { AdminPerson } from "../data/people";
import { filterAndSortPeople, peopleCounts, visibleProfiles } from "./membersAdminModel";

function person(part: Partial<AdminPerson> & Pick<AdminPerson, "discordId" | "username">): AdminPerson {
  const { discordId, username, ...override } = part;
  return {
    discordId,
    username,
    globalName: null,
    nick: null,
    avatarUrl: null,
    bot: false,
    joinedAt: null,
    discordRoles: [],
    accessDiscordRoles: [],
    onGuild: true,
    memberId: `member-${part.discordId}`,
    publicCode: null,
    access: "member",
    accessStatus: "active",
    blockReason: null,
    loggedIn: false,
    clubRoles: [],
    communityStatus: null,
    guarantorId: null,
    createdAt: null,
    approvedAt: null,
    gridPriority: null,
    distanceExtId: null,
    markTag: null,
    markBg: "#777777",
    markFg: "#ffffff",
    tables: null,
    vipNitro: null,
    vipRegular: null,
    displayName: null,
    email: null,
    phone: null,
    city: null,
    country: null,
    birthday: null,
    showExtraTz: null,
    extraUtc: null,
    telegram: null,
    contactAlt: null,
    notifyChannel: "discord",
    logins: { discord: false, google: false, email: false, googleHint: null },
    ...override,
  };
}

describe("members admin model", () => {
  const active = person({ discordId: "1", username: "alpha", discordRoles: [{ id: "dealers", name: "Dealers", color: null }] });
  const blocked = person({ discordId: "2", username: "bravo", accessStatus: "blocked", onGuild: false });
  const bot = person({ discordId: "3", username: "helper", bot: true });

  it("counts profile states and hides bots by default", () => {
    const list = [active, blocked, bot];
    expect(peopleCounts(list)).toEqual({ all: 3, active: 1, blocked: 1, root: 0, bot: 1, left: 1 });
    expect(visibleProfiles(list, "all", false).map((row) => row.discordId)).toEqual(["1", "2"]);
    expect(visibleProfiles(list, "bot", false)).toHaveLength(3);
  });

  it("combines role, status, and text filters without mutating the source", () => {
    const list = [blocked, active];
    const result = filterAndSortPeople(list, "deal", "active", "nick", new Set(["dealers"]));
    expect(result.map((row) => row.discordId)).toEqual(["1"]);
    expect(list.map((row) => row.discordId)).toEqual(["2", "1"]);
  });

  it("sorts each VIP kind independently from rank 1 and keeps missing ranks last", () => {
    const list = [
      person({ discordId: "empty", username: "alpha", vipNitro: null, vipRegular: 0 }),
      person({ discordId: "regular", username: "bravo", vipNitro: 12, vipRegular: 1 }),
      person({ discordId: "nitro", username: "charlie", vipNitro: 1, vipRegular: null }),
      person({ discordId: "second", username: "delta", vipNitro: 2, vipRegular: 2 }),
    ];
    expect(filterAndSortPeople(list, "", "all", "vipNitro", new Set()).map((row) => row.discordId))
      .toEqual(["nitro", "second", "regular", "empty"]);
    expect(filterAndSortPeople(list, "", "all", "vipRegular", new Set()).map((row) => row.discordId))
      .toEqual(["regular", "second", "empty", "nitro"]);
    expect(list.map((row) => row.discordId)).toEqual(["empty", "regular", "nitro", "second"]);
  });

  it("keeps role/status/search filters when sorting VIP ranks and orders ties by nick", () => {
    const rows = [
      person({ discordId: "b", username: "bravo", vipNitro: 3, discordRoles: active.discordRoles }),
      person({ discordId: "a", username: "alpha", vipNitro: 3, discordRoles: active.discordRoles }),
      person({ discordId: "blocked", username: "blocked", vipNitro: 1, accessStatus: "blocked", discordRoles: active.discordRoles }),
      person({ discordId: "no-role", username: "zero", vipNitro: 2 }),
    ];
    expect(filterAndSortPeople(rows, "deal", "active", "vipNitro", new Set(["dealers"])).map((row) => row.discordId))
      .toEqual(["a", "b"]);
  });

  it("reverses VIP ranks while keeping zero/null values last and preserving filters", () => {
    const rows = [
      person({ discordId: "none", username: "alpha", vipNitro: 0, vipRegular: null, discordRoles: active.discordRoles }),
      person({ discordId: "first", username: "bravo", vipNitro: 1, vipRegular: 12, discordRoles: active.discordRoles }),
      person({ discordId: "last", username: "charlie", vipNitro: 12, vipRegular: 1, discordRoles: active.discordRoles }),
      person({ discordId: "filtered", username: "delta", vipNitro: 999, vipRegular: 999, accessStatus: "blocked", discordRoles: active.discordRoles }),
    ];
    expect(filterAndSortPeople(rows, "deal", "active", "vipNitro", new Set(["dealers"]), "desc").map((row) => row.discordId))
      .toEqual(["last", "first", "none"]);
    expect(filterAndSortPeople(rows, "deal", "active", "vipRegular", new Set(["dealers"]), "desc").map((row) => row.discordId))
      .toEqual(["first", "last", "none"]);
  });

  it("sorts distance IDs numerically, including long IDs, and leaves blanks last in both directions", () => {
    const rows = [
      person({ discordId: "none", username: "alpha", distanceExtId: " " }),
      person({ discordId: "ten", username: "bravo", distanceExtId: "10" }),
      person({ discordId: "two", username: "charlie", distanceExtId: "2" }),
      person({ discordId: "long", username: "delta", distanceExtId: "999999999999" }),
    ];
    expect(filterAndSortPeople(rows, "", "all", "distanceId", new Set()).map((row) => row.discordId))
      .toEqual(["two", "ten", "long", "none"]);
    expect(filterAndSortPeople(rows, "", "all", "distanceId", new Set(), "desc").map((row) => row.discordId))
      .toEqual(["long", "ten", "two", "none"]);
  });

  it("sorts marks by their letters and roles by visible access roles rather than unrelated Discord roles", () => {
    const rows = [
      person({ discordId: "none", username: "alpha" }),
      person({ discordId: "z", username: "bravo", markTag: "Z", markBg: "#ff0000", accessDiscordRoles: [{ id: "z", name: "Zebra", color: null }], discordRoles: [{ id: "a", name: "Alpha", color: null }] }),
      person({ discordId: "a", username: "charlie", markTag: "A", markBg: "#0000ff", accessDiscordRoles: [{ id: "a", name: "Alpha", color: null }], discordRoles: [{ id: "z", name: "Zebra", color: null }] }),
    ];
    for (const key of ["mark", "roles"] as const) {
      expect(filterAndSortPeople(rows, "", "all", key, new Set()).map((row) => row.discordId)).toEqual(["a", "z", "none"]);
      expect(filterAndSortPeople(rows, "", "all", key, new Set(), "desc").map((row) => row.discordId)).toEqual(["z", "a", "none"]);
    }
  });

  it("sorts public Discord names and status groups in both directions", () => {
    const rows = [
      person({ discordId: "blocked", username: "alpha", nick: "Alpha", globalName: "Zulu", accessStatus: "blocked" }),
      person({ discordId: "active", username: "zulu", nick: "Zulu", globalName: "Alpha" }),
      person({ discordId: "root", username: "middle", clubRoles: ["root"] }),
    ];
    expect(filterAndSortPeople(rows, "", "all", "nick", new Set()).map((row) => row.discordId)).toEqual(["active", "root", "blocked"]);
    expect(filterAndSortPeople(rows, "", "all", "nick", new Set(), "desc").map((row) => row.discordId)).toEqual(["blocked", "root", "active"]);
    expect(filterAndSortPeople(rows, "", "all", "access", new Set()).map((row) => row.discordId)).toEqual(["root", "active", "blocked"]);
    expect(filterAndSortPeople(rows, "", "all", "access", new Set(), "desc").map((row) => row.discordId)).toEqual(["blocked", "active", "root"]);
  });
});
