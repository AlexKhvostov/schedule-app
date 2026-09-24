import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

type DiscordMember = {
  user?: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function avatarUrl(guildId: string, member: DiscordMember, user: DiscordUser) {
  if (member.avatar) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png?size=64`;
  }
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  return null;
}

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);

  const discordIdentity = auth.user.identities?.find((identity) => identity.provider === "discord");
  const identityData = discordIdentity?.identity_data as Record<string, unknown> | undefined;
  const discordId = String(
    identityData?.provider_id ??
      identityData?.sub ??
      discordIdentity?.id ??
      auth.user.user_metadata?.provider_id ??
      "",
  );
  if (!discordId) return json({ error: "discord-identity-required" }, 422);

  const token = Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "";
  const guildId = Deno.env.get("DISCORD_GUILD_ID")?.trim() ?? "";
  const key = serviceKey();
  if (!token || !guildId || !key) return json({ error: "not-configured" }, 503);

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
  });

  const admin = createClient(url, key, { auth: { persistSession: false } });
  if (response.status === 404) {
    const { error } = await admin.rpc("apply_discord_member_check", {
      p_discord_id: discordId,
      p_present: false,
      p_member: null,
    });
    if (error) return json({ error: "persist", detail: error.message }, 500);
    return json({ present: false, hasRequiredRole: false });
  }

  if (!response.ok) {
    const detail = await response.text();
    return json({ error: "discord", detail }, response.status >= 400 ? response.status : 502);
  }

  const discordMember = (await response.json()) as DiscordMember;
  if (!discordMember.user || discordMember.user.id !== discordId) {
    return json({ error: "incomplete-discord-response" }, 502);
  }

  const [{ data: knownRoles }, { data: settings }] = await Promise.all([
    admin.from("discord_guild_roles").select("role_id,name,color,position").eq("present", true),
    admin.from("club_settings").select("required_discord_role_id").eq("id", true).single(),
  ]);
  const roleMap = new Map((knownRoles ?? []).map((role) => [role.role_id, role]));
  const roles = discordMember.roles.map((id) => {
    const role = roleMap.get(id);
    return {
      id,
      name: role?.name ?? id,
      color: role?.color ?? null,
      position: role?.position ?? 0,
    };
  });
  const user = discordMember.user;
  const memberPayload = {
    discord_id: discordId,
    username: user.username,
    global_name: user.global_name ?? null,
    guild_nick: discordMember.nick ?? null,
    avatar_url: avatarUrl(guildId, discordMember, user),
    bot: false,
    joined_at: discordMember.joined_at ?? null,
    roles,
  };

  const { error: persistError } = await admin.rpc("apply_discord_member_check", {
    p_discord_id: discordId,
    p_present: true,
    p_member: memberPayload,
  });
  if (persistError) return json({ error: "persist", detail: persistError.message }, 500);

  const requiredRoleId = settings?.required_discord_role_id ?? "";
  return json({
    present: true,
    hasRequiredRole: discordMember.roles.includes(requiredRoleId),
    member: memberPayload,
  });
});
