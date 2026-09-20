import { getSupabase } from "./client";

export type GuildRole = {
  id: string;
  name: string;
  color: string | null;
};

export type GuildPerson = {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
  bot: boolean;
  joinedAt: string | null;
  roles: GuildRole[];
};

export type GuildRoster = {
  guild: {
    id: string;
    name: string;
    iconUrl: string | null;
    memberCount: number;
    onlineCount: number | null;
  };
  members: GuildPerson[];
  fetchedAt: string;
};

export type GuildLoadError =
  | "not-live"
  | "unauthorized"
  | "root-only"
  | "not-configured"
  | "bot-not-in-guild"
  | "members-intent"
  | "bad-token"
  | "persist"
  | "discord";

type DiscordMemberRow = {
  discord_id: string;
  username: string;
  global_name: string | null;
  guild_nick: string | null;
  avatar_url: string | null;
  bot: boolean;
  joined_at: string | null;
  roles: GuildRole[] | null;
  synced_at: string;
};

type DiscordGuildRow = {
  id: string;
  name: string;
  icon_url: string | null;
  member_count: number | null;
  online_count: number | null;
  synced_at: string;
};

function asRoles(value: GuildRole[] | null | unknown): GuildRole[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as { id?: string; name?: string; color?: string | null };
      if (!item.id || !item.name) return null;
      return { id: String(item.id), name: String(item.name), color: item.color ?? null };
    })
    .filter((row): row is GuildRole => Boolean(row));
}

function personFromRow(row: DiscordMemberRow): GuildPerson {
  return {
    id: row.discord_id,
    username: row.username,
    globalName: row.global_name,
    nick: row.guild_nick,
    avatarUrl: row.avatar_url,
    bot: row.bot,
    joinedAt: row.joined_at,
    roles: asRoles(row.roles),
  };
}

export function personLabel(row: Pick<GuildPerson, "nick" | "globalName" | "username">) {
  return row.nick || row.globalName || row.username;
}

export async function loadCachedRoster(): Promise<GuildRoster | null> {
  const db = getSupabase();
  if (!db) return null;
  const [{ data: guild }, { data: people }] = await Promise.all([
    db.from("discord_guild").select("id, name, icon_url, member_count, online_count, synced_at").limit(1).maybeSingle(),
    db.from("discord_members").select("discord_id, username, global_name, guild_nick, avatar_url, bot, joined_at, roles, synced_at"),
  ]);
  if (!guild && !(people ?? []).length) return null;
  const members = ((people ?? []) as DiscordMemberRow[])
    .map(personFromRow)
    .sort((a, b) => {
      if (a.bot !== b.bot) return a.bot ? 1 : -1;
      return personLabel(a).localeCompare(personLabel(b), "ru");
    });
  const row = guild as DiscordGuildRow | null;
  return {
    guild: {
      id: row?.id ?? "",
      name: row?.name ?? "Discord",
      iconUrl: row?.icon_url ?? null,
      memberCount: row?.member_count ?? members.length,
      onlineCount: row?.online_count ?? null,
    },
    members,
    fetchedAt: row?.synced_at ?? members[0]?.joinedAt ?? new Date().toISOString(),
  };
}

export async function loadCachedGuild() {
  const roster = await loadCachedRoster();
  return roster?.guild ?? null;
}

export async function loadMyDiscord(memberId: string): Promise<GuildPerson | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: ident } = await db
    .from("identities")
    .select("provider_uid")
    .eq("member_id", memberId)
    .eq("provider", "discord")
    .maybeSingle();
  if (!ident?.provider_uid) return null;
  const { data } = await db
    .from("discord_members")
    .select("discord_id, username, global_name, guild_nick, avatar_url, bot, joined_at, roles, synced_at")
    .eq("discord_id", ident.provider_uid)
    .maybeSingle();
  return data ? personFromRow(data as DiscordMemberRow) : null;
}

async function errorCode(error: { message: string; context?: Response }, data: unknown): Promise<GuildLoadError> {
  let body = data && typeof data === "object" && data && "error" in data ? String((data as { error?: string }).error) : "";
  if (!body && error.context) {
    try {
      const parsed = (await error.context.clone().json()) as { error?: string };
      body = parsed.error ?? "";
    } catch {
      /* ignore */
    }
  }
  if (
    body === "not-configured" ||
    body === "root-only" ||
    body === "bot-not-in-guild" ||
    body === "members-intent" ||
    body === "bad-token" ||
    body === "unauthorized" ||
    body === "persist"
  ) {
    return body;
  }
  if (error.message.toLowerCase().includes("jwt") || error.message.includes("401")) return "unauthorized";
  return "discord";
}

export async function refreshGuildRoster(): Promise<{ roster: GuildRoster | null; error: GuildLoadError | null }> {
  const db = getSupabase();
  if (!db) return { roster: null, error: "not-live" };
  const { data, error } = await db.functions.invoke<GuildRoster | { error?: string }>("discord-guild");
  if (error) return { roster: await loadCachedRoster(), error: await errorCode(error, data) };
  if (data && "error" in data && data.error) {
    const code = String(data.error);
    const known =
      code === "not-configured" ||
      code === "root-only" ||
      code === "bot-not-in-guild" ||
      code === "members-intent" ||
      code === "bad-token" ||
      code === "persist"
        ? code
        : "discord";
    return { roster: await loadCachedRoster(), error: known };
  }
  const cached = await loadCachedRoster();
  if (cached) return { roster: cached, error: null };
  if (data && "members" in data) return { roster: data, error: null };
  return { roster: null, error: "discord" };
}
