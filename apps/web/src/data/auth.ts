import { getSupabase } from "./client";
import { isLiveData } from "./config";
import type { AppRole, AuthVia, Session } from "../v2/session";

const FRESH_DISCORD_LOGIN_KEY = "v2-fresh-discord-login";

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
  permissions: string[];
  isRoot: boolean;
  blockReason: "manual" | "discord_left" | "missing_redparty" | null;
  hasRequiredRole: boolean;
};

function viaOf(provider?: string | null): AuthVia {
  if (provider === "google") return "google";
  if (provider === "email") return "email";
  return "discord";
}

function roleOf(isRoot: boolean, permissions: string[]): AppRole {
  if (isRoot) return "root";
  if (permissions.includes("admin.people")) return "admin";
  return "member";
}

type DiscordCheck = {
  present: boolean;
  hasRequiredRole: boolean;
  error?: string;
};

function discordIdOf(user: {
  identities?: Array<{ provider?: string; id?: string; identity_data?: Record<string, unknown> }>;
  user_metadata?: Record<string, unknown>;
}) {
  const identity = user.identities?.find((item) => item.provider === "discord");
  return String(
    identity?.identity_data?.provider_id ??
      identity?.identity_data?.sub ??
      identity?.id ??
      user.user_metadata?.provider_id ??
      "",
  );
}

export function markFreshDiscordLogin() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(FRESH_DISCORD_LOGIN_KEY, "1");
}

function takeFreshDiscordLogin() {
  if (typeof sessionStorage === "undefined") return false;
  const fresh = sessionStorage.getItem(FRESH_DISCORD_LOGIN_KEY) === "1";
  sessionStorage.removeItem(FRESH_DISCORD_LOGIN_KEY);
  return fresh;
}

async function checkDiscordSnapshot(user: Parameters<typeof discordIdOf>[0]): Promise<DiscordCheck | null> {
  const db = getSupabase();
  const discordId = discordIdOf(user);
  if (!db || !discordId) return null;
  const [{ data: member }, { data: settings }] = await Promise.all([
    db.from("discord_members").select("present,roles").eq("discord_id", discordId).maybeSingle(),
    db.from("club_settings").select("required_discord_role_id").eq("id", true).maybeSingle(),
  ]);
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  const requiredRoleId = settings?.required_discord_role_id;
  return {
    present: Boolean(member?.present),
    hasRequiredRole: Boolean(
      member?.present &&
        requiredRoleId &&
        roles.some((role) => typeof role === "object" && role !== null && "id" in role && role.id === requiredRoleId),
    ),
  };
}

export async function checkMyDiscordMember(): Promise<DiscordCheck | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.functions.invoke("discord-member-check", { body: {} });
  if (error) return { present: false, hasRequiredRole: false, error: error.message };
  return data as DiscordCheck;
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

async function loadLiveMemberForAuthUser(authUserId: string): Promise<LiveMember | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: member } = await db
    .from("members")
    .select("id, public_code, access_status, mark_tag, mark_bg, mark_fg, tables")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!member) return null;
  const { data: ident } = await db
    .from("identities")
    .select("provider, provider_uid, username, display_name, guild_nick, avatar_url")
    .eq("member_id", member.id)
    .maybeSingle();
  const { data: context } = await db.rpc("member_access_context");
  const accessContext = (context ?? {}) as {
    permissions?: string[];
    isRoot?: boolean;
    blockReason?: LiveMember["blockReason"];
    hasRequiredRole?: boolean;
  };
  const permissions = Array.isArray(accessContext.permissions) ? accessContext.permissions : [];
  const isRoot = Boolean(accessContext.isRoot);
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
    role: roleOf(isRoot, permissions),
    avatarUrl: discord?.avatar_url ?? ident?.avatar_url ?? null,
    permissions,
    isRoot,
    blockReason: accessContext.blockReason ?? null,
    hasRequiredRole: Boolean(accessContext.hasRequiredRole),
  };
}

export async function loadLiveMember(): Promise<LiveMember | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  return loadLiveMemberForAuthUser(auth.user.id);
}

export function liveToSession(member: LiveMember): Session {
  return {
    nick: member.nick,
    access: member.access === "active" ? "active" : member.access === "pending" ? "profile" : "pending",
    via: member.via,
    role: member.role,
    permissions: member.permissions,
    memberId: member.id,
    markTag: member.markTag,
    markBg: member.markBg,
    markFg: member.markFg,
    avatarUrl: member.avatarUrl,
  };
}

export type LiveEntry =
  | { kind: "member"; session: Session }
  | {
      kind: "gate";
      nick: string;
      requestStatus: "open" | "dismissed" | null;
      requestKind: "join" | "restore";
      canRequest: boolean;
      reason: "manual" | "discord_left" | "missing_redparty" | "not_member" | null;
      avatarUrl: string | null;
    }
  | { kind: "none" };

export async function loadLiveEntry(): Promise<LiveEntry> {
  const db = getSupabase();
  if (!db) return { kind: "none" };
  // A signed-out visitor can be detected locally; no remote auth check is needed.
  const { data: stored } = await db.auth.getSession();
  if (!stored.session) return { kind: "none" };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { kind: "none" };
  const snapshot = () => checkDiscordSnapshot(auth.user);
  const check = takeFreshDiscordLogin()
    ? await checkMyDiscordMember().then((result) => (result?.error ? snapshot() : result))
    : await snapshot();
  let member = await loadLiveMemberForAuthUser(auth.user.id);
  if (!member && check?.present && check.hasRequiredRole) {
    await db.rpc("self_create_profile");
    member = await loadLiveMemberForAuthUser(auth.user.id);
  }
  if (member?.access === "active") return { kind: "member", session: liveToSession(member) };
  const meta = auth.user.user_metadata ?? {};
  const nick = String(meta.full_name || meta.custom_claims || meta.user_name || meta.name || auth.user.email || "user");
  const requestKind = member ? "restore" : "join";
  const { data: req } = await db
    .from("club_join_requests")
    .select("id,status")
    .in("status", ["open", "dismissed"])
    .eq("kind", requestKind)
    .eq("auth_user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    kind: "gate",
    nick,
    requestStatus: req?.status === "open" || req?.status === "dismissed" ? req.status : null,
    requestKind,
    canRequest: Boolean((member?.hasRequiredRole ?? check?.hasRequiredRole) && (member ? member.blockReason !== "manual" : true)),
    reason: member?.blockReason ?? "not_member",
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
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
