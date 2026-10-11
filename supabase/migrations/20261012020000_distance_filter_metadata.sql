-- Read current Discord roles and active-profile status for every distance row,
-- including historical entries without an active playing card.
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
        'discord_nick', coalesce(dm.guild_nick, dm.global_name, dm.username, i.guild_nick, i.display_name, i.username, p.display_name, ''),
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'has_active_profile', p.member_id is not null,
        'game_nick', coalesce(pn.nick, '')
      ) order by coalesce(dm.guild_nick, dm.global_name, dm.username, i.display_name, p.display_name, m.public_code))
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
        'discord_nick', coalesce(dm.guild_nick, dm.global_name, dm.username, i.guild_nick, i.display_name, i.username, ''),
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
revoke all on function public.admin_distance_book(date,text) from public, anon;
grant execute on function public.admin_distance_book(date,text) to authenticated;
