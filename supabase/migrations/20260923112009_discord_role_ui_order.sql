-- Admin-defined role order. Discord's position remains untouched and continues
-- to be refreshed by the bot.
alter table discord_guild_roles
  add column if not exists display_order integer;

update discord_guild_roles
set display_order = position
where display_order is null;

create or replace function save_discord_role_order(p_role_ids jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'forbidden';
  end if;

  if jsonb_typeof(p_role_ids) is distinct from 'array' then
    raise exception 'role order must be an array';
  end if;

  update discord_guild_roles r
  set display_order = ordered.sort
  from (
    select value #>> '{}' as role_id, ordinality::integer as sort
    from jsonb_array_elements(p_role_ids) with ordinality
  ) ordered
  where r.role_id = ordered.role_id;
end;
$$;

grant update (display_order) on discord_guild_roles to authenticated;

create policy discord_guild_roles_order_write on discord_guild_roles
  for update to authenticated
  using (is_staff())
  with check (is_staff());

revoke all on function save_discord_role_order(jsonb) from public;
grant execute on function save_discord_role_order(jsonb) to authenticated;
