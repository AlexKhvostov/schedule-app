import { loadMembers } from "../schedule/members";

const SESSION_KEY = "v2-session";

export type Access = "active" | "pending" | "profile";
export type AuthVia = "discord" | "google" | "email" | "magic";
export type AppRole = "root" | "admin" | "member";

export type Session = {
  nick: string;
  access: Access;
  via: AuthVia;
  role: AppRole;
  memberId?: string;
  markTag?: string | null;
  markBg?: string;
  markFg?: string;
};

export function roleFor(nick: string, memberId?: string): AppRole {
  if (nick === "you") return "root";
  const list = loadMembers();
  const row = memberId
    ? list.find((item) => item.id === memberId)
    : list.find((item) => item.discord.toLowerCase() === nick.toLowerCase());
  return row?.isAdmin ? "admin" : "member";
}

export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    const nick = parsed?.nick?.trim();
    if (!nick) return null;
    return {
      nick,
      access: parsed.access === "pending" || parsed.access === "profile" ? parsed.access : "active",
      via: parsed.via ?? "email",
      role: parsed.role === "root" || parsed.role === "admin" || parsed.role === "member" ? parsed.role : roleFor(nick, parsed.memberId),
      memberId: parsed.memberId,
      markTag: parsed.markTag ?? null,
      markBg: parsed.markBg,
      markFg: parsed.markFg,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function takeInviteToken() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("invite");
  if (!token) return null;
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
  return token;
}
