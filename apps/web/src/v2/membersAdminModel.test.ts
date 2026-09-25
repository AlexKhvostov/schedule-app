import { describe, expect, it } from "vitest";
import type { AdminPerson } from "../data/people";
import { filterAndSortPeople, peopleCounts, sameDraft, visibleProfiles } from "./membersAdminModel";

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

  it("normalizes surrounding whitespace when comparing drafts", () => {
    expect(sameDraft({ access: "member", distanceId: " 42 " }, { access: "member", distanceId: "42" })).toBe(true);
    expect(sameDraft({ access: "admin", distanceId: "42" }, { access: "member", distanceId: "42" })).toBe(false);
  });
});
