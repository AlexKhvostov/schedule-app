import { discordPrimary, hasRoot, peopleRank, personTitle, type AdminPerson } from "../data/people";
import type { MemberRoomNick } from "../data/plays";
import type { ClubMember } from "../schedule/members";
import { asVip } from "../schedule/marks";

export type StatusFilter = "all" | "active" | "blocked" | "left" | "root" | "bot";
export type SortKey = "access" | "nick" | "mark" | "roles" | "distanceId" | "vipNitro" | "vipRegular";
export type SortDirection = "asc" | "desc";

export function roomNickLines(memberId: string | null, map: Map<string, MemberRoomNick[]>) {
  const have = memberId ? map.get(memberId) ?? [] : [];
  if (!have.some((row) => row.roomId === "winamax")) return [{ roomId: "winamax", nick: "" }, ...have];
  return [...have].sort((a, b) => Number(b.roomId === "winamax") - Number(a.roomId === "winamax"));
}

export function asMarkMember(row: AdminPerson): ClubMember {
  return {
    id: row.memberId ?? row.discordId,
    name: row.displayName ?? "",
    discord: personTitle(row),
    discordId: row.discordId,
    room: row.username,
    email: row.email ?? "",
    limits: [],
    status: row.accessStatus === "active" ? "active" : "pending",
    appAccess: row.accessStatus === "active",
    isAdmin: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 0,
    mark: { colorId: -1, t: row.markTag ?? "", bg: row.markBg, fg: row.markFg },
  };
}

export function visibleProfiles(list: AdminPerson[], statusFilter: StatusFilter, showBots: boolean) {
  const profiles = list.filter((row) => Boolean(row.memberId));
  if (statusFilter === "bot" || showBots) return profiles;
  return profiles.filter((row) => !row.bot);
}

export function peopleCounts(list: AdminPerson[]) {
  const profiles = list.filter((row) => Boolean(row.memberId));
  const humans = profiles.filter((row) => !row.bot);
  return {
    all: profiles.length,
    active: humans.filter((row) => row.accessStatus === "active").length,
    blocked: humans.filter((row) => row.accessStatus === "blocked").length,
    root: humans.filter((row) => hasRoot(row)).length,
    bot: profiles.filter((row) => row.bot).length,
    left: humans.filter((row) => !row.onGuild).length,
  };
}

export function filterAndSortPeople(
  people: AdminPerson[],
  query: string,
  statusFilter: StatusFilter,
  sort: SortKey,
  roleIds: ReadonlySet<string>,
  direction: SortDirection = "asc",
) {
  const q = query.trim().toLowerCase();
  const copy = people.filter((row) => {
    if (statusFilter === "bot" && !row.bot) return false;
    if (row.bot && statusFilter !== "all" && statusFilter !== "bot") return false;
    if (statusFilter === "active" && row.accessStatus !== "active") return false;
    if (statusFilter === "blocked" && row.accessStatus !== "blocked") return false;
    if (statusFilter === "left" && !(row.memberId && !row.onGuild)) return false;
    if (statusFilter === "root" && !hasRoot(row)) return false;
    if (roleIds.size && !row.discordRoles.some((role) => roleIds.has(role.id))) return false;
    if (!q) return true;
    return [
      discordPrimary(row),
      row.username,
      row.globalName,
      row.nick,
      row.discordId,
      row.publicCode,
      row.displayName,
      row.distanceExtId,
      ...(row.distanceIds ?? []),
      ...row.discordRoles.map((role) => role.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const sign = direction === "asc" ? 1 : -1;
  const compareText = (a: string, b: string) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });
  // Missing values stay at the bottom even when the direction changes.
  const compareOptionalText = (a: string, b: string) => Number(!a) - Number(!b) || sign * compareText(a, b);
  copy.sort((a, b) => {
    const byNick = compareText(discordPrimary(a), discordPrimary(b));
    if (sort === "vipNitro" || sort === "vipRegular") {
      const av = asVip(a[sort]);
      const bv = asVip(b[sort]);
      return Number(!av) - Number(!bv) || sign * (av - bv) || byNick;
    }
    if (sort === "mark") return compareOptionalText(a.markTag?.trim() ?? "", b.markTag?.trim() ?? "") || byNick;
    if (sort === "roles") return compareOptionalText(a.accessDiscordRoles.map((role) => role.name).join(" "), b.accessDiscordRoles.map((role) => role.name).join(" ")) || byNick;
    if (sort === "distanceId") return compareOptionalText(a.distanceExtId?.trim() ?? "", b.distanceExtId?.trim() ?? "") || byNick;
    if (sort === "nick") return sign * byNick;
    return sign * (peopleRank(a) - peopleRank(b)) || byNick;
  });
  return copy;
}
