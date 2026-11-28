-- Disposable local database only; synthetic records and access changes roll back.
begin;
do $$
declare
  uid uuid:=gen_random_uuid(); viewer uuid; owner_id uuid; actor_id uuid;
  kind uuid; other_kind uuid; page jsonb; next_page jsonb; last_row jsonb;
begin
  if has_function_privilege('anon','public.slot_history(date,integer,integer,text,text,timestamptz,uuid)','EXECUTE') then
    raise exception 'anonymous history grant';
  end if;
  insert into auth.users(id,aud,role,email) values(uid,'authenticated','authenticated','history@example.invalid');
  insert into members(auth_user_id,public_code,access_status) values(uid,'HISTORY-VIEWER','active') returning id into viewer;
  insert into members(public_code,access_status,mark_tag,mark_bg,mark_fg) values('HISTORY-OWNER','active','HO','#468ec6','#ffffff') returning id into owner_id;
  insert into members(public_code,access_status) values('HISTORY-AUTHOR','active') returning id into actor_id;
  insert into discord_guild_roles(role_id,name) values('history-test-role','History fixture');
  insert into discord_role_permissions(role_id,permission_code) values('history-test-role','schedule');
  insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
    select viewer,'discord','999920000000000001','HistoryViewer',true,
      jsonb_build_array(jsonb_build_object('id','history-test-role'),jsonb_build_object('id',required_discord_role_id)) from club_settings where id;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  if public.is_staff() then raise exception 'viewer must be an ordinary schedule reader'; end if;
  select k.id into kind from schedule_kinds k join rooms r on r.id=k.room_id where r.slug='winamax' and k.variant_id='nitro' and k.limit_id='50';
  select k.id into other_kind from schedule_kinds k join rooms r on r.id=k.room_id where r.slug='winamax' and k.variant_id='regular' and k.limit_id='50';
  insert into occupancy_events(at,action,member_id,actor_id,kind_id,slot_date,half,level,tables)
    select now(),'place',owner_id,actor_id,kind,'2098-01-01',18,0,2 from generate_series(1,61);
  insert into occupancy_events(at,action,kind_id,slot_date,half,level,tables) values
    (now(),'remove',kind,'2098-01-01',18,0,2), -- deleted/unknown people must not hide an event
    (now()-interval '3 months','place',kind,'2098-01-01',18,0,2),
    (now(),'place',kind,'2098-01-01',19,0,2),
    (now(),'place',kind,'2098-01-01',18,1,2),
    (now(),'place',kind,'2098-01-02',18,0,2),
    (now(),'place',other_kind,'2098-01-01',18,0,2);
  execute 'set local role authenticated';
  page:=public.slot_history('2098-01-01',18,0,'nitro','50');
  if jsonb_array_length(page->'rows')<>50 or not (page->>'has_more')::boolean then raise exception 'first page bound'; end if;
  if exists(select 1 from jsonb_array_elements(page->'rows') r where r->'member' ? 'email' or r->'actor' ? 'email') then raise exception 'private fields leaked'; end if;
  last_row:=page->'rows'->49;
  next_page:=public.slot_history('2098-01-01',18,0,'nitro','50',(last_row->>'at')::timestamptz,(last_row->>'id')::uuid);
  if jsonb_array_length(next_page->'rows')<>12 or (next_page->>'has_more')::boolean then raise exception 'pagination crossed coordinate/retention or skipped equal-time events'; end if;
  if exists(select 1 from jsonb_array_elements(page->'rows') a join jsonb_array_elements(next_page->'rows') b on a->>'id'=b->>'id') then raise exception 'duplicate page event'; end if;
  if not exists(select 1 from jsonb_array_elements((page->'rows')||(next_page->'rows')) r
    where r->'actor'->>'name'='HISTORY-AUTHOR' and r->'member'->>'name'='HISTORY-OWNER' and r->'member'->>'tag'='HO') then raise exception 'author/owner identity or mark lost'; end if;
  if not exists(select 1 from jsonb_array_elements((page->'rows')||(next_page->'rows')) r
    where r->>'action'='remove' and r->'actor'->>'name' is null) then raise exception 'unknown people event lost'; end if;
  if public.slot_history('2098-01-03',18,0,'nitro','50')->'rows'<>'[]'::jsonb then raise exception 'empty slot crossed scope'; end if;
  begin perform public.slot_history('2098-01-01',48,0,'nitro','50'); raise exception 'invalid half'; exception when invalid_parameter_value then null; end;
  begin perform public.slot_history('2098-01-01',18,6,'nitro','50'); raise exception 'invalid level'; exception when invalid_parameter_value then null; end;
  begin perform public.slot_history('2098-01-01',18,0,'other','50'); raise exception 'invalid variant'; exception when invalid_parameter_value then null; end;
  begin perform public.slot_history('2098-01-01',18,0,'nitro','missing'); raise exception 'invalid limit'; exception when invalid_parameter_value then null; end;
  begin perform public.slot_history('2098-01-01',18,0,'nitro','50',now()); raise exception 'partial cursor'; exception when invalid_parameter_value then null; end;
  execute 'reset role';
  delete from discord_role_permissions where role_id='history-test-role';
  execute 'set local role authenticated';
  begin perform public.slot_history('2098-01-01',18,0,'nitro','50'); raise exception 'revoked access allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  insert into member_roles(member_id,role_id) values(viewer,'root');
  update members set access_status='blocked' where id=viewer;
  execute 'set local role authenticated';
  begin perform public.slot_history('2098-01-01',18,0,'nitro','50'); raise exception 'blocked root allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.slot_history('2098-01-01',18,0,'nitro','50'); raise exception 'missing identity allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
