create or replace function public.priority_source(p_period_start date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_room uuid; v_rp text; v_today date := (now() at time zone 'Europe/Minsk')::date; v_result jsonb;
begin
  if p_period_start is null or extract(day from p_period_start) <> 1
    or extract(month from p_period_start) not in (2,5,8,11)
    or extract(year from p_period_start) not between 2000 and 2100 then
    raise exception 'priority-bad-period' using errcode = '22023';
  end if;
  select id into v_room from rooms where slug = 'winamax';
  select coalesce(required_discord_role_id,'1208022351652986891') into v_rp from club_settings where id = true;
  v_result := jsonb_build_object(
    'periodStart', p_period_start, 'today', v_today, 'canManage', is_staff(),
    'lastMonthEntries', (select count(*) from distance_entries e where e.room_id = v_room
      and e.month_start = (p_period_start - interval '1 month')::date and e.variant_id in ('nitro','regular')
      and exists(select 1 from distance_values v where v.entry_id=e.id and v.limit_id in ('50','100'))),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', m.id,
        'nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, m.public_code),
        'gameNick', coalesce(pn.nick,''),
        'avatarUrl', coalesce(dm.avatar_url, i.avatar_url),
        'redParty', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'=v_rp),
        'team50', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'='1208022278088949770'),
        'discordRoles', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r->>'id', 'name', coalesce(gr.name, r->>'name', r->>'id'),
          'color', coalesce(gr.color, r->>'color')) order by r->>'id')
          from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r
          left join discord_guild_roles gr on gr.role_id=r->>'id'
          where coalesce(dm.present,i.guild_present,false) and r->>'id' is not null), '[]'::jsonb),
        'hasActiveProfile', m.access_status='active' and exists(select 1 from profiles p where p.member_id=m.id),
        'plays', coalesce((select jsonb_agg(x.variant_id order by x.variant_id) from
          (select distinct l.variant_id from player_limits l where l.player_id=pl.id and l.variant_id in ('nitro','regular')) x), '[]'::jsonb),
        'vipNitro', m.vip_nitro, 'vipRegular', m.vip_regular,
        'excludedNitro', coalesce(s.excluded_nitro,false), 'excludedRegular', coalesce(s.excluded_regular,false),
        'entries', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'month', e.month_start, 'variant', e.variant_id, 'part', e.part,
          'values', coalesce((select jsonb_agg(jsonb_build_object('limit',v.limit_id,'tournaments',v.tournaments) order by v.limit_id)
            from distance_values v where v.entry_id=e.id and v.limit_id in ('50','100')), '[]'::jsonb)
          ) order by e.month_start,e.variant_id,e.part,e.id)
          from distance_entries e where e.room_id=v_room and e.variant_id in ('nitro','regular')
            and e.month_start >= (p_period_start-interval '6 months')::date and e.month_start < p_period_start
            and coalesce(e.member_id,
              (select x.member_id from identities x where x.provider='discord' and x.provider_uid=e.discord_id limit 1),
              (select x.id from members x where x.distance_ext_id=e.distance_ext_id limit 1))=m.id), '[]'::jsonb)
      ) order by m.id)
      from members m left join players pl on pl.member_id=m.id and pl.room_id=v_room
      left join priority_member_settings s on s.member_id=m.id
      left join lateral(select x.* from identities x where x.member_id=m.id and x.provider='discord' order by x.id limit 1) i on true
      left join discord_members dm on dm.discord_id=i.provider_uid
      left join lateral(select n.nick from player_nicks n where n.player_id=pl.id order by n.at desc,n.id desc limit 1) pn on true
    ), '[]'::jsonb)
  );
  return v_result || jsonb_build_object('revision',md5((v_result->'people')::text));
end;
$$;

update public.priority_rating_cache set dirty=true;

create or replace function public.admin_distance_book(p_month_start date, p_room_slug text default 'winamax')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_room uuid;
begin
  if not current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  return jsonb_build_object(
    'people_filters_version', 1,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id, 'distance_ext_id', m.distance_ext_id,
        'discord_id', i.provider_uid,
        'discord_nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, ''),
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'has_active_profile', p.member_id is not null,
        'game_nick', coalesce(pn.nick, '')
      ) order by coalesce(dm.global_name, i.display_name, dm.username, i.username, m.public_code))
      from members m
      left join profiles p on p.member_id = m.id
      left join lateral (
        select x.* from identities x where x.member_id = m.id and x.provider = 'discord' limit 1
      ) i on true
      left join discord_members dm on dm.discord_id = i.provider_uid
      left join players pl on pl.member_id = m.id and pl.room_id = v_room
      left join lateral (
        select n.nick from player_nicks n where n.player_id = pl.id order by n.at desc, n.id desc limit 1
      ) pn on true
      where m.access_status = 'active'
        and exists (select 1 from member_roles mr where mr.member_id = m.id and mr.role_id in ('member', 'admin'))
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'member_id', e.member_id, 'distance_ext_id', e.distance_ext_id,
        'discord_id', e.discord_id, 'game_nick', e.game_nick, 'variant_id', e.variant_id,
        'part', e.part, 'comment', e.comment, 'source', e.source,
        'created_at', e.created_at, 'updated_at', e.updated_at,
        'created_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.created_by),
        'updated_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.updated_by),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'profile_member_id', m.id,
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'discord_nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, ''),
        'has_active_profile', coalesce(m.access_status = 'active', false) and exists(select 1 from profiles p where p.member_id = m.id),
        'values', coalesce((select jsonb_agg(jsonb_build_object('limit_id', v.limit_id, 'tournaments', v.tournaments)) from distance_values v where v.entry_id = e.id), '[]'::jsonb)
      ) order by e.distance_ext_id, e.variant_id, e.part)
      from distance_entries e
      left join lateral (
        select x.* from identities x
        where x.provider = 'discord' and (
          (e.member_id is not null and x.member_id = e.member_id)
          or (e.member_id is null and x.provider_uid = e.discord_id)
        ) limit 1
      ) i on true
      left join discord_members dm on dm.discord_id = coalesce(i.provider_uid, e.discord_id)
      left join members m on m.id = coalesce(e.member_id, i.member_id)
      where e.month_start = p_month_start and e.room_id = v_room
    ), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(l.id order by l.sort, l.id) from limits l), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(x.month_start order by x.month_start desc) from (select distinct month_start from distance_entries) x), '[]'::jsonb)
  );
end;
$$;
