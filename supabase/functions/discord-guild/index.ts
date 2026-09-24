import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DiscordRole = { id: string; name: string; color: number; position: number; managed?: boolean };
type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
type DiscordMember = {
  user?: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at?: string | null;
};
type DiscordGuild = { id: string; name: string; icon?: string | null; approximate_member_count?: number; approximate_presence_count?: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function roleColor(color: number) {
  if (!color) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}

function avatarUrl(guildId: string, member: DiscordMember, user: DiscordUser) {
  if (member.avatar) return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png?size=64`;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  return null;
}

async function discord<T>(token: string, path: string): Promise<{ data?: T; error?: string; status: number }> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "RedPartySchedule (https://github.com/AlexKhvostov/schedule-app, 1.0)",
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  if (!res.ok) {
    const message = typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: string }).message) : text;
    return { error: message || `discord ${res.status}`, status: res.status };
  }
  return { data: parsed as T, status: res.status };
}

async function allMembers(token: string, guildId: string) {
  const rows: DiscordMember[] = [];
  let after = "0";
  for (let i = 0; i < 20; i += 1) {
    const page = await discord<DiscordMember[]>(token, `/guilds/${guildId}/members?limit=1000&after=${after}`);
    if (page.error) return page;
    const chunk = page.data ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000) return { data: rows, status: 200 };
    const last = chunk[chunk.length - 1]?.user?.id;
    if (!last) return { data: rows, status: 200 };
    after = last;
  }
  return { error: "member list exceeded safe pagination limit", status: 502 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    (() => {
      try {
        return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
      } catch {
        return undefined;
      }
    })();
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey ?? "", { auth: { persistSession: false } });

  const { data: auth, error: authError } = await supabase.auth.getUser();
  let allowed = false;
  if (!authError && auth.user) {
    const { data: member } = await supabase.from("members").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
    if (member) {
      const result = await supabase.rpc("member_has_permission", {
        p_member_id: member.id,
        p_permission: "admin.people",
      });
      allowed = Boolean(result.data);
    }
  } else {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    const { data: cron } = await admin.from("discord_sync_cron_secret").select("token").eq("id", true).maybeSingle();
    allowed = Boolean(cronToken && cron?.token === cronToken);
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  const token = Deno.env.get("DISCORD_BOT_TOKEN")?.trim() ?? "";
  const guildId = Deno.env.get("DISCORD_GUILD_ID")?.trim() ?? "";
  if (!token || !guildId) return json({ error: "not-configured" }, 503);

  const [guildRes, rolesRes, membersRes] = await Promise.all([
    discord<DiscordGuild>(token, `/guilds/${guildId}?with_counts=true`),
    discord<DiscordRole[]>(token, `/guilds/${guildId}/roles`),
    allMembers(token, guildId),
  ]);

  if (guildRes.error || rolesRes.error || membersRes.error) {
    const raw = guildRes.error || rolesRes.error || membersRes.error || "discord";
    const status = guildRes.error ? guildRes.status : rolesRes.error ? rolesRes.status : membersRes.status;
    let error = "discord";
    if (/missing access|unknown guild|50001|10004/i.test(raw)) error = "bot-not-in-guild";
    else if (/intent|privileged/i.test(raw)) error = "members-intent";
    else if (status === 401) error = "bad-token";
    return json({ error, detail: raw }, status >= 400 ? status : 502);
  }

  const roleById = new Map((rolesRes.data ?? []).map((row) => [row.id, row]));
  const guildRoles = (rolesRes.data ?? [])
    .filter((role) => role.name !== "@everyone")
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: roleColor(role.color),
      position: role.position,
      managed: Boolean(role.managed),
    }));
  const members = (membersRes.data ?? [])
    .filter((row) => row.user)
    .map((row) => {
      const user = row.user as DiscordUser;
      return {
        id: user.id,
        username: user.username,
        globalName: user.global_name ?? null,
        nick: row.nick ?? null,
        avatarUrl: avatarUrl(guildId, row, user),
        bot: Boolean(user.bot),
        joinedAt: row.joined_at ?? null,
        roles: row.roles
          .map((id) => roleById.get(id))
          .filter((role): role is DiscordRole => Boolean(role) && role.name !== "@everyone")
          .sort((a, b) => b.position - a.position)
          .map((role) => ({ id: role.id, name: role.name, color: roleColor(role.color) })),
      };
    })
    .sort((a, b) => {
      if (a.bot !== b.bot) return a.bot ? 1 : -1;
      return (a.nick || a.globalName || a.username).localeCompare(b.nick || b.globalName || b.username, "ru");
    });

  const guild = guildRes.data as DiscordGuild;
  const snapshot = {
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
      memberCount: guild.approximate_member_count ?? members.length,
      onlineCount: guild.approximate_presence_count ?? null,
    },
    members,
    fetchedAt: new Date().toISOString(),
  };

  const { error: persistError } = await admin.rpc("replace_discord_roster", {
    p_guild: {
      id: snapshot.guild.id,
      name: snapshot.guild.name,
      icon_url: snapshot.guild.iconUrl,
      member_count: snapshot.guild.memberCount,
      online_count: snapshot.guild.onlineCount,
    },
    p_members: members.map((row) => ({
      discord_id: row.id,
      username: row.username,
      global_name: row.globalName,
      guild_nick: row.nick,
      avatar_url: row.avatarUrl,
      bot: row.bot,
      joined_at: row.joinedAt,
      roles: row.roles,
    })),
    p_roles: guildRoles,
  });
  if (persistError) return json({ error: "persist", detail: persistError.message }, 500);

  return json(snapshot);
});
