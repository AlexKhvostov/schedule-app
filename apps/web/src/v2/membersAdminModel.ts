import { discordPrimary, hasRoot, peopleRank, personTitle, type AdminPerson, type ClubAccess } from "../data/people";
import type { MemberRoomNick } from "../data/plays";
import { hueOfBg, type ClubMember } from "../schedule/members";

export type StatusFilter = "all" | "active" | "blocked" | "left" | "root" | "bot";
export type SortKey = "access" | "nick" | "joined" | "color";

export type RowDraft = {
  access: ClubAccess;
  distanceId: string;
};

export function discordLine(row: AdminPerson) {
  const extra =
    row.globalName && row.globalName !== discordPrimary(row) && row.globalName !== row.username
      ? ` · ${row.globalName}`
      : "";
  return `@${row.username}${extra}`;
}

export function savedDraft(row: AdminPerson): RowDraft {
  return {
    access: row.access,
    distanceId: row.distanceExtId ?? "",
  };
}

export function sameDraft(a: RowDraft, b: RowDraft) {
  return a.access === b.access && a.distanceId.trim() === b.distanceId.trim();
}

function markHue(row: AdminPerson) {
  if (!row.markTag) return 1000;
  return hueOfBg(row.markBg);
}

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
      ...row.discordRoles.map((role) => role.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  copy.sort((a, b) => {
    if (sort === "joined") return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
    if (sort === "nick") return discordPrimary(a).localeCompare(discordPrimary(b), "ru");
    if (sort === "color") return markHue(a) - markHue(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
    return peopleRank(a) - peopleRank(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
  });
  return copy;
}
