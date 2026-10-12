-- Disposable ranking, request privacy, snapshots and exclusion/VIP contracts.
begin;
do $$
declare
  admin_auth uuid := gen_random_uuid(); player_auth uuid := gen_random_uuid();
  admin_id uuid; player_id uuid; target uuid; room uuid; rp text; source jsonb; expected jsonb;
  request_id uuid; detail jsonb; summary jsonb; entry uuid; old_total integer;
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
  insert into discord_guild_roles(role_id,name) values('1208022278088949770','Priority test 50+') on conflict do nothing;
  insert into discord_role_permissions(role_id,permission_code) values('1208022278088949770','schedule') on conflict do nothing;
  insert into identities(member_id,provider,provider_uid,guild_present,discord_roles) values
    (player_id,'discord','990000000000000101',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770'))),
    (target,'discord','990000000000000102',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770')));
  insert into discord_members(discord_id,username,present,roles) values
    ('990000000000000101','PriorityPlayer',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770'))),
    ('990000000000000102','PriorityTarget',true,jsonb_build_array(jsonb_build_object('id',rp),jsonb_build_object('id','1208022278088949770')));
  select id into room from rooms where slug='winamax';
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
  source:=load_priorities('2026-08-01');
  if (source->>'canManage')::boolean then raise exception 'ordinary player marked admin'; end if;
  if (source->>'lastMonthEntries')::integer<20 then raise exception 'logical parts were not counted'; end if;
  select jsonb_build_array(x) into expected from jsonb_array_elements(source->'people') x where x->>'memberId'=target::text;
  if expected is null or jsonb_array_length(expected->0->'entries')<>21 or not (expected->0->>'team50')::boolean then raise exception 'historical entries/role missing'; end if;
  request_id:=submit_priority_request('2026-08-01','nitro',expected,'private concern',true,source->>'revision');
  summary:=list_priority_requests('2026-08-01');
  if summary::text like '%private concern%' or summary::text like '%author%' or summary::text like '%entries%' then raise exception 'public request leaks private details'; end if;
  begin perform get_priority_request(request_id); raise exception 'ordinary player read private request'; exception when sqlstate '42501' then null; end;
  begin perform close_priority_request(request_id,'bad'); raise exception 'ordinary player closed request'; exception when sqlstate '42501' then null; end;
  begin perform delete_priority_request(request_id); raise exception 'ordinary player deleted request'; exception when sqlstate '42501' then null; end;
  begin perform set_priority_exclusion(target,'nitro',true); raise exception 'ordinary player changed exclusion'; exception when sqlstate '42501' then null; end;
  execute 'reset role';
  delete from player_limits l where l.player_id in(select id from players where member_id=target) and l.variant_id='nitro';
  insert into player_limits(player_id,variant_id,limit_id) select id,'nitro','25' from players where member_id=target and room_id=room;
  update distance_values set tournaments=12 where entry_id=entry and limit_id='50';
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  execute 'set local role authenticated';
  detail:=get_priority_request(request_id);
  if detail->>'comment'<>'private concern' or (detail->'snapshot'->'people') is distinct from expected then raise exception 'request snapshot changed with distance'; end if;
  begin perform submit_priority_request('2026-08-01','nitro',expected,'stale',true,source->>'revision'); raise exception 'stale request accepted'; exception when sqlstate '40001' then null; end;
  source:=load_priorities('2026-08-01');
  if not (source->>'canManage')::boolean then raise exception 'admin not identified'; end if;
  if not exists(select 1 from jsonb_array_elements(source->'people') p where p->>'memberId'=target::text and p->'plays' ? 'nitro') then raise exception 'kind membership incorrectly restricted to selected limits50/100'; end if;
  select sum((v->>'tournaments')::integer) into old_total from jsonb_array_elements(source->'people') p,
    jsonb_array_elements(p->'entries') e,jsonb_array_elements(e->'values') v where p->>'memberId'=target::text and e->>'month'='2026-02-01';
  if old_total is distinct from 12 then raise exception 'distance change not reflected in current source'; end if;
  perform set_priority_exclusion(target,'nitro',true);
  execute 'reset role';
  begin update members set vip_nitro=997 where id=target; raise exception 'positive VIP allowed for excluded player'; exception when sqlstate '23514' then null; end;
  update members set vip_regular=997 where id=target;
  begin update members set vip_regular=997 where id=player_id; raise exception 'duplicate positive VIP accepted'; exception when sqlstate '23505' then null; end;
  execute 'set local role authenticated';
  begin perform set_priority_exclusion(target,'regular',true); raise exception 'excluded positive VIP player'; exception when sqlstate '23514' then null; end;
  begin perform close_priority_request(request_id,' '); raise exception 'empty response accepted'; exception when sqlstate '22023' then null; end;
  perform close_priority_request(request_id,'Checked, distance corrected');
  begin perform close_priority_request(request_id,'overwritten'); raise exception 'closed request overwritten'; exception when sqlstate '40001' then null; end;
  summary:=list_priority_requests('2026-08-01');
  if summary::text not like '%Checked, distance corrected%' or summary::text like '%private concern%' then raise exception 'public reply missing/private text leaked'; end if;
  perform delete_priority_request(request_id);
  if exists(select 1 from jsonb_array_elements(list_priority_requests('2026-08-01')) r where r->>'id'=request_id::text) then raise exception 'request not deleted'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform load_priorities('2026-08-01'); raise exception 'outsider read priorities'; exception when sqlstate '42501' then null; end;
end;
$$;
rollback;
