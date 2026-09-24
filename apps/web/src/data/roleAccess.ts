import { getSupabase } from "./client";

export type RoleAccessRow = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  displayOrder: number;
  adminVisible: boolean;
  present: boolean;
  permissions: string[];
  limits: { variant: "nitro" | "regular"; limit: string }[];
};

export type PermissionRow = { code: string; title: string };

export async function loadRoleAccess() {
  const db = getSupabase();
  if (!db) return { roles: [] as RoleAccessRow[], permissions: [] as PermissionRow[] };
  const [{ data: roles }, { data: permissions }, { data: grants }, { data: limits }] = await Promise.all([
    db.from("discord_guild_roles").select("role_id,name,color,position,display_order,admin_visible,present").order("display_order", { ascending: false }),
    db.from("app_permissions").select("code,title").order("sort"),
    db.from("discord_role_permissions").select("role_id,permission_code"),
    db.from("discord_role_schedule_limits").select("role_id,variant_id,limit_id"),
  ]);
  const permissionMap = new Map<string, string[]>();
  for (const grant of grants ?? []) {
    const list = permissionMap.get(grant.role_id) ?? [];
    list.push(grant.permission_code);
    permissionMap.set(grant.role_id, list);
  }
  const limitMap = new Map<string, RoleAccessRow["limits"]>();
  for (const limit of limits ?? []) {
    if (limit.variant_id !== "nitro" && limit.variant_id !== "regular") continue;
    const list = limitMap.get(limit.role_id) ?? [];
    list.push({ variant: limit.variant_id, limit: limit.limit_id });
    limitMap.set(limit.role_id, list);
  }
  return {
    roles: (roles ?? []).map((role) => ({
      id: role.role_id,
      name: role.name,
      color: role.color,
      position: role.position,
      displayOrder: role.display_order ?? role.position,
      adminVisible: Boolean(role.admin_visible),
      present: role.present,
      permissions: permissionMap.get(role.role_id) ?? [],
      limits: limitMap.get(role.role_id) ?? [],
    })),
    permissions: (permissions ?? []) as PermissionRow[],
  };
}

export async function saveRoleOrder(roleIds: string[]) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.rpc("save_discord_role_order", { p_role_ids: roleIds });
  return { error: error?.message ?? null };
}

export async function setRoleAdminVisible(roleId: string, visible: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const { error } = await db.from("discord_guild_roles").update({ admin_visible: visible }).eq("role_id", roleId);
  return { error: error?.message ?? null };
}

export async function setRolePermission(roleId: string, permission: string, on: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const query = on
    ? db.from("discord_role_permissions").upsert({ role_id: roleId, permission_code: permission })
    : db.from("discord_role_permissions").delete().eq("role_id", roleId).eq("permission_code", permission);
  const { error } = await query;
  return { error: error?.message ?? null };
}

export async function setRoleLimit(roleId: string, variant: "nitro" | "regular", limit: string, on: boolean) {
  const db = getSupabase();
  if (!db) return { error: "not-configured" as const };
  const query = on
    ? db.from("discord_role_schedule_limits").upsert({ role_id: roleId, variant_id: variant, limit_id: limit })
    : db
        .from("discord_role_schedule_limits")
        .delete()
        .eq("role_id", roleId)
        .eq("variant_id", variant)
        .eq("limit_id", limit);
  const { error } = await query;
  return { error: error?.message ?? null };
}
