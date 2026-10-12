-- Priorities only: no schedule locks, queue or changes to distance-writing RPCs.
create table public.priority_member_settings (
  member_id uuid primary key references public.members(id) on delete cascade,
  excluded_nitro boolean not null default false,
  excluded_regular boolean not null default false
);
create table public.priority_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.members(id) on delete set null,
  period_start date not null,
  variant_id text not null check (variant_id in ('nitro','regular')),
  comment text not null default '' check (length(comment) <= 2000),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  response text check (length(response) <= 1000),
  closed_at timestamptz,
  closed_by uuid references public.members(id) on delete set null
);
create index priority_requests_period_created_idx on public.priority_requests(period_start, created_at desc);
alter table public.priority_member_settings enable row level security;
alter table public.priority_requests enable row level security;
revoke all on public.priority_member_settings, public.priority_requests from public, anon, authenticated;

create function public.priority_vip_exclusion_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from priority_member_settings s where s.member_id = new.id
    and ((s.excluded_nitro and new.vip_nitro > 0) or (s.excluded_regular and new.vip_regular > 0))) then
    raise exception 'priority-vip-exclusion-conflict' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger members_priority_exclusion_guard before update of vip_nitro, vip_regular on public.members
for each row execute function public.priority_vip_exclusion_guard();
revoke all on function public.priority_vip_exclusion_guard() from public, anon, authenticated;

-- Internal canonical snapshot. It exposes only ranking facts, never profile contacts.
create function public.priority_source(p_period_start date) returns jsonb
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
        'nick', coalesce(dm.guild_nick, dm.global_name, dm.username, i.guild_nick, i.display_name, i.username, pn.nick, m.public_code),
        'avatarUrl', coalesce(dm.avatar_url, i.avatar_url),
        'redParty', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'=v_rp),
        'team50', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'='1208022278088949770'),
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
      from members m join players pl on pl.member_id=m.id and pl.room_id=v_room
      left join priority_member_settings s on s.member_id=m.id
      left join lateral(select x.* from identities x where x.member_id=m.id and x.provider='discord' order by x.id limit 1) i on true
      left join discord_members dm on dm.discord_id=i.provider_uid
      left join lateral(select n.nick from player_nicks n where n.player_id=pl.id order by n.at desc,n.id desc limit 1) pn on true
      where exists(select 1 from member_roles mr where mr.member_id=m.id and mr.role_id in ('member','admin'))
        and exists(select 1 from player_limits l where l.player_id=pl.id and l.variant_id in ('nitro','regular'))
    ), '[]'::jsonb)
  );
  return v_result || jsonb_build_object('revision',md5((v_result->'people')::text));
end;
$$;
revoke all on function public.priority_source(date) from public, anon, authenticated;

create function public.load_priorities(p_period_start date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (current_has_permission('priorities') or current_has_permission('schedule')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return priority_source(p_period_start);
end;
$$;
revoke all on function public.load_priorities(date) from public, anon;
grant execute on function public.load_priorities(date) to authenticated;

create function public.set_priority_exclusion(p_member_id uuid,p_variant text,p_excluded boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_vip integer;
begin
  if not is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_variant not in ('nitro','regular') or p_variant is null or p_excluded is null then raise exception 'priority-bad-variant' using errcode='22023'; end if;
  select case when p_variant='nitro' then vip_nitro else vip_regular end into v_vip from members where id=p_member_id for update;
  if not found then raise exception 'priority-member-not-found' using errcode='22023'; end if;
  if p_excluded and v_vip > 0 then raise exception 'priority-vip-exclusion-conflict' using errcode='23514'; end if;
  insert into priority_member_settings(member_id) values(p_member_id) on conflict do nothing;
  if p_variant='nitro' then update priority_member_settings set excluded_nitro=p_excluded where member_id=p_member_id;
  else update priority_member_settings set excluded_regular=p_excluded where member_id=p_member_id; end if;
end;
$$;
revoke all on function public.set_priority_exclusion(uuid,text,boolean) from public, anon;
grant execute on function public.set_priority_exclusion(uuid,text,boolean) to authenticated;

create function public.submit_priority_request(p_period_start date,p_variant text,p_expected jsonb,p_comment text default '',p_vip_enabled boolean default true,p_revision text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_source jsonb; v_people jsonb; v_id uuid; v_count integer;
begin
  if current_member_id() is null or not (current_has_permission('priorities') or current_has_permission('schedule')) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_variant is null or p_variant not in ('nitro','regular') or p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'priority-bad-request' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_expected);
  if v_count<1 or v_count>50 or length(coalesce(p_comment,''))>2000 then raise exception 'priority-bad-request' using errcode='22023'; end if;
  if (select count(distinct x->>'memberId') from jsonb_array_elements(p_expected) x)<>v_count then raise exception 'priority-bad-request' using errcode='22023'; end if;
  v_source:=priority_source(p_period_start);
  if p_vip_enabled is null or p_revision is distinct from v_source->>'revision' then raise exception 'priority-stale' using errcode='40001'; end if;
  select jsonb_agg(actual.row order by expected.ord) into v_people
  from jsonb_array_elements(p_expected) with ordinality expected(row,ord)
  join jsonb_array_elements(v_source->'people') actual(row) on actual.row->>'memberId'=expected.row->>'memberId'
    and actual.row->'plays' ? p_variant;
  if v_people is distinct from p_expected then raise exception 'priority-stale' using errcode='40001'; end if;
  insert into priority_requests(author_id,period_start,variant_id,comment,snapshot)
  values(current_member_id(),p_period_start,p_variant,trim(coalesce(p_comment,'')),
    jsonb_build_object('version',1,'periodStart',p_period_start,'today',v_source->'today','lastMonthEntries',v_source->'lastMonthEntries','people',v_people,'rankingPeople',v_source->'people','vipEnabled',p_vip_enabled)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_priority_request(date,text,jsonb,text,boolean,text) from public, anon;
grant execute on function public.submit_priority_request(date,text,jsonb,text,boolean,text) to authenticated;

create function public.list_priority_requests(p_period_start date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (current_has_permission('priorities') or current_has_permission('schedule')) then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'periodStart',r.period_start,'variant',r.variant_id,'createdAt',r.created_at,'closedAt',r.closed_at,'response',r.response,
    'targets',(select jsonb_agg(jsonb_build_object('memberId',p->>'memberId','nick',p->>'nick')) from jsonb_array_elements(r.snapshot->'people') p)
    ) order by r.created_at desc,r.id) from priority_requests r where r.period_start=p_period_start),'[]'::jsonb);
end;
$$;
revoke all on function public.list_priority_requests(date) from public, anon;
grant execute on function public.list_priority_requests(date) to authenticated;

create function public.get_priority_request(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  select jsonb_build_object('id',r.id,'comment',r.comment,'snapshot',r.snapshot,
    'author',coalesce(dm.guild_nick,dm.global_name,dm.username,i.display_name,m.public_code,''),'createdAt',r.created_at,'response',r.response,'closedAt',r.closed_at,'variant',r.variant_id)
    into v_result from priority_requests r left join members m on m.id=r.author_id
    left join lateral(select x.* from identities x where x.member_id=m.id and x.provider='discord' order by x.id limit 1) i on true
    left join discord_members dm on dm.discord_id=i.provider_uid where r.id=p_id;
  if v_result is null then raise exception 'priority-request-not-found' using errcode='22023'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_priority_request(uuid) from public, anon;
grant execute on function public.get_priority_request(uuid) to authenticated;

create function public.close_priority_request(p_id uuid,p_response text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_response is null or length(trim(p_response))=0 or length(p_response)>1000 then raise exception 'priority-response-required' using errcode='22023'; end if;
  update priority_requests set response=trim(p_response),closed_at=now(),closed_by=current_member_id() where id=p_id and closed_at is null;
  if not found then raise exception 'priority-request-closed-or-missing' using errcode='40001'; end if;
end;
$$;
revoke all on function public.close_priority_request(uuid,text) from public, anon;
grant execute on function public.close_priority_request(uuid,text) to authenticated;

create function public.delete_priority_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  delete from priority_requests where id=p_id;
  if not found then raise exception 'priority-request-not-found' using errcode='22023'; end if;
end;
$$;
revoke all on function public.delete_priority_request(uuid) from public, anon;
grant execute on function public.delete_priority_request(uuid) to authenticated;
