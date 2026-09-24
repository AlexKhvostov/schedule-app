-- One round-trip for the live grid: seats plus current faces (mark, Discord, Winamax).
-- Nicks stay live (not copied onto occupancy). Index covers "my slots this month".

create index if not exists occupancy_member_date on occupancy (member_id, slot_date);
create index if not exists identities_member_id_idx on identities (member_id);

create or replace function load_month_schedule(
  p_year integer,
  p_month integer,
  p_variant text,
  p_limit_ids text[]
)
returns table (
  member_id uuid,
  limit_id text,
  slot_date date,
  half smallint,
  level smallint,
  tables smallint,
  mark_tag text,
  mark_bg text,
  mark_fg text,
  member_tables smallint,
  discord text,
  room_nick text,
  avatar_url text,
  username text,
  global_name text,
  grid_priority integer,
  vip_nitro integer,
  vip_regular integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date;
  to_date date;
begin
  if not (
    current_has_permission('schedule')
    or current_has_permission('schedule.manage')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_year is null or p_month not between 1 and 12 then
    return;
  end if;
  if p_variant is distinct from 'nitro' and p_variant is distinct from 'regular' then
    return;
  end if;
  if p_limit_ids is null or cardinality(p_limit_ids) = 0 then
    return;
  end if;

  from_date := make_date(p_year, p_month, 1);
  to_date := (from_date + interval '1 month' - interval '1 day')::date;

  return query
  select
    o.member_id,
    k.limit_id,
    o.slot_date,
    o.half,
    o.level,
    o.tables,
    m.mark_tag,
    m.mark_bg,
    m.mark_fg,
    m.tables,
    coalesce(
      nullif(d.guild_nick, ''),
      nullif(ident.guild_nick, ''),
      nullif(d.username, ''),
      nullif(ident.username, ''),
      ident.display_name,
      ''
    ),
    coalesce(room.nick, ''),
    coalesce(nullif(d.avatar_url, ''), ident.avatar_url, ''),
    coalesce(nullif(d.username, ''), ident.username, ''),
    coalesce(nullif(d.global_name, ''), ident.display_name, ''),
    m.grid_priority,
    m.vip_nitro,
    m.vip_regular
  from occupancy o
  join schedule_kinds k on k.id = o.kind_id
  join members m on m.id = o.member_id
  left join lateral (
    select i.provider_uid, i.username, i.display_name, i.guild_nick, i.avatar_url
    from identities i
    where i.member_id = m.id and i.provider = 'discord'
    limit 1
  ) ident on true
  left join discord_members d on d.discord_id = ident.provider_uid
  left join lateral (
    select n.nick
    from players p
    join rooms r on r.id = p.room_id and r.slug = 'winamax'
    join player_nicks n on n.player_id = p.id
    where p.member_id = m.id
    order by n.at desc
    limit 1
  ) room on true
  where k.variant_id = p_variant
    and k.limit_id = any (p_limit_ids)
    and o.slot_date >= from_date
    and o.slot_date <= to_date;
end;
$$;

comment on function load_month_schedule(integer, integer, text, text[]) is
  'Month grid in one round-trip: occupancy plus current mark, Discord nick, Winamax nick, avatar.';

revoke all on function load_month_schedule(integer, integer, text, text[]) from public, anon;
grant execute on function load_month_schedule(integer, integer, text, text[]) to authenticated;
