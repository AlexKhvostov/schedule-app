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
    select
      value #>> '{}' as role_id,
      (jsonb_array_length(p_role_ids) - ordinality)::integer as sort
    from jsonb_array_elements(p_role_ids) with ordinality
  ) ordered
  where r.role_id = ordered.role_id;
end;
$$;
