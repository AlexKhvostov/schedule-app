import { getSupabase } from "./client";
import { isLiveData } from "./config";
import type { AppRole, AuthVia, Session } from "../v2/session";

export type LiveMember = {
  id: string;
  publicCode: string;
  access: "pending" | "active" | "blocked";
  markTag: string | null;
  markBg: string;
  markFg: string;
  tables: number;
  nick: string;
  via: AuthVia;
  role: AppRole;
  avatarUrl: string | null;
};

function viaOf(provider?: string | null): AuthVia {
  if (provider === "google") return "google";
  if (provider === "email") return "email";
  return "discord";
}

function roleOf(ids: string[]): AppRole {
  if (ids.includes("root")) return "root";
  if (ids.includes("admin")) return "admin";
  return "member";
}

export async function signInDiscord(redirectTo = `${window.location.origin}/auth/callback`) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo, scopes: "identify email" },
  });
  return { error: error?.message };
}

export async function signOutLive() {
  const db = getSupabase();
  if (db) await db.auth.signOut();
}

export async function sendPasswordReset(email: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const next = email.trim();
  if (!next) return { error: "empty" as const };
  const { error } = await db.auth.resetPasswordForEmail(next, { redirectTo: window.location.origin });
  return { error: error?.message ?? null };
}

export async function loadLiveMember(): Promise<LiveMember | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: member } = await db
    .from("members")
    .select("id, public_code, access_status, mark_tag, mark_bg, mark_fg, tables")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!member) return null;
  const { data: ident } = await db
    .from("identities")
    .select("provider, provider_uid, username, display_name, guild_nick")
    .eq("member_id", member.id)
    .maybeSingle();
  const { data: roles } = await db.from("member_roles").select("role_id").eq("member_id", member.id);
  const { data: discord } = ident?.provider_uid
    ? await db
        .from("discord_members")
        .select("guild_nick, global_name, username, avatar_url")
        .eq("discord_id", ident.provider_uid)
        .maybeSingle()
    : { data: null };
  const nick =
    discord?.guild_nick ||
    discord?.global_name ||
    discord?.username ||
    ident?.guild_nick ||
    ident?.username ||
    ident?.display_name ||
    member.public_code;
  return {
    id: member.id,
    publicCode: member.public_code,
    access: member.access_status === "active" ? "active" : member.access_status === "blocked" ? "blocked" : "pending",
    markTag: member.mark_tag,
    markBg: member.mark_bg,
    markFg: member.mark_fg,
    tables: member.tables,
    nick,
    via: viaOf(ident?.provider),
    role: roleOf((roles ?? []).map((row) => row.role_id)),
    avatarUrl: discord?.avatar_url ?? null,
  };
}

export function liveToSession(member: LiveMember): Session {
  return {
    nick: member.nick,
    access: member.access === "active" ? "active" : "pending",
    via: member.via,
    role: member.role,
    memberId: member.id,
    markTag: member.markTag,
    markBg: member.markBg,
    markFg: member.markFg,
    avatarUrl: member.avatarUrl,
  };
}

export function liveAuthReady() {
  return isLiveData();
}

export async function setMemberAccess(memberId: string, access: "active" | "blocked" | "pending") {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db
    .from("members")
    .update({
      access_status: access,
      approved_at: access === "active" ? new Date().toISOString() : null,
    })
    .eq("id", memberId);
  return { error: error?.message };
}

export async function listPendingMembers() {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("members")
    .select("id, public_code, access_status, mark_tag, created_at")
    .eq("access_status", "pending")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export type ClubRoleRow = {
  id: string;
  nick: string;
  publicCode: string;
  access: LiveMember["access"];
  roles: string[];
};

function nickOf(
  ident?: { provider_uid?: string | null; username?: string | null; display_name?: string | null; guild_nick?: string | null } | null,
  discord?: { guild_nick?: string | null; global_name?: string | null; username?: string | null } | null,
  fallback = "",
) {
  return (
    discord?.guild_nick ||
    discord?.global_name ||
    discord?.username ||
    ident?.guild_nick ||
    ident?.username ||
    ident?.display_name ||
    fallback
  );
}

export async function listClubMembers(): Promise<ClubRoleRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data: members } = await db
    .from("members")
    .select("id, public_code, access_status")
    .order("created_at", { ascending: true });
  if (!members?.length) return [];
  const ids = members.map((row) => row.id);
  const [{ data: idents }, { data: roles }] = await Promise.all([
    db.from("identities").select("member_id, provider_uid, username, display_name, guild_nick").in("member_id", ids),
    db.from("member_roles").select("member_id, role_id").in("member_id", ids),
  ]);
  const discordIds = [...new Set((idents ?? []).map((row) => row.provider_uid).filter(Boolean))];
  const { data: discord } = discordIds.length
    ? await db.from("discord_members").select("discord_id, guild_nick, global_name, username").in("discord_id", discordIds)
    : { data: [] as { discord_id: string; guild_nick: string | null; global_name: string | null; username: string | null }[] };
  const identByMember = new Map((idents ?? []).map((row) => [row.member_id, row]));
  const discordById = new Map((discord ?? []).map((row) => [row.discord_id, row]));
  const rolesByMember = new Map<string, string[]>();
  for (const row of roles ?? []) {
    const list = rolesByMember.get(row.member_id) ?? [];
    list.push(row.role_id);
    rolesByMember.set(row.member_id, list);
  }
  return members.map((row) => {
    const ident = identByMember.get(row.id);
    const snap = ident?.provider_uid ? discordById.get(ident.provider_uid) : undefined;
    return {
      id: row.id,
      nick: nickOf(ident, snap, row.public_code),
      publicCode: row.public_code,
      access: row.access_status === "active" ? "active" : row.access_status === "blocked" ? "blocked" : "pending",
      roles: rolesByMember.get(row.id) ?? ["member"],
    };
  });
}

export async function setMemberAdmin(memberId: string, on: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  if (on) {
    const { error } = await db.from("member_roles").upsert({ member_id: memberId, role_id: "admin" });
    return { error: error?.message };
  }
  const { error } = await db.from("member_roles").delete().eq("member_id", memberId).eq("role_id", "admin");
  return { error: error?.message };
}
