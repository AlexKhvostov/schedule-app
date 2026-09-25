-- Consolidate chatty client-side joins and multi-step writes into atomic RPCs.

create or replace function admin_people_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'discord', coalesce((
      select jsonb_agg(jsonb_build_object(
        'discord_id', d.discord_id, 'username', d.username, 'global_name', d.global_name,
        'guild_nick', d.guild_nick, 'avatar_url', d.avatar_url, 'bot', d.bot,
        'joined_at', d.joined_at, 'roles', d.roles, 'present', d.present
      )) from discord_members d
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'public_code', m.public_code, 'access_status', m.access_status,
        'block_reason', m.block_reason, 'community_status', m.community_status,
        'guarantor_id', m.guarantor_id, 'mark_tag', m.mark_tag, 'mark_bg', m.mark_bg,
        'mark_fg', m.mark_fg, 'tables', m.tables, 'grid_priority', m.grid_priority,
        'vip_nitro', m.vip_nitro, 'vip_regular', m.vip_regular,
        'distance_ext_id', m.distance_ext_id, 'auth_user_id', m.auth_user_id,
        'created_at', m.created_at, 'approved_at', m.approved_at
      )) from members m
    ), '[]'::jsonb),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', i.member_id, 'provider', i.provider, 'provider_uid', i.provider_uid,
        'username', i.username, 'display_name', i.display_name, 'guild_nick', i.guild_nick,
        'avatar_url', i.avatar_url, 'guild_present', i.guild_present,
        'discord_roles', i.discord_roles
      )) from identities i
    ), '[]'::jsonb),
    'member_roles', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', mr.member_id, 'role_id', mr.role_id))
      from member_roles mr
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', p.member_id, 'display_name', p.display_name, 'email', p.email,
        'phone', p.phone, 'city', p.city, 'country', p.country, 'birthday', p.birthday,
        'show_extra_tz', p.show_extra_tz, 'extra_utc', p.extra_utc,
        'telegram', p.telegram, 'contact_alt', p.contact_alt, 'notify_channel', p.notify_channel
      )) from profiles p
    ), '[]'::jsonb),
    'distance_map', coalesce((
      select jsonb_agg(jsonb_build_object('discord_id', x.discord_id, 'distance_ext_id', x.distance_ext_id))
      from discord_distance_ids x
    ), '[]'::jsonb),
    'role_catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_id', r.role_id, 'position', r.position,
        'display_order', r.display_order, 'admin_visible', r.admin_visible
      )) from discord_guild_roles r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function admin_people_snapshot() from public, anon;
grant execute on function admin_people_snapshot() to authenticated;

create or replace function schedule_player_directory(
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
  room_nick text
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
    room.nick
  from members m
  left join identities i on i.member_id = m.id and i.provider = 'discord'
  left join discord_members d on d.discord_id = i.provider_uid
  left join lateral (
    select pn.nick
    from players p
    join rooms r on r.id = p.room_id and r.slug = 'winamax'
    join player_nicks pn on pn.player_id = p.id
    where p.member_id = m.id
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
          from players p
          join rooms r on r.id = p.room_id and r.slug = 'winamax'
          join player_limits pl on pl.player_id = p.id
          where p.member_id = m.id
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

create or replace function save_member_plays(p_member_id uuid, p_plays jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  v_room_id uuid;
  v_player_id uuid;
  kept uuid[] := '{}'::uuid[];
  room_slug text;
  nick_value text;
begin
  if p_member_id is null or not (p_member_id = current_member_id() or is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_plays, '[]'::jsonb)) <> 'array' then
    raise exception 'plays-must-be-array';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_plays, '[]'::jsonb)) loop
    room_slug := trim(coalesce(item ->> 'roomId', ''));
    select id into v_room_id from rooms where slug = room_slug;
    if v_room_id is null then raise exception 'unknown-room:%', room_slug; end if;

    insert into players (member_id, room_id)
    values (p_member_id, v_room_id)
    on conflict (member_id, room_id) do update set room_id = excluded.room_id
    returning id into v_player_id;
    kept := array_append(kept, v_player_id);

    delete from player_limits where player_limits.player_id = v_player_id;
    insert into player_limits (player_id, variant_id, limit_id)
    select v_player_id, variant_id, limit_id
    from (
      select 'nitro'::text variant_id, trim(value) limit_id
      from jsonb_array_elements_text(coalesce(item -> 'nitroLimits', '[]'::jsonb))
      union
      select 'regular'::text, trim(value)
      from jsonb_array_elements_text(coalesce(item -> 'regularLimits', '[]'::jsonb))
    ) limits
    where limit_id <> '';

    nick_value := trim(coalesce(item ->> 'nick', ''));
    if nick_value <> '' and nick_value is distinct from (
      select pn.nick from player_nicks pn
      where pn.player_id = v_player_id
      order by pn.at desc, pn.id desc limit 1
    ) then
      insert into player_nicks (player_id, nick) values (v_player_id, nick_value);
    end if;
  end loop;

  delete from players
  where member_id = p_member_id
    and not (id = any(kept));
end;
$$;

revoke all on function save_member_plays(uuid, jsonb) from public, anon;
grant execute on function save_member_plays(uuid, jsonb) to authenticated;

create or replace function save_payment_methods(p_member_id uuid, p_rows jsonb)
returns setof payment_methods
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  row_id uuid;
  primary_id uuid;
begin
  if p_member_id is null or not (p_member_id = current_member_id() or is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'payment-methods-must-be-array';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 20 then
    raise exception 'too-many-payment-methods';
  end if;

  delete from payment_methods pm
  where pm.member_id = p_member_id
    and pm.id not in (
      select (value ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
      where value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
  update payment_methods set is_primary = false where member_id = p_member_id and is_primary;

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    row_id := case
      when item ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (item ->> 'id')::uuid
      else null
    end;
    if row_id is not null then
      update payment_methods
      set kind = coalesce(item ->> 'kind', 'custom'),
          title = coalesce(item ->> 'title', ''),
          details = coalesce(item ->> 'details', ''),
          comment = coalesce(item ->> 'comment', ''),
          sort_n = coalesce((item ->> 'sort')::integer, 0)
      where id = row_id and member_id = p_member_id;
      if not found then row_id := null; end if;
    end if;
    if row_id is null then
      insert into payment_methods (member_id, kind, title, details, comment, is_primary, sort_n)
      values (
        p_member_id,
        coalesce(item ->> 'kind', 'custom'),
        coalesce(item ->> 'title', ''),
        coalesce(item ->> 'details', ''),
        coalesce(item ->> 'comment', ''),
        false,
        coalesce((item ->> 'sort')::integer, 0)
      ) returning id into row_id;
    end if;
    if coalesce((item ->> 'primary')::boolean, false) and primary_id is null then
      primary_id := row_id;
    end if;
  end loop;

  if primary_id is null then
    select id into primary_id from payment_methods
    where member_id = p_member_id
    order by (kind = 'usdt_trc20') desc, sort_n, created_at
    limit 1;
  end if;
  if primary_id is not null then
    update payment_methods set is_primary = true
    where id = primary_id and member_id = p_member_id;
  end if;

  return query
    select pm.* from payment_methods pm
    where pm.member_id = p_member_id
    order by pm.sort_n, pm.created_at;
end;
$$;

revoke all on function save_payment_methods(uuid, jsonb) from public, anon;
grant execute on function save_payment_methods(uuid, jsonb) to authenticated;

create or replace function save_capacity_profiles(p_variant text, p_profiles jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_key text;
  profile jsonb;
  v_kind_id uuid;
  day_key text;
  hours_json jsonb;
  caps smallint[];
begin
  if not current_has_permission('schedule.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_variant not in ('nitro', 'regular') or jsonb_typeof(coalesce(p_profiles, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid-capacity-payload';
  end if;

  for limit_key, profile in select key, value from jsonb_each(p_profiles) loop
    select sk.id into v_kind_id
    from schedule_kinds sk
    join rooms r on r.id = sk.room_id and r.slug = 'winamax'
    where sk.variant_id = p_variant and sk.limit_id = limit_key
    order by sk.id limit 1;
    if v_kind_id is null then continue; end if;

    insert into capacity_flags (kind_id, equalize, week_on, month_on)
    values (
      v_kind_id,
      coalesce((profile ->> 'equalize')::boolean, false),
      coalesce((profile ->> 'weekOn')::boolean, true),
      coalesce((profile ->> 'monthOn')::boolean, true)
    )
    on conflict (kind_id) do update
    set equalize = excluded.equalize,
        week_on = excluded.week_on,
        month_on = excluded.month_on;

    delete from capacity_rules where capacity_rules.kind_id = v_kind_id;
    select array_agg(value::smallint order by ordinality) into caps
    from jsonb_array_elements_text(profile -> 'hours') with ordinality;
    if cardinality(caps) <> 24 then raise exception 'capacity-hours-must-have-24-values'; end if;
    insert into capacity_rules (kind_id, layer, hours) values (v_kind_id, 'base', caps);

    for day_key, hours_json in select key, value from jsonb_each(coalesce(profile -> 'days', '{}'::jsonb)) loop
      select array_agg(value::smallint order by ordinality) into caps
      from jsonb_array_elements_text(hours_json) with ordinality;
      if cardinality(caps) <> 24 then raise exception 'capacity-hours-must-have-24-values'; end if;
      insert into capacity_rules (kind_id, layer, day_of_month, hours)
      values (v_kind_id, 'month', day_key::smallint, caps);
    end loop;
    for day_key, hours_json in select key, value from jsonb_each(coalesce(profile -> 'weekdays', '{}'::jsonb)) loop
      select array_agg(value::smallint order by ordinality) into caps
      from jsonb_array_elements_text(hours_json) with ordinality;
      if cardinality(caps) <> 24 then raise exception 'capacity-hours-must-have-24-values'; end if;
      insert into capacity_rules (kind_id, layer, weekday, hours)
      values (v_kind_id, 'week', day_key::smallint, caps);
    end loop;
  end loop;
end;
$$;

revoke all on function save_capacity_profiles(text, jsonb) from public, anon;
grant execute on function save_capacity_profiles(text, jsonb) to authenticated;

comment on function schedule_player_directory(text, text[]) is
  'One round-trip player directory using effective Discord role schedule access.';
comment on function admin_people_snapshot() is
  'One consistent admin-only snapshot for the people management screen.';
comment on function save_member_plays(uuid, jsonb) is
  'Atomically replace room limits, append changed nick history, and remove omitted rooms.';
comment on function save_payment_methods(uuid, jsonb) is
  'Atomically reconcile a member payment-method list and its primary row.';
comment on function save_capacity_profiles(text, jsonb) is
  'Atomically replace capacity flags and rules for one schedule variant.';
