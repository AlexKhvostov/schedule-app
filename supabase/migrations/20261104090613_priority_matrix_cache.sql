-- Four independent Core values. Existing VIP columns remain the 50-100 Core API.
alter table public.members
  add column core_nitro_250 integer not null default 0 check (core_nitro_250 between 0 and 999),
  add column core_regular_250 integer not null default 0 check (core_regular_250 between 0 and 999);
create unique index members_core_nitro_250_unique on public.members(core_nitro_250) where core_nitro_250 > 0;
create unique index members_core_regular_250_unique on public.members(core_regular_250) where core_regular_250 > 0;

-- Private saved results: clients can only use the authorized RPCs below.
create table public.priority_rating_cache (
  period_start date not null,
  variant_id text not null check (variant_id in ('nitro','regular')),
  limit_group text not null check (limit_group in ('50-100','250')),
  dirty boolean not null default true,
  payload jsonb,
  primary key (period_start, variant_id, limit_group)
);
alter table public.priority_rating_cache enable row level security;
revoke all on public.priority_rating_cache from public, anon, authenticated;

create function public.priority_slice_source(p_period_start date, p_variant text, p_group text, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cache public.priority_rating_cache%rowtype; v_source jsonb; v_person jsonb; v_old jsonb;
  v_people jsonb := '[]'; v_entries jsonb; v_months jsonb; v_cells jsonb; v_points jsonb;
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
          and ((p_group='50-100' and l.limit_id in ('50','100')) or (p_group='250' and l.limit_id='250'))),'[]'::jsonb));
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
  return v_source || jsonb_build_object('today',(now() at time zone 'Europe/Minsk')::date,'canManage',public.is_staff());
end;
$$;
revoke all on function public.priority_slice_source(date,text,text,boolean) from public,anon,authenticated;

create function public.load_priority_slice(p_period_start date,p_variant text,p_group text,p_refresh boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.current_has_permission('priorities') or public.current_has_permission('schedule')) or (p_refresh and not public.is_staff()) then
    raise exception 'forbidden' using errcode='42501'; end if;
  return public.priority_slice_source(p_period_start,p_variant,p_group,coalesce(p_refresh,false));
end;
$$;
revoke all on function public.load_priority_slice(date,text,text,boolean) from public,anon;
grant execute on function public.load_priority_slice(date,text,text,boolean) to authenticated;

-- Invalidate only periods whose six source months contain the modified entry.
create function public.invalidate_priority_distance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_entry public.distance_entries%rowtype;
begin
  if TG_OP <> 'INSERT' then v_old:=to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then v_new:=to_jsonb(new); end if;
  if TG_OP='UPDATE' and (v_old - 'updated_at')=(v_new - 'updated_at') then return null; end if;
  for v_row in select x from jsonb_array_elements(jsonb_build_array(v_old,v_new)) x where x <> 'null'::jsonb loop
    if TG_TABLE_NAME='distance_values' then
      if v_row->>'limit_id' not in ('50','100') then continue; end if;
      select * into v_entry from public.distance_entries where id=(v_row->>'entry_id')::uuid;
    else select * into v_entry from jsonb_populate_record(null::public.distance_entries,v_row); end if;
    if v_entry.variant_id not in ('nitro','regular') then continue; end if;
    update public.priority_rating_cache set dirty=true where not dirty and limit_group='50-100' and variant_id=v_entry.variant_id
      and period_start>v_entry.month_start and period_start<=v_entry.month_start+interval '6 months';
  end loop;
  return null;
end;
$$;
revoke all on function public.invalidate_priority_distance() from public,anon,authenticated;
create trigger priority_distance_entries_dirty after insert or update or delete on public.distance_entries for each row execute function public.invalidate_priority_distance();
create trigger priority_distance_values_dirty after insert or update or delete on public.distance_values for each row execute function public.invalidate_priority_distance();

create function public.invalidate_priority_directory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='UPDATE' and (to_jsonb(old) - ARRAY['updated_at','last_seen_at','last_login_at','synced_at'])=(to_jsonb(new) - ARRAY['updated_at','last_seen_at','last_login_at','synced_at']) then return null; end if;
  update public.priority_rating_cache set dirty=true where not dirty;
  return null;
end;
$$;
revoke all on function public.invalidate_priority_directory() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['members','identities','discord_members','discord_guild_roles','profiles','players','player_nicks','player_limits','priority_member_settings','club_settings'] loop
    execute format('create trigger priority_directory_dirty after insert or update or delete on public.%I for each row execute function public.invalidate_priority_directory()',t);
  end loop;
end $$;

create or replace function public.submit_priority_slice_request(p_period_start date,p_variant text,p_expected jsonb,p_group text,p_comment text default '',p_vip_enabled boolean default true,p_revision text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_source jsonb; v_people jsonb; v_id uuid; v_count integer;
begin
  if current_member_id() is null or not (current_has_permission('priorities') or current_has_permission('schedule')) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_variant is null or p_variant not in ('nitro','regular') or p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'priority-bad-request' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_expected);
  if v_count<1 or v_count>50 or length(coalesce(p_comment,''))>2000 then raise exception 'priority-bad-request' using errcode='22023'; end if;
  if (select count(distinct x->>'memberId') from jsonb_array_elements(p_expected) x)<>v_count then raise exception 'priority-bad-request' using errcode='22023'; end if;
  v_source:=public.priority_slice_source(p_period_start,p_variant,p_group);
  if p_vip_enabled is null or p_revision is distinct from v_source->>'revision' then raise exception 'priority-stale' using errcode='40001'; end if;
  select jsonb_agg(actual.row order by expected.ord) into v_people
  from jsonb_array_elements(p_expected) with ordinality expected(row,ord)
  join jsonb_array_elements(v_source->'people') actual(row) on actual.row->>'memberId'=expected.row->>'memberId';
  if v_people is distinct from p_expected then raise exception 'priority-stale' using errcode='40001'; end if;
  insert into priority_requests(author_id,period_start,variant_id,comment,snapshot)
  values(current_member_id(),p_period_start,p_variant,trim(coalesce(p_comment,'')),
    jsonb_build_object('version',3,'group',p_group,'calculatedAt',v_source->'calculatedAt','periodStart',p_period_start,'today',v_source->'today','lastMonthEntries',v_source->'lastMonthEntries','people',v_people,'rankingPeople',v_source->'people','vipEnabled',p_vip_enabled)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_priority_slice_request(date,text,jsonb,text,text,boolean,text) from public, anon;
grant execute on function public.submit_priority_slice_request(date,text,jsonb,text,text,boolean,text) to authenticated;

create or replace function public.list_priority_requests(p_period_start date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (current_has_permission('priorities') or current_has_permission('schedule')) then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'periodStart',r.period_start,'variant',r.variant_id,'group',coalesce(r.snapshot->>'group','50-100'),'createdAt',r.created_at,'closedAt',r.closed_at,'response',r.response,
    'targets',(select jsonb_agg(jsonb_build_object('memberId',p->>'memberId','nick',p->>'nick')) from jsonb_array_elements(r.snapshot->'people') p)
    ) order by r.created_at desc,r.id) from priority_requests r where r.period_start=p_period_start),'[]'::jsonb);
end;
$$;
revoke all on function public.list_priority_requests(date) from public, anon;
grant execute on function public.list_priority_requests(date) to authenticated;

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
        'core_nitro_250',m.core_nitro_250,'core_regular_250',m.core_regular_250,'vip_nitro', m.vip_nitro, 'vip_regular', m.vip_regular,
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


create or replace function public.priority_vip_exclusion_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role',true) in ('authenticated','anon') and not public.is_staff() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if exists(select 1 from priority_member_settings s where s.member_id = new.id
    and ((s.excluded_nitro and greatest(new.vip_nitro,new.core_nitro_250) > 0) or (s.excluded_regular and greatest(new.vip_regular,new.core_regular_250) > 0))) then
    raise exception 'priority-vip-exclusion-conflict' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger members_priority_exclusion_guard on public.members;
create trigger members_priority_exclusion_guard before update of vip_nitro, vip_regular, core_nitro_250, core_regular_250 on public.members
for each row execute function public.priority_vip_exclusion_guard();
revoke all on function public.priority_vip_exclusion_guard() from public, anon, authenticated;


create or replace function public.set_priority_exclusion(p_member_id uuid,p_variant text,p_excluded boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_vip integer;
begin
  if not is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_variant not in ('nitro','regular') or p_variant is null or p_excluded is null then raise exception 'priority-bad-variant' using errcode='22023'; end if;
  select case when p_variant='nitro' then greatest(vip_nitro,core_nitro_250) else greatest(vip_regular,core_regular_250) end into v_vip from members where id=p_member_id for update;
  if not found then raise exception 'priority-member-not-found' using errcode='22023'; end if;
  if p_excluded and v_vip > 0 then raise exception 'priority-vip-exclusion-conflict' using errcode='23514'; end if;
  insert into priority_member_settings(member_id) values(p_member_id) on conflict do nothing;
  if p_variant='nitro' then update priority_member_settings set excluded_nitro=p_excluded where member_id=p_member_id;
  else update priority_member_settings set excluded_regular=p_excluded where member_id=p_member_id; end if;
end;
$$;
revoke all on function public.set_priority_exclusion(uuid,text,boolean) from public, anon;
grant execute on function public.set_priority_exclusion(uuid,text,boolean) to authenticated;
