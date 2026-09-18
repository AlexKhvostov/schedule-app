import { loadMembers, saveMembers, type ClubMember } from "../schedule/members";

const KEY = "v2-invites";

export type Invite = {
  token: string;
  memberId: string;
  email: string;
  discord: string;
};

function token() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export function loadInvites(): Invite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: Invite[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function findInvite(raw: string | null): Invite | null {
  const value = raw?.trim();
  if (!value) return null;
  return loadInvites().find((row) => row.token === value) ?? null;
}

export function magicUrl(inviteToken: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", inviteToken);
  return url.toString();
}

export function createInvite(input: { email: string; discord: string }): { invite: Invite; member: ClubMember; url: string } {
  const email = input.email.trim().toLowerCase();
  const discord = input.discord.trim();
  const members = loadMembers();
  const id = `RP-${String(Date.now()).slice(-5)}`;
  const member: ClubMember = {
    id,
    name: "",
    discord,
    discordId: "",
    room: "",
    email,
    limits: ["50"],
    status: "pending",
    appAccess: false,
    vip: 0,
    distance: 0,
    mark: { colorId: -1, fg: "#111827", t: "", bg: "#6b7280" },
  };
  saveMembers([member, ...members]);
  const invite: Invite = { token: token(), memberId: id, email, discord };
  persist([invite, ...loadInvites()]);
  return { invite, member, url: magicUrl(invite.token) };
}

export function inviteForMember(member: ClubMember): { invite: Invite; url: string } {
  const invite: Invite = {
    token: token(),
    memberId: member.id,
    email: member.email,
    discord: member.discord,
  };
  persist([invite, ...loadInvites().filter((row) => row.memberId !== member.id)]);
  return { invite, url: magicUrl(invite.token) };
}
