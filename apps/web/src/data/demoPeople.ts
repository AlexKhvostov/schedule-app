import { loadMembers } from "../schedule/members";
import { PRIORITY_DEFAULT_ROLE_ID } from "../schedule/priorities";
import { demoClubOrder } from "./clubOrder";
import { emptyLogins, type AdminPerson } from "./people";

export function demoAdminMember(memberId: string | null) {
  return loadMembers().find(member => member.id === memberId);
}

/** Synthetic cards for the admin preview; never read or write live profiles. */
export function demoAdminPeople(): AdminPerson[] {
  const order = new Map(demoClubOrder().rows.map(row => [row.memberId, row.number]));
  return loadMembers().map(member => ({
    memberId: member.id, discordId: member.discordId, username: member.discord,
    globalName: member.discordDisplay ?? member.discord, nick: member.discordGuildNick ?? null,
    avatarUrl: member.avatar ?? null, bot: false, joinedAt: null, onGuild: true,
    publicCode: member.id, access: member.appAccess ? "member" : "closed",
    accessStatus: member.appAccess ? "active" : "blocked", blockReason: null,
    loggedIn: false, clubRoles: [], communityStatus: member.community ?? null,
    guarantorId: null, createdAt: null, approvedAt: null, gridPriority: null,
    clubOrder: order.get(member.id) ?? null, distanceExtId: null,
    discordRoles: [...new Set([...(member.discordRoles ?? []), ...(order.has(member.id) ? [PRIORITY_DEFAULT_ROLE_ID] : [])])].map(id => ({ id, name: id === PRIORITY_DEFAULT_ROLE_ID ? "RedParty" : id, color: null })),
    accessDiscordRoles: [], markTag: member.mark.t, markBg: member.mark.bg || "#76a5af", markFg: member.mark.fg || "#ffffff",
    tables: member.tables ?? 12, vipNitro: member.vipNitro, vipRegular: member.vipRegular,
    coreNitro250: member.coreNitro250, coreRegular250: member.coreRegular250,
    displayName: member.name, email: member.email || null, phone: member.phone ?? null,
    city: member.city ?? null, country: member.country ?? null, birthday: member.birthday ?? null,
    showExtraTz: member.showExtraTz ?? false, extraUtc: member.extraUtc ?? null,
    telegram: member.telegram ?? null, contactAlt: member.contactAlt ?? null,
    notifyChannel: "discord", logins: emptyLogins(),
  }));
}
