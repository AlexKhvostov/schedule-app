-- Disposable ranking, request privacy, snapshots and exclusion/VIP contracts.
begin;
do $$
declare
  admin_auth uuid := gen_random_uuid(); player_auth uuid := gen_random_uuid();
  admin_id uuid; player_id uuid; target uuid; room uuid; rp text; source jsonb; expected jsonb;
  no_room uuid; vacation uuid; staff_only uuid; vacation_request uuid;
  request_id uuid; detail jsonb; summary jsonb; entry uuid; old_total integer; cached jsonb; next_source jsonb; calculated text; original_calc jsonb;
begin
  if has_table_privilege('authenticated','public.priority_requests','SELECT')
    or has_table_privilege('authenticated','public.priority_requests','INSERT')
    or has_table_privilege('authenticated','public.priority_member_settings','UPDATE')
    or has_function_privilege('authenticated','public.priority_source(date)','EXECUTE')
    or has_function_privilege('anon','public.load_priorities(date)','EXECUTE') then
    raise exception 'priority grants leak private tables/internal snapshot';
  end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',admin_auth,'authenticated','authenticated','priority-admin@example.invalid','',now(),now(),now()),
    ('00000000-0000-0000-0000-000000000000',player_auth,'authenticated','authenticated','priority-player@example.invalid','',now(),now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(admin_auth,'RP-PRIOADMIN','active','PA') returning id into admin_id;
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(player_auth,'RP-PRIOPLAYER','active','PP') returning id into player_id;
  insert into members(public_code,access_status,mark_tag,distance_ext_id) values('RP-PRIOTARGET','active','PT','987650') returning id into target;
  insert into member_roles(member_id,role_id) values(admin_id,'root'),(player_id,'member'),(target,'member');
  insert into profiles(member_id) values(player_id),(target) on conflict do nothing;
  select required_discord_role_id into rp from club_settings where id;
  insert into discord_guild_roles(role_id,name) values('1208022278088949770','Priority test 50+') on conflict(role_id) do update set name=excluded.name;
  insert into discord_role_permissions(role_id,permission_code) values('1208022278088949770','schedule') on conflict do nothing;
  insert into identities(member_id,provider,provider_uid,guild_present,discord_roles) values
    (player_id,'discord','990000000000000101',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770'))),
    (target,'discord','990000000000000102',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770')));
  insert into discord_members(discord_id,username,present,roles) values
    ('990000000000000101','PriorityPlayer',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770'))),
    ('990000000000000102','PriorityTarget',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770')));
  insert into members(public_code,access_status) values('RP-PRIONOROOM','blocked') returning id into no_room;
  insert into members(public_code,access_status) values('RP-PRIOVACATION','active') returning id into vacation;
  insert into members(public_code,access_status) values('RP-PRIOSTAFF','active') returning id into staff_only;
  insert into member_roles(member_id,role_id) values(staff_only,'staff');
  insert into identities(member_id,provider,provider_uid,guild_present,discord_roles) values
    (vacation,'discord','990000000000000103',true,jsonb_build_array(jsonb_build_object('id','1208022278088949770','name','Fallback role'))),
    (staff_only,'discord','990000000000000104',true,jsonb_build_array(jsonb_build_object('id','1208022278088949770')));
  -- A newer Discord snapshot overrides a stale identity, including departure from the server.
  insert into discord_members(discord_id,username,present,roles) values
    ('990000000000000104','PriorityDeparted',false,jsonb_build_array(jsonb_build_object('id','1208022278088949770')));
  select id into room from rooms where slug='winamax';
  insert into players(member_id,room_id) values(vacation,room) on conflict do nothing;
  delete from player_limits l where l.player_id in (select p.id from players p where p.member_id=vacation);

  insert into players(member_id,room_id) values(player_id,room),(target,room) on conflict do nothing;
  insert into player_limits(player_id,variant_id,limit_id)
    select id,'nitro','50' from players where member_id in(player_id,target) and room_id=room on conflict do nothing;
  insert into player_limits(player_id,variant_id,limit_id)
    select id,'regular','100' from players where member_id in(player_id,target) and room_id=room on conflict do nothing;
  insert into distance_entries(member_id,room_id,month_start,variant_id,source,distance_ext_id,part)
    select target,room,'2026-07-01','nitro','manual','987650',n from generate_series(1,20) n;
  insert into distance_values(entry_id,limit_id,tournaments)
    select id,'50',10 from distance_entries where distance_ext_id='987650';
  insert into distance_values(entry_id,limit_id,tournaments)
    select id,'100',3 from distance_entries where distance_ext_id='987650';
  insert into distance_entries(room_id,month_start,variant_id,source,distance_ext_id,discord_id)
    values(room,'2026-02-01','regular','historical','987650','990000000000000102') returning id into entry;
  insert into distance_values(entry_id,limit_id,tournaments) values(entry,'50',11);

  perform set_config('request.jwt.claim.sub',player_auth::text,true);
  execute 'set local role authenticated';
  source:=load_priority_slice('2026-08-01','nitro','50-100');
  select p into cached from jsonb_array_elements(source->'people') p where p->>'memberId'=target::text;
  if (cached->'calculation'->>'total')::numeric <> 320 or cached->'calculation'->'distanceCells' <> '[0,0,200,60]'::jsonb then raise exception 'nitro calculation mixes variants or wrong weights: %',cached; end if;
  original_calc:=cached->'calculation'; calculated:=source->>'calculatedAt';
  if load_priority_slice('2026-08-01','nitro','50-100')->>'calculatedAt' is distinct from calculated then raise exception 'unchanged read recalculates'; end if;
  next_source:=load_priority_slice('2026-08-01','regular','50-100');
  select p into cached from jsonb_array_elements(next_source->'people') p where p->>'memberId'=target::text;
  if (cached->'calculation'->>'total')::numeric <> 5.5 then raise exception 'regular calculation includes Nitro'; end if;
  next_source:=load_priority_slice('2026-08-01','nitro','250');
  if exists(select 1 from jsonb_array_elements(next_source->'people') p where (p->'calculation'->>'total')::numeric<>0 or p->'entries'<>'[]'::jsonb) then raise exception '250 has distances'; end if;
  if has_table_privilege('authenticated','public.priority_rating_cache','SELECT') or has_function_privilege('authenticated','public.priority_slice_source(date,text,text,boolean)','EXECUTE') then raise exception 'cache access leak'; end if;
  begin perform load_priority_slice('2026-08-01','nitro','50-100',true); raise exception 'player forced refresh'; exception when sqlstate '42501' then null; end;
  begin update members set core_nitro_250=777 where id=player_id; raise exception 'player assigned Core'; exception when sqlstate '42501' then null; end;
  select jsonb_build_array(p) into expected from jsonb_array_elements(source->'people') p where p->>'memberId'=target::text;
  request_id:=submit_priority_slice_request('2026-08-01','nitro',expected,'50-100','test',true,source->>'revision');
  execute 'reset role';
  -- Older month changes only Regular. Nitro stays cached; 250 never recalculates distance.
  update distance_values set tournaments=13 where entry_id=entry and limit_id='50';
  if (select dirty from priority_rating_cache where period_start='2026-08-01' and variant_id='nitro' and limit_group='50-100') then raise exception 'unrelated kind invalidated'; end if;
  next_source:=public.priority_slice_source('2026-08-01','regular','50-100');
  select p into cached from jsonb_array_elements(next_source->'people') p where p->>'memberId'=target::text;
  if (cached->'calculation'->>'total')::numeric<>6.5 then raise exception 'older month not refreshed'; end if;
  -- Metadata/Core rebuild preserves the saved calculation.
  update members set core_nitro_250=998,core_regular_250=997 where id=target;
  next_source:=public.priority_slice_source('2026-08-01','nitro','50-100');
  select p into cached from jsonb_array_elements(next_source->'people') p where p->>'memberId'=target::text;
  if cached->'calculation' is distinct from original_calc or (cached->>'vipNitro')::int<>0 or (cached->>'coreNitro250')::int<>998 then raise exception 'Core overwrote another cell or calculation'; end if;
  begin update members set core_nitro_250=998 where id=player_id; raise exception 'duplicate group Core accepted'; exception when sqlstate '23505' then null; end;
  update distance_values set tournaments=20 where entry_id in(select id from distance_entries where member_id=target and variant_id='nitro') and limit_id='50';
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  execute 'set local role authenticated';
  source:=load_priority_slice('2026-08-01','nitro','50-100');
  if not (source->>'canManage')::boolean then raise exception 'cache reused another caller permissions'; end if;
  select p into cached from jsonb_array_elements(source->'people') p where p->>'memberId'=target::text;
  if (cached->'calculation'->>'total')::numeric <> 520 then raise exception 'latest month not refreshed'; end if;
  detail:=get_priority_request(request_id);
  if detail->'snapshot'->>'version'<>'3' or detail->'snapshot'->'people' is distinct from expected then raise exception 'saved request mutated'; end if;
  begin perform submit_priority_slice_request('2026-08-01','nitro',expected,'50-100','stale',true,source->>'revision'); raise exception 'stale values accepted'; exception when sqlstate '40001' then null; end;
  calculated:=source->>'calculatedAt';
  source:=load_priority_slice('2026-08-01','nitro','50-100',true);
  if source->>'calculatedAt'=calculated then raise exception 'manual refresh did not run'; end if;
  source:=load_priority_slice('2026-11-01','nitro','50-100');
  if source->>'periodStart'<>'2026-11-01' then raise exception 'new period not built'; end if;
  begin perform set_priority_exclusion(target,'nitro',true); raise exception '250 Core excluded'; exception when sqlstate '23514' then null; end;
  execute 'reset role';
end $$;
rollback;
