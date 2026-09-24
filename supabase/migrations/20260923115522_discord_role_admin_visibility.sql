-- Roles shown above the collapsible "unused roles" divider in the admin UI.
-- Discord synchronization does not touch this application-only preference.
alter table discord_guild_roles
  add column if not exists admin_visible boolean not null default false;

update discord_guild_roles r
set admin_visible = true
where exists (
  select 1
  from discord_role_permissions p
  where p.role_id = r.role_id
);

grant update (admin_visible) on discord_guild_roles to authenticated;
