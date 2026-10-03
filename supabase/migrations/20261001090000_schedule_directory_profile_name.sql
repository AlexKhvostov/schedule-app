-- Keep the public profile name in the single schedule directory snapshot.

drop function if exists schedule_player_directory(text, text[]);

create function schedule_player_directory(
  p_variant text default null,
  p_limit_ids text[] default null
)
returns table (
  member_id uuid,
  public_code text,
  mark_tag text,
  mark_bg text,
  mark_fg text,
  tables smallint,
  grid_priority integer,
  vip_nitro integer,
  vip_regular integer,
  provider_uid text,
  username text,
  display_name text,
  guild_nick text,
  avatar_url text,
  discord_username text,
  discord_global_name text,
  discord_guild_nick text,
  discord_avatar_url text,
  room_nick text,
  profile_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.public_code,
    m.mark_tag,
    m.mark_bg,
    m.mark_fg,
    m.tables,
    m.grid_priority,
    m.vip_nitro,
    m.vip_regular,
    i.provider_uid,
    i.username,
    i.display_name,
    i.guild_nick,
    i.avatar_url,
    d.username,
    d.global_name,
    d.guild_nick,
    d.avatar_url,
    room.nick,
    profile.display_name
  from members m
  left join identities i on i.member_id = m.id and i.provider = 'discord'
  left join discord_members d on d.discord_id = i.provider_uid
  left join profiles profile on profile.member_id = m.id
  left join lateral (
    select pn.nick
    from players player
    join rooms r on r.id = player.room_id and r.slug = 'winamax'
    join player_nicks pn on pn.player_id = player.id
    where player.member_id = m.id
    order by pn.at desc, pn.id desc
    limit 1
  ) room on true
  where m.access_status = 'active'
    and (
      current_has_permission('schedule')
      or current_has_permission('schedule.manage')
    )
    and (
      (
        p_variant is null
        and exists (
          select 1
          from schedule_kinds sk
          where member_has_schedule_limit(m.id, sk.variant_id, sk.limit_id)
        )
      )
      or (
        p_variant is not null
        and coalesce(cardinality(p_limit_ids), 0) > 0
        and exists (
          select 1
          from players player
          join rooms r on r.id = player.room_id and r.slug = 'winamax'
          join player_limits pl on pl.player_id = player.id
          where player.member_id = m.id
            and pl.variant_id = p_variant
            and pl.limit_id = any(p_limit_ids)
            and member_has_schedule_limit(m.id, pl.variant_id, pl.limit_id)
        )
      )
    )
  order by coalesce(d.guild_nick, d.global_name, d.username, i.guild_nick, i.display_name, i.username, m.public_code);
$$;

revoke all on function schedule_player_directory(text, text[]) from public, anon;
grant execute on function schedule_player_directory(text, text[]) to authenticated;

comment on function schedule_player_directory(text, text[]) is
  'One round-trip player directory with effective Discord role access and the public profile name.';
