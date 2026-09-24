import { getSupabase } from "./client";
import { isLiveData } from "./config";
import { personLabel, type GuildRole } from "./guild";
import type { NotifyChannel } from "./botSettings";

export type ClubAccess = "closed" | "member" | "admin" | "staff";

export type AdminPerson = {
  discordId: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
  bot: boolean;
  joinedAt: string | null;
  discordRoles: GuildRole[];
  accessDiscordRoles: GuildRole[];
  onGuild: boolean;
  memberId: string | null;
  publicCode: string | null;
  access: ClubAccess;
  accessStatus: "pending" | "active" | "blocked" | null;
  blockReason: "manual" | "discord_left" | "missing_redparty" | null;
  loggedIn: boolean;
  clubRoles: string[];
  communityStatus: string | null;
  guarantorId: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  gridPriority: number | null;
  distanceExtId: string | null;
  markTag: string | null;
  markBg: string;
  markFg: string;
  tables: number | null;
  vipNitro: number | null;
  vipRegular: number | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  birthday: string | null;
  showExtraTz: boolean | null;
  extraUtc: number | null;
  telegram: string | null;
  contactAlt: string | null;
  notifyChannel: NotifyChannel;
  logins: MemberLogins;
};

export type MemberLogins = {
  discord: boolean;
  google: boolean;
  email: boolean;
  googleHint: string | null;
};

export function emptyLogins(): MemberLogins {
  return { discord: false, google: false, email: false, googleHint: null };
}

type DiscordRow = {
  discord_id: string;
  username: string;
  global_name: string | null;
  guild_nick: string | null;
  avatar_url: string | null;
  bot: boolean;
  joined_at: string | null;
  roles: GuildRole[] | null;
  present: boolean;
};

type MemberRow = {
  id: string;
  public_code: string;
  access_status: string;
  community_status: string | null;
  guarantor_id: string | null;
  mark_tag: string | null;
  mark_bg: string;
  mark_fg: string;
  tables: number;
  grid_priority: number;
  vip_nitro: number;
  vip_regular: number;
  distance_ext_id: string | null;
  auth_user_id: string | null;
  created_at: string;
  approved_at: string | null;
  block_reason: "manual" | "discord_left" | "missing_redparty" | null;
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

const STAFF_ROLE_ID = "1208019567251820604";
const REDPARTY_ROLE_ID = "1208022351652986891";

function clubAccess(accessStatus: string | undefined, roles: string[], discordRoles: GuildRole[]): ClubAccess {
  if (accessStatus !== "active") return "closed";
  if (roles.includes("root")) return "staff";
  if (discordRoles.some((role) => role.id === STAFF_ROLE_ID)) return "admin";
  if (discordRoles.some((role) => role.id === REDPARTY_ROLE_ID)) return "member";
  return "closed";
}

export function hasRoot(row: Pick<AdminPerson, "clubRoles">) {
  return row.clubRoles.includes("root");
}

export function isPlayerAccess(access: ClubAccess) {
  return access === "member" || access === "admin";
}

export function peopleRank(row: Pick<AdminPerson, "bot" | "accessStatus" | "clubRoles" | "onGuild" | "memberId">) {
  if (row.bot) return 5;
  if (hasRoot(row)) return 0;
  if (!row.memberId) return 4;
  if (!row.onGuild) return 2;
  if (row.accessStatus === "active") return 1;
  return 3;
}

export function personTitle(row: Pick<AdminPerson, "nick" | "globalName" | "username" | "displayName">) {
  return row.displayName || personLabel(row);
}

/** How they appear on the club server: guild nick, else Discord display name, else username. */
export function discordPrimary(row: Pick<AdminPerson, "nick" | "globalName" | "username">) {
  return row.nick || row.globalName || row.username;
}

type IdentRow = {
  member_id: string;
  provider: string;
  provider_uid: string | null;
  username: string | null;
  display_name: string | null;
  guild_nick?: string | null;
  avatar_url?: string | null;
  guild_present?: boolean | null;
  discord_roles?: GuildRole[] | null;
};

export type ClubRequest = {
  id: string;
  kind: "join" | "restore";
  discordId: string;
  memberId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: "open" | "done" | "dismissed";
  createdAt: string;
};

export async function listAdminPeople(): Promise<AdminPerson[]> {
  const db = getSupabase();
  if (!db) return [];
  const [{ data: discord }, { data: members }, { data: idents }, { data: roles }, { data: profiles }, { data: distMap }, { data: roleCatalog }] = await Promise.all([
    db.from("discord_members").select("discord_id, username, global_name, guild_nick, avatar_url, bot, joined_at, roles, present"),
    db.from("members").select("id, public_code, access_status, block_reason, community_status, guarantor_id, mark_tag, mark_bg, mark_fg, tables, grid_priority, vip_nitro, vip_regular, distance_ext_id, auth_user_id, created_at, approved_at"),
    db.from("identities").select("member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, guild_present, discord_roles"),
    db.from("member_roles").select("member_id, role_id"),
    db.from("profiles").select("member_id, display_name, email, phone, city, country, birthday, show_extra_tz, extra_utc, telegram, contact_alt, notify_channel"),
    db.from("discord_distance_ids").select("discord_id, distance_ext_id"),
    db.from("discord_guild_roles").select("role_id,position,display_order,admin_visible"),
  ]);
  const roleOrder = new Map(
    ((roleCatalog ?? []) as { role_id: string; position: number; display_order: number | null; admin_visible: boolean }[]).map((row) => [
      row.role_id,
      row.display_order ?? row.position,
    ]),
  );
  const visibleRoleIds = new Set(
    ((roleCatalog ?? []) as { role_id: string; admin_visible: boolean }[])
      .filter((row) => row.admin_visible)
      .map((row) => row.role_id),
  );
  const distanceByDiscord = new Map(
    ((distMap ?? []) as { discord_id: string; distance_ext_id: string }[]).map((row) => [row.discord_id, row.distance_ext_id]),
  );

  const memberById = new Map(((members ?? []) as MemberRow[]).map((row) => [row.id, row]));
  const identByDiscord = new Map<string, IdentRow>();
  const loginsByMember = new Map<string, MemberLogins>();
  for (const raw of idents ?? []) {
    const row = raw as IdentRow;
    const memberId = row.member_id;
    const provider = String(row.provider ?? "");
    const cur = loginsByMember.get(memberId) ?? emptyLogins();
    if (provider === "discord") {
      cur.discord = true;
      if (row.provider_uid) identByDiscord.set(String(row.provider_uid), row);
    }
    if (provider === "google") {
      cur.google = true;
      cur.googleHint = String(row.username || row.display_name || "").trim() || null;
    }
    if (provider === "email") cur.email = true;
    loginsByMember.set(memberId, cur);
  }
  const rolesByMember = new Map<string, string[]>();
  for (const row of roles ?? []) {
    const list = rolesByMember.get(row.member_id) ?? [];
    list.push(row.role_id);
    rolesByMember.set(row.member_id, list);
  }
  const profileByMember = new Map((profiles ?? []).map((row) => [row.member_id as string, row]));
  const snapByDiscord = new Map(((discord ?? []) as DiscordRow[]).map((row) => [row.discord_id, row]));

  const asPerson = (discordId: string, snap?: DiscordRow, ident?: IdentRow): AdminPerson => {
    const memberId = ident?.member_id ?? null;
    const member = memberId ? memberById.get(memberId) : undefined;
    const clubRoles = memberId ? (rolesByMember.get(memberId) ?? []) : [];
    const profile = memberId ? profileByMember.get(memberId) : undefined;
    const discordRoles = asRoles(snap?.roles ?? ident?.discord_roles).sort(
      (a, b) =>
        Number(visibleRoleIds.has(b.id)) - Number(visibleRoleIds.has(a.id)) ||
        (roleOrder.get(b.id) ?? -1) - (roleOrder.get(a.id) ?? -1) ||
        a.name.localeCompare(b.name, "ru"),
    );
    const accessStatus =
      member?.access_status === "active" || member?.access_status === "blocked" || member?.access_status === "pending"
        ? member.access_status
        : null;
    return {
      discordId,
      username: snap?.username || ident?.username || "",
      globalName: snap?.global_name ?? ident?.display_name ?? null,
      nick: snap?.guild_nick ?? ident?.guild_nick ?? null,
      avatarUrl: snap?.avatar_url ?? ident?.avatar_url ?? null,
      bot: snap?.bot ?? false,
      joinedAt: snap?.joined_at ?? null,
      discordRoles,
      accessDiscordRoles: discordRoles.filter((role) => visibleRoleIds.has(role.id)),
      onGuild: snap?.present ?? Boolean(ident?.guild_present),
      memberId,
      publicCode: member?.public_code ?? null,
      access: clubAccess(member?.access_status, clubRoles, discordRoles),
      accessStatus,
      blockReason: member?.block_reason ?? null,
      loggedIn: Boolean(member?.auth_user_id),
      clubRoles,
      communityStatus: member?.community_status ?? null,
      guarantorId: member?.guarantor_id ?? null,
      createdAt: member?.created_at ?? null,
      approvedAt: member?.approved_at ?? null,
      gridPriority: member ? member.grid_priority : null,
      distanceExtId: member?.distance_ext_id ?? distanceByDiscord.get(discordId) ?? null,
      markTag: member?.mark_tag ?? null,
      markBg: member?.mark_bg ?? "#76a5af",
      markFg: member?.mark_fg ?? "#1a2118",
      tables: member?.tables ?? null,
      vipNitro: member && member.vip_nitro > 0 ? member.vip_nitro : null,
      vipRegular: member && member.vip_regular > 0 ? member.vip_regular : null,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      city: profile?.city ?? null,
      country: profile?.country ?? null,
      birthday: profile?.birthday ?? null,
      showExtraTz: profile ? Boolean(profile.show_extra_tz) : null,
      extraUtc: typeof profile?.extra_utc === "number" ? profile.extra_utc : null,
      telegram: profile?.telegram ?? null,
      contactAlt: profile?.contact_alt ?? null,
      notifyChannel: asNotifyChannel(profile?.notify_channel),
      logins: memberId ? (loginsByMember.get(memberId) ?? emptyLogins()) : emptyLogins(),
    };
  };

  const seen = new Set<string>();
  const people: AdminPerson[] = [];
  for (const snap of snapByDiscord.values()) {
    seen.add(snap.discord_id);
    people.push(asPerson(snap.discord_id, snap, identByDiscord.get(snap.discord_id)));
  }
  for (const [discordId, ident] of identByDiscord) {
    if (seen.has(discordId)) continue;
    people.push(asPerson(discordId, undefined, ident));
  }

  people.sort((a, b) => {
    if (a.bot !== b.bot) return a.bot ? 1 : -1;
    const byAccess = peopleRank(a) - peopleRank(b);
    if (byAccess) return byAccess;
    return discordPrimary(a).localeCompare(discordPrimary(b), "ru");
  });
  return people;
}

export async function setDiscordAccess(discordId: string, access: ClubAccess) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("set_discord_access", { p_discord_id: discordId, p_access: access });
  return { error: error?.message ?? error?.code ?? null };
}

export async function createClubCard(discordId: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("approve_club_profile", { p_discord_id: discordId });
  return { error: error?.message ?? error?.code ?? null };
}

export async function blockClubProfile(memberId: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("block_club_profile", { p_member_id: memberId });
  return { error: error?.message ?? error?.code ?? null };
}

export async function createRedPartyProfiles() {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const, count: 0 };
  const { data, error } = await db.rpc("create_redparty_profiles");
  return { error: error?.message ?? error?.code ?? null, count: Number(data ?? 0) };
}

export async function reopenJoinRequest(id: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("reopen_join_request", { p_id: id });
  return { error: error?.message ?? error?.code ?? null };
}

export async function restoreClubCard(memberId: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("restore_club_card", { p_member_id: memberId });
  return { error: error?.message ?? error?.code ?? null };
}

export async function loadClubRequests(): Promise<ClubRequest[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("club_join_requests")
    .select("id, kind, discord_id, member_id, username, display_name, avatar_url, status, created_at")
    .order("created_at", { ascending: false });
  return ((data ?? []) as {
    id: string;
    kind: "join" | "restore";
    discord_id: string;
    member_id: string | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    status: "open" | "done" | "dismissed";
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    discordId: row.discord_id,
    memberId: row.member_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function submitJoinRequest() {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("submit_join_request");
  return { error: error?.message ?? error?.code ?? null };
}

export async function dismissJoinRequest(id: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("dismiss_join_request", { p_id: id });
  return { error: error?.message ?? error?.code ?? null };
}

export async function saveMemberDistanceId(memberId: string | null, value: string, discordId: string) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const text = value.trim();
  const distance_ext_id = text ? text : null;
  if (distance_ext_id && !/^[0-9]{1,12}$/.test(distance_ext_id)) return { error: "bad-shape" as const };
  if (memberId) {
    const { error } = await db.from("members").update({ distance_ext_id }).eq("id", memberId);
    const code = error?.code ?? error?.message ?? null;
    if (code) {
      if (code === "23505" || /members_distance_ext_id/i.test(String(code))) return { error: "duplicate" as const };
      return { error: String(code) };
    }
  }
  if (distance_ext_id) {
    const { error } = await db.from("discord_distance_ids").upsert({ discord_id: discordId, distance_ext_id });
    const code = error?.code ?? error?.message ?? null;
    if (code) {
      if (code === "23505" || /discord_distance_ids/i.test(String(code))) return { error: "duplicate" as const };
      return { error: String(code) };
    }
  } else {
    const { error } = await db.from("discord_distance_ids").delete().eq("discord_id", discordId);
    if (error) return { error: error.message ?? error.code ?? "save" };
  }
  return { error: null };
}

export async function saveMemberMark(memberId: string, mark: { tag: string | null; bg: string; fg: string }) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db
    .from("members")
    .update({ mark_tag: mark.tag, mark_bg: mark.bg, mark_fg: mark.fg })
    .eq("id", memberId);
  return { error: error?.message ?? null };
}

export async function saveMemberTables(memberId: string, tables: number) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const next = Math.min(30, Math.max(1, Math.round(tables)));
  const { error } = await db.from("members").update({ tables: next }).eq("id", memberId);
  return { error: error?.message ?? null };
}

export async function saveMemberClub(
  memberId: string,
  patch: {
    tables?: number;
    vipNitro?: number;
    vipRegular?: number;
    communityStatus?: "school" | "club" | null;
    guarantorId?: string | null;
  },
) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const asVip = (n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? Math.min(999, Math.round(v)) : 0;
  };
  const row: Record<string, unknown> = {};
  if ("tables" in patch && patch.tables != null) row.tables = Math.min(30, Math.max(1, Math.round(patch.tables)));
  if ("vipNitro" in patch) row.vip_nitro = asVip(patch.vipNitro);
  if ("vipRegular" in patch) row.vip_regular = asVip(patch.vipRegular);
  if ("communityStatus" in patch) {
    row.community_status = patch.communityStatus === "school" || patch.communityStatus === "club" ? patch.communityStatus : "club";
  }
  if ("guarantorId" in patch) {
    const next = patch.guarantorId?.trim() || null;
    row.guarantor_id = next && next !== memberId ? next : null;
  }
  if (!Object.keys(row).length) return { error: null };
  const { data, error } = await db.from("members").update(row).eq("id", memberId).select("id");
  if (error) {
    if (error.code === "23505" || /members_vip_/i.test(error.message)) return { error: "vip-dup" as const };
    return { error: error.message };
  }
  if (!data?.length) return { error: "not-saved" as const };
  return { error: null };
}

export type ProfilePatch = {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  birthday?: string | null;
  showExtraTz?: boolean;
  extraUtc?: number;
  telegram?: string | null;
  contactAlt?: string | null;
  notifyChannel?: NotifyChannel;
};

export type MyCabinet = {
  tables: number | null;
  communityStatus: string | null;
  createdAt: string | null;
  vipNitro: number | null;
  vipRegular: number | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  birthday: string | null;
  showExtraTz: boolean;
  extraUtc: number;
  telegram: string | null;
  contactAlt: string | null;
  notifyChannel: NotifyChannel;
};

function asNotifyChannel(value: string | null | undefined): NotifyChannel {
  if (value === "telegram" || value === "email") return value;
  return "discord";
}

function emptyToNull(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export async function loadMyCabinet(memberId: string): Promise<MyCabinet | null> {
  const db = getSupabase();
  if (!db) return null;
  const [{ data: member }, { data: profile }] = await Promise.all([
    db.from("members").select("community_status, tables, created_at, vip_nitro, vip_regular").eq("id", memberId).maybeSingle(),
    db
      .from("profiles")
      .select("display_name, email, phone, city, country, birthday, show_extra_tz, extra_utc, telegram, contact_alt, notify_channel")
      .eq("member_id", memberId)
      .maybeSingle(),
  ]);
  if (!member && !profile) return null;
  return {
    tables: typeof member?.tables === "number" ? member.tables : null,
    communityStatus: member?.community_status ?? null,
    createdAt: member?.created_at ?? null,
    vipNitro: typeof member?.vip_nitro === "number" && member.vip_nitro > 0 ? member.vip_nitro : null,
    vipRegular: typeof member?.vip_regular === "number" && member.vip_regular > 0 ? member.vip_regular : null,
    displayName: profile?.display_name ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    birthday: profile?.birthday ?? null,
    showExtraTz: Boolean(profile?.show_extra_tz),
    extraUtc: typeof profile?.extra_utc === "number" ? profile.extra_utc : 3,
    telegram: profile?.telegram ?? null,
    contactAlt: profile?.contact_alt ?? null,
    notifyChannel: asNotifyChannel(profile?.notify_channel),
  };
}

export async function saveMemberProfile(memberId: string, patch: ProfilePatch) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const row: Record<string, unknown> = {};
  if ("displayName" in patch) row.display_name = emptyToNull(patch.displayName);
  if ("email" in patch) row.email = emptyToNull(patch.email);
  if ("phone" in patch) row.phone = emptyToNull(patch.phone);
  if ("city" in patch) row.city = emptyToNull(patch.city);
  if ("country" in patch) row.country = emptyToNull(patch.country);
  if ("birthday" in patch) row.birthday = emptyToNull(patch.birthday);
  if ("showExtraTz" in patch) row.show_extra_tz = Boolean(patch.showExtraTz);
  if ("extraUtc" in patch) row.extra_utc = patch.extraUtc ?? 3;
  if ("telegram" in patch) row.telegram = emptyToNull(patch.telegram);
  if ("contactAlt" in patch) row.contact_alt = emptyToNull(patch.contactAlt);
  if ("notifyChannel" in patch) row.notify_channel = asNotifyChannel(patch.notifyChannel);
  if (!Object.keys(row).length) return { error: null };
  const { data, error } = await db.from("profiles").update(row).eq("member_id", memberId).select("member_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "not-saved" as const };
  return { error: null };
}

export async function loadPublicNames(memberIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!ids.length) return map;
  const db = getSupabase();
  if (!db) return map;
  const { data } = await db.rpc("public_display_names", { p_ids: ids });
  for (const row of data ?? []) {
    const name = String(row.display_name ?? "").trim();
    if (name) map.set(row.member_id as string, name);
  }
  return map;
}

export function livePeopleReady() {
  return isLiveData();
}
