-- Private integer keys store relative order; all public numbers are positions 1..N.
create table schedule_private.club_order (
  member_id uuid primary key references public.members(id) on delete cascade,
  ordinal bigint not null check (ordinal between 1 and 9007199254740991),
  constraint club_order_ordinal_key unique (ordinal) deferrable initially immediate
);
alter table schedule_private.club_order enable row level security;
revoke all on schedule_private.club_order from public,anon,authenticated;

-- FK cascades run before the member's AFTER triggers. Acquire the semantic
-- locks before any cascade can lock an order row, matching notify_domains'
-- access -> directory order and avoiding a cycle with manual saves.
create function schedule_private.lock_club_order_member_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from schedule_private.sync_versions where key='access' for update;
  perform 1 from schedule_private.sync_versions where key='directory' for update;
  return null;
end;
$$;
revoke all on function schedule_private.lock_club_order_member_delete() from public,anon,authenticated;
create trigger club_order_member_deleting before delete on public.members
  for each statement execute function schedule_private.lock_club_order_member_delete();

create function schedule_private.club_order_members() returns table(member_id uuid)
language sql stable security definer set search_path='' as $$
  select distinct m.id from public.members m
  join public.identities i on i.member_id=m.id and i.provider='discord'
  cross join public.club_settings s
  left join public.discord_members d on d.discord_id=i.provider_uid
  where s.id and coalesce(d.present,i.guild_present,false) and not coalesce(d.bot,false)
    and exists(select 1 from jsonb_array_elements(coalesce(d.roles,i.discord_roles,'[]')) r
      where r->>'id'=s.required_discord_role_id);
$$;
revoke all on function schedule_private.club_order_members() from public,anon,authenticated;

-- Initialize eligible members once; invalid/missing/colliding ID-derived values
-- are appended deterministically after all valid values. Never renumber on import.
with candidates as (
  select m.id,case when m.distance_ext_id ~ '^[0-9]{1,12}$' and m.distance_ext_id::numeric>100
    then m.distance_ext_id::bigint-100 end as ordinal
  from public.members m join schedule_private.club_order_members() e on e.member_id=m.id
), winners as (
  select id,ordinal,row_number() over(partition by ordinal order by id) as n from candidates
)
insert into schedule_private.club_order(member_id,ordinal)
select id,ordinal from winners where ordinal is not null and n=1;

create function schedule_private.reconcile_club_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare max_order bigint;
begin
  -- Existing semantic writes acquire directory before this AFTER STATEMENT
  -- trigger. Manual saves use the same lock, serializing max+1 and swaps.
  perform 1 from schedule_private.sync_versions where key='directory' for update;
  delete from schedule_private.club_order o where not exists(
    select 1 from schedule_private.club_order_members() e where e.member_id=o.member_id);
  select coalesce(max(ordinal),0) into max_order from schedule_private.club_order;
  insert into schedule_private.club_order(member_id,ordinal)
  select e.member_id,max_order+row_number() over(order by m.created_at,m.id)
  from schedule_private.club_order_members() e join public.members m on m.id=e.member_id
  where not exists(select 1 from schedule_private.club_order o where o.member_id=e.member_id);
  return null;
end;
$$;
revoke all on function schedule_private.reconcile_club_order() from public,anon,authenticated;
create trigger club_order_changed after insert or update or delete on schedule_private.club_order
  for each row execute function schedule_private.notify_domains('directory','priorities');
create trigger club_order_members_changed after insert or delete on public.members
  for each statement execute function schedule_private.reconcile_club_order();
create trigger club_order_identity_changed after insert or update of member_id,provider,provider_uid,guild_present,discord_roles or delete on public.identities
  for each statement execute function schedule_private.reconcile_club_order();
create trigger club_order_discord_changed after insert or update of discord_id,present,roles,bot or delete on public.discord_members
  for each statement execute function schedule_private.reconcile_club_order();
create trigger club_order_role_changed after update of required_discord_role_id on public.club_settings
  for each statement execute function schedule_private.reconcile_club_order();

-- Run the append logic without changing protected club settings.
insert into schedule_private.club_order(member_id,ordinal)
select e.member_id,(select coalesce(max(ordinal),0) from schedule_private.club_order)
  +row_number() over(order by m.created_at,m.id)
from schedule_private.club_order_members() e join public.members m on m.id=e.member_id
where not exists(select 1 from schedule_private.club_order o where o.member_id=e.member_id);

-- Rank the complete RedParty list before any user-facing filter is applied.
create view schedule_private.club_order_positions as
  select member_id,row_number() over(order by ordinal,member_id) as position
  from schedule_private.club_order;
revoke all on schedule_private.club_order_positions from public,anon,authenticated;

create function schedule_private.club_order_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('rows',rows,'revision',md5(rows::text)) from (
    select coalesce(jsonb_agg(jsonb_build_object('memberId',member_id,'number',position)
      order by position),'[]') as rows from schedule_private.club_order_positions
  ) x;
$$;
revoke all on function schedule_private.club_order_snapshot() from public,anon,authenticated;

create function public.load_club_order() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.current_has_permission('admin.people') then
    raise insufficient_privilege using message='forbidden';
  end if;
  return schedule_private.club_order_snapshot();
end;
$$;
revoke all on function public.load_club_order() from public,anon;
grant execute on function public.load_club_order() to authenticated;

create function public.save_club_order(p_revision text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_rows jsonb;
begin
  if auth.uid() is null or not public.current_has_permission('admin.people') then
    raise insufficient_privilege using message='forbidden';
  end if;
  perform 1 from schedule_private.sync_versions where key='directory' for update;
  current_rows:=schedule_private.club_order_snapshot();
  if p_revision is distinct from current_rows->>'revision' then
    raise exception 'club-order-stale' using errcode='40001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10000 then
    raise invalid_parameter_value using message='club-order-invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r)<>'object' or (r->>'number') is null or (r->>'number') !~ '^[1-9][0-9]{0,15}$'
    or (r->>'memberId') is null) then
    raise invalid_parameter_value using message='club-order-invalid';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r("memberId" uuid,number numeric)
    where number>jsonb_array_length(p_rows)) or
    (select count(*)<>count(distinct r."memberId") or count(*)<>count(distinct r.number)
      from jsonb_to_recordset(p_rows) r("memberId" uuid,number bigint)) or
    exists(select member_id from schedule_private.club_order except
      select r."memberId" from jsonb_to_recordset(p_rows) r("memberId" uuid)) or
    exists(select r."memberId" from jsonb_to_recordset(p_rows) r("memberId" uuid) except
      select member_id from schedule_private.club_order) then
    raise invalid_parameter_value using message='club-order-invalid';
  end if;
  set constraints schedule_private.club_order_ordinal_key deferred;
  -- Reuse existing keys, rotating only the moved interval. No free key between
  -- neighbours is required, and intentional internal gaps remain private.
  with keys as materialized (
    select ordinal,row_number() over(order by ordinal,member_id) as position
    from schedule_private.club_order
  )
  update schedule_private.club_order o set ordinal=k.ordinal
    from jsonb_to_recordset(p_rows) r("memberId" uuid,number bigint)
    join keys k on k.position=r.number
    where o.member_id=r."memberId" and o.ordinal<>k.ordinal;
  set constraints schedule_private.club_order_ordinal_key immediate;
  return schedule_private.club_order_snapshot();
end;
$$;
revoke all on function public.save_club_order(text,jsonb) from public,anon;
grant execute on function public.save_club_order(text,jsonb) to authenticated;


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
        'mark_fg', m.mark_fg, 'tables', m.tables, 'grid_priority', m.grid_priority, 'club_order',(select position from schedule_private.club_order_positions where member_id=m.id),
        'core_nitro_250',m.core_nitro_250,'core_regular_250',m.core_regular_250,'vip_nitro', m.vip_nitro, 'vip_regular', m.vip_regular,
        'distance_ext_id', m.distance_ext_id, 'distance_ids', to_jsonb(member_distance_id_list(m.id)), 'auth_user_id', m.auth_user_id,
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
      from (select i.provider_uid discord_id,l.distance_ext_id from member_distance_ids l join identities i on i.member_id=l.member_id and i.provider='discord' where l.is_primary) x
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

create or replace function public.priority_slice_source(p_period_start date, p_variant text, p_group text, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cache public.priority_rating_cache%rowtype; v_source jsonb; v_person jsonb; v_old jsonb;
  v_people jsonb := '[]'::jsonb; v_entries jsonb; v_months jsonb; v_cells jsonb; v_points jsonb;
  v_calc jsonb; v_core public.members%rowtype; v_count integer;
begin
  if p_variant is null or p_variant not in ('nitro','regular') or p_group is null or p_group not in ('50-100','250') then
    raise exception 'priority-bad-slice' using errcode='22023';
  end if;
  if p_period_start is null or extract(day from p_period_start) <> 1 or extract(month from p_period_start) not in (2,5,8,11)
    or extract(year from p_period_start) not between 2000 and 2100 then raise exception 'priority-bad-period' using errcode='22023'; end if;
  insert into public.priority_rating_cache(period_start,variant_id,limit_group) values(p_period_start,p_variant,p_group) on conflict do nothing;
  -- Serialize concurrent rebuilds. A concurrent input writer marks dirty after this lock is released.
  select * into v_cache from public.priority_rating_cache where period_start=p_period_start and variant_id=p_variant and limit_group=p_group for update;
  if v_cache.dirty or p_force or v_cache.payload is null then
    v_source := public.priority_source(p_period_start);
    for v_person in select value from jsonb_array_elements(v_source->'people') loop
      select * into v_core from public.members where id=(v_person->>'memberId')::uuid;
      select coalesce(jsonb_agg(e order by e->>'month',e->>'id'),'[]') into v_entries
        from jsonb_array_elements(v_person->'entries') e where p_group='50-100' and e->>'variant'=p_variant;
      select x into v_old from jsonb_array_elements(v_cache.payload->'people') x where x->>'memberId'=v_person->>'memberId';
      -- Metadata/Core changes reuse exactly the same saved distance calculation.
      if not p_force and v_old->'entries'=v_entries then v_calc := v_old->'calculation'; else v_calc := null; end if;
      if v_calc is null then
        with months as (
          select (p_period_start + make_interval(months => i))::date as month, i+6 as idx from generate_series(-6,-1) i
        ), totals as (
          select m.month,m.idx, coalesce(sum((v->>'tournaments')::bigint) filter(where v->>'limit'='50'),0) as n50,
            coalesce(sum((v->>'tournaments')::bigint) filter(where v->>'limit'='100'),0) as n100
          from months m left join jsonb_array_elements(v_entries) e on (e->>'month')::date=m.month
          left join lateral jsonb_array_elements(e->'values') v on true group by m.month,m.idx
        ) select jsonb_agg(jsonb_build_object('month',month,
            'nitro50',case when p_variant='nitro' then n50 else 0 end,'regular50',case when p_variant='regular' then n50 else 0 end,
            'nitro100',case when p_variant='nitro' then n100 else 0 end,'regular100',case when p_variant='regular' then n100 else 0 end) order by idx),
          jsonb_build_array(sum(n50) filter(where idx<3),sum(n100) filter(where idx<3),sum(n50) filter(where idx>=3),sum(n100) filter(where idx>=3))
          into v_months,v_cells from totals;
        v_points := jsonb_build_array((v_cells->>0)::numeric*0.5,(v_cells->>1)::numeric,(v_cells->>2)::numeric,(v_cells->>3)::numeric*2);
        v_calc := jsonb_build_object('periodStart',p_period_start,'kind',p_variant,'group',p_group,'months',v_months,'distanceCells',v_cells,'pointCells',v_points,
          'total',(select sum(value::numeric) from jsonb_array_elements_text(v_points)));
      end if;
      v_person := v_person || jsonb_build_object('entries',v_entries,'coreNitro250',v_core.core_nitro_250,'coreRegular250',v_core.core_regular_250,'calculation',v_calc,
        'plays',coalesce((select jsonb_agg(distinct l.variant_id) from public.player_limits l join public.players pl on pl.id=l.player_id
          join public.rooms r on r.id=pl.room_id where pl.member_id=v_core.id and r.slug='winamax'
          and ((p_group='50-100' and l.limit_id in ('50','100')) or (p_group='250' and l.limit_id in ('250','500')))),'[]'::jsonb));
      v_people := v_people || jsonb_build_array(v_person);
    end loop;
    select count(*) into v_count from public.distance_entries e join public.rooms r on r.id=e.room_id
      where p_group='50-100' and r.slug='winamax' and e.variant_id=p_variant and e.month_start=(p_period_start-interval '1 month')::date
      and exists(select 1 from public.distance_values v where v.entry_id=e.id and v.limit_id in ('50','100'));
    v_source := v_source || jsonb_build_object('kind',p_variant,'group',p_group,'people',v_people,'lastMonthEntries',v_count,
      'calculatedAt',clock_timestamp(),'revision',md5(v_people::text || p_variant || p_group || p_period_start::text));
    -- Never persist caller authorization in a shared cache.
    v_source := v_source - 'canManage';
    update public.priority_rating_cache set payload=v_source, dirty=false where period_start=p_period_start and variant_id=p_variant and limit_group=p_group;
  else v_source := v_cache.payload; end if;
  -- Overlay current ordering without invalidating or recalculating distances.
  select coalesce(jsonb_agg(p.value || jsonb_build_object('clubOrder',o.position) order by p.n),'[]')
    into v_people from jsonb_array_elements(v_source->'people') with ordinality p(value,n)
    left join schedule_private.club_order_positions o on o.member_id=(p.value->>'memberId')::uuid;
  v_source:=v_source || jsonb_build_object('people',v_people,'revision',md5((v_source->>'revision')||v_people::text));
  return v_source || jsonb_build_object('today',(now() at time zone 'Europe/Minsk')::date,'canManage',public.is_staff());
end;
$$;

create or replace function public.load_month_roster(
  p_period_start date, p_variant text, p_group text, p_limit_ids text[],
  p_priority_revision text default null, p_directory_revision text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_source jsonb; v_people jsonb; v_directory jsonb;
  v_priority_revision text; v_directory_revision text;
begin
  if not public.current_has_permission('schedule') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_variant='both' and p_group='250' then
    -- The combined queue needs only Core metadata. Keep the two high Core fields
    -- independent and choose the smallest positive number when both are set.
    with core_players as materialized (
      select d as directory, d.member_id, (select position from schedule_private.club_order_positions where member_id=m.id) as club_order,
        case when m.core_nitro_250 > 0 or m.core_regular_250 > 0 then 0
          when m.vip_nitro > 0 then 1 else 2 end as tier,
        coalesce(least(nullif(m.core_nitro_250,0),nullif(m.core_regular_250,0)),
          nullif(m.vip_nitro,0),nullif(m.vip_regular,0)) as core
      from public.schedule_player_directory(null,null) d
      join public.members m on m.id=d.member_id
      where m.core_nitro_250 > 0 or m.core_regular_250 > 0 or m.vip_nitro > 0 or m.vip_regular > 0
    )
    select coalesce(jsonb_agg(jsonb_build_object('memberId',member_id,'core',core,
      'tier',tier,'score',0,'excluded',false,'clubOrder',club_order) order by member_id),'[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(directory) order by member_id),'[]'::jsonb)
    into v_people,v_directory from core_players;
    v_source := jsonb_build_object('today',(now() at time zone 'Europe/Minsk')::date,'lastMonthEntries',0);
  else
    v_source := public.priority_slice_source(p_period_start,p_variant,p_group);
    select coalesce(jsonb_agg(jsonb_build_object(
      'memberId',p->'memberId','clubOrder',p->'clubOrder',
      'core',p->case when p_group='250' then case when p_variant='nitro' then 'coreNitro250' else 'coreRegular250' end
        else case when p_variant='nitro' then 'vipNitro' else 'vipRegular' end end,
      'score',p->'calculation'->'total',
      'excluded',p->case when p_variant='nitro' then 'excludedNitro' else 'excludedRegular' end
    ) order by p->>'memberId'),'[]'::jsonb) into v_people
    from jsonb_array_elements(v_source->'people') p;
    select coalesce(jsonb_agg(to_jsonb(d) order by d.member_id),'[]'::jsonb) into v_directory
      from public.schedule_player_directory(p_variant,p_limit_ids) d;
  end if;
  -- Hash the actual projections independently. A display-name/mark/permission
  -- change must refresh the directory even when the rating revision is unchanged.
  v_priority_revision := md5(p_period_start::text || p_variant || p_group || v_people::text);
  v_directory_revision := md5(v_directory::text);
  return jsonb_build_object(
    'periodStart',p_period_start,'kind',p_variant,'group',p_group,
    'today',v_source->'today','lastMonthEntries',v_source->'lastMonthEntries','calculatedAt',v_source->'calculatedAt',
    'revision',v_priority_revision,'directoryRevision',v_directory_revision,
    'people',case when p_priority_revision=v_priority_revision then null else v_people end,
    'directory',case when p_directory_revision=v_directory_revision then null else v_directory end
  );
end;
$$;

create or replace function schedule_private.fill_order(p_queue text)
returns table(member_id uuid, name text, rank_no bigint)
language sql set search_path='' as $$
  with roster as materialized (
    select public.load_active_month_roster(p_queue,
      case when p_queue='both' then '250' else '50-100' end,
      case when p_queue='both' then array['250','500'] else array['50','100'] end) as data
  ), priorities as materialized (
    select p.* from roster r
    cross join lateral jsonb_to_recordset(r.data->'people') p("memberId" uuid,tier int,core int,score numeric,excluded bool,"clubOrder" bigint)
  ), people as (
    select distinct on (d.member_id) d.member_id,
      coalesce(nullif(d.discord_global_name,''),nullif(d.display_name,''),nullif(d.discord_username,''),
        nullif(d.username,''),d.public_code) as name,
      coalesce(p.tier,0) as tier,
      nullif(coalesce(p.core,case when p_queue='nitro' then d.vip_nitro else d.vip_regular end),0) as core,
      coalesce(p.score,0) as score,p."clubOrder" as club_order
    from roster r
    cross join lateral jsonb_to_recordset(r.data->'directory') d(member_id uuid, provider_uid text,
      discord_guild_nick text, discord_global_name text, guild_nick text, display_name text,
      discord_username text, username text, public_code text, vip_nitro int, vip_regular int)
    left join priorities p on p."memberId"=d.member_id
    where not coalesce(p.excluded,false)
    order by d.member_id,d.provider_uid
  )
  select member_id,name,row_number() over(order by tier,case when core>0 then core end nulls last,
    score desc,club_order nulls last,name collate schedule_private.fill_nickname,member_id)
  from people;
$$;

create or replace function external_api_private.read_priority() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('period_start',s.active_period,
    'revision',s.active_period::text||':'||(c.payload->>'revision')||':'||(select revision from schedule_private.sync_versions where key='directory')::text,
    'people',coalesce((select jsonb_object_agg(p->>'memberId',jsonb_build_object(
      'clubOrder',(select position from schedule_private.club_order_positions where member_id=(p->>'memberId')::uuid),'core',p->'vipNitro','score',p->'calculation'->'total','excluded',p->'excludedNitro'))
      from jsonb_array_elements(c.payload->'people') p),'{}'))
  from public.priority_settings s join public.priority_rating_cache c on c.period_start=s.active_period
    and c.variant_id='nitro' and c.limit_group='50-100'
  where s.id and not c.dirty and c.payload is not null;
$$;

create or replace function external_api_private.read_sync(p_query jsonb,p_versions jsonb,p_people jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_date date:=(p_query->>'date')::date; v_days integer:=(p_query->>'days')::integer;
  v_priority jsonb; v_versions jsonb; v_items jsonb; v_people jsonb; v_lines jsonb; v_full boolean:=p_versions is null;
begin
  v_priority:=external_api_private.read_priority();
  if v_priority is null then return jsonb_build_object('error',jsonb_build_object('code','priority_unavailable')); end if;
  select coalesce(jsonb_object_agg(v.key,v.revision),'{}') into v_versions
  from schedule_private.sync_versions v where v.key in ('config','directory','external-api-epoch') or
    (v.key>='slots:'||v_date::text||':' and v.key<'slots:'||(v_date+v_days)::text||':' and
      exists(select 1 from public.schedule_kinds k join public.rooms r on r.id=k.room_id
        where r.slug='winamax' and k.variant_id in ('nitro','regular')
          and (p_query->>'variant' is null or k.variant_id=p_query->>'variant')
          and (p_query->>'limit' is null or k.limit_id=p_query->>'limit')
          and k.id::text=split_part(v.key,':',3)));
  v_versions:=v_versions||jsonb_build_object('priority_nitro_50_100',v_priority->'revision');
  if not v_full and (v_versions->'config' is distinct from p_versions->'config' or
    v_versions->'external-api-epoch' is distinct from p_versions->'external-api-epoch') then
    return jsonb_build_object('error',jsonb_build_object('code','resync_required'));
  end if;
  if v_versions=p_versions then
    return jsonb_build_object('unchanged',true);
  end if;
  with kinds as materialized (
    select k.* from public.schedule_kinds k join public.rooms r on r.id=k.room_id
    where r.slug='winamax' and k.variant_id in ('nitro','regular')
      and (p_query->>'variant' is null or k.variant_id=p_query->>'variant')
      and (p_query->>'limit' is null or k.limit_id=p_query->>'limit')
  ), changed_partitions as materialized (
    select split_part(v.key,':',2)::date as slot_date,split_part(v.key,':',3)::uuid as kind_id,
      coalesce((p_versions->>v.key)::bigint,0) as from_revision
    from jsonb_each_text(v_versions) v where not v_full and v.key like 'slots:%'
      and (case when v.key like 'slots:%' then v.value::bigint end)>coalesce((p_versions->>v.key)::bigint,0)
  ), addresses as materialized (
    select o.kind_id,o.slot_date,o.half,o.level from public.occupancy o join kinds k on k.id=o.kind_id
    where v_full and o.slot_date>=v_date and o.slot_date<v_date+v_days
    union all
    select c.kind_id,c.slot_date,c.half,c.level from changed_partitions changed
      join external_api_private.cell_changes c using(kind_id,slot_date)
      where c.revision>changed.from_revision
  ), cells as materialized (
    select a.*,o.member_id,o.tables from addresses a
    left join public.occupancy o using(kind_id,slot_date,half,level)
    order by a.slot_date,a.kind_id,a.level,a.half limit 250001
  ), referenced as materialized (
    select distinct o.member_id from public.occupancy o join kinds k on k.id=o.kind_id
    where o.slot_date>=v_date and o.slot_date<v_date+v_days limit 250001
  ), faces as materialized (
    select m.id::text as id,jsonb_build_object('name',
      coalesce(nullif(d.guild_nick,''),nullif(i.guild_nick,''),nullif(d.global_name,''),
        nullif(i.display_name,''),nullif(d.username,''),nullif(i.username,''),m.public_code),
      'discord_id',i.provider_uid,'mark',jsonb_build_object(
        'text',m.mark_tag,'background',m.mark_bg,'foreground',m.mark_fg)) as value,
      coalesce((v_priority->'people'->m.id::text->>'core')::integer,0) as core,
      coalesce((v_priority->'people'->m.id::text->>'score')::numeric,0) as score,
      (v_priority->'people'->m.id::text->>'clubOrder')::bigint as club_order,
      coalesce((v_priority->'people'->m.id::text->>'excluded')::boolean,false) as excluded
    from referenced r join public.members m on m.id=r.member_id
    left join lateral (select ident.* from public.identities ident
      where ident.member_id=m.id and ident.provider='discord'
      order by ident.updated_at desc,ident.id desc limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
  ), ranked as materialized (
    select *,row_number() over(order by excluded,
      case when not excluded and core>0 then core else 2147483647 end,
      score desc,club_order nulls last,lower(value->>'name') collate "C",id) as position from faces
  ), people as materialized (
    select id,position,value||jsonb_build_object('priority',jsonb_build_object(
      'order',position,'club_order',club_order,'core',core,'score',score,'excluded',excluded,
      'period_start',v_priority->'period_start','variant','nitro','limit_group','50-100')) as value from ranked
  ), items as (
    select '0:'||lpad(position::text,12,'0')||':'||id as sort,jsonb_build_object('type','person','id',id,'state',value) as value
      from people where v_full or p_people->id is distinct from to_jsonb(md5(value::text))
    union all
    select '0:'||id,jsonb_build_object('type','person','id',id,'state',null)
      from jsonb_object_keys(coalesce(p_people,'{}')) previous(id)
      where not exists(select 1 from people p where p.id=previous.id)
    union all
    select '1:'||slot_date::text||':'||kind_id::text||':'||level||':'||half,
      jsonb_build_object('type','cell','date',slot_date,'line_id',kind_id::text||':'||level,'half',half,
        'state',case when member_id is null then null else jsonb_build_object('person_id',member_id,
          'tables',case when coalesce((select count_tables from public.schedule_settings limit 1),false)
            then tables else null end) end) from cells
  )
  select coalesce((select jsonb_object_agg(id,to_jsonb(md5(value::text))) from people),'{}'),
    coalesce((select jsonb_agg(value order by sort) from items),'[]'),
    coalesce((select jsonb_agg(jsonb_build_object('id',k.id::text||':'||n,'number',n+1,
      'variant',k.variant_id,'limit',k.limit_id) order by k.id,n)
      from kinds k cross join generate_series(0,5) n where v_full),'[]')
  into v_people,v_items,v_lines;
  return jsonb_build_object('versions',v_versions,'people',v_people,'items',v_items,'lines',v_lines);
end;
$$;

-- Also invalidate open readers when every initial number came from a valid ID.
select schedule_private.bump_version('directory','directory');
select schedule_private.bump_version('priorities','priorities');
