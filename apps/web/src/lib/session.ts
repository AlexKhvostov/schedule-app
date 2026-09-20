import { getSupabase } from "./supabase";

export type AppRole = "root" | "admin" | "member";

export type LiveMember = {
  id: string;
  nick: string;
  access: "pending" | "active" | "blocked";
  role: AppRole;
  markTag: string | null;
};

export async function loadMember(): Promise<LiveMember | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: member } = await db
    .from("members")
    .select("id, public_code, access_status, mark_tag")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!member) return null;
  const { data: ident } = await db
    .from("identities")
    .select("username, display_name, guild_nick")
    .eq("member_id", member.id)
    .maybeSingle();
  const { data: roles } = await db.from("member_roles").select("role_id").eq("member_id", member.id);
  const ids = (roles ?? []).map((row) => row.role_id);
  return {
    id: member.id,
    nick: ident?.guild_nick || ident?.username || ident?.display_name || member.public_code,
    access: member.access_status,
    role: ids.includes("root") ? "root" : ids.includes("admin") ? "admin" : "member",
    markTag: member.mark_tag,
  };
}

export async function signInDiscord() {
  const db = getSupabase();
  if (!db) return { error: "not-configured" };
  return db.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "identify email",
    },
  });
}

export async function signOut() {
  const db = getSupabase();
  if (db) await db.auth.signOut();
}

export async function approveMember(id: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" };
  return db.from("members").update({ access_status: "active", approved_at: new Date().toISOString() }).eq("id", id);
}
