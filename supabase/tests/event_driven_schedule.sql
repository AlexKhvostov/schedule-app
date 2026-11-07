-- Disposable local database only. No fixture, message, receipt or setting persists.
begin;
do $$
declare
  uid uuid:=gen_random_uuid(); mid uuid; kid uuid; pid uuid; op uuid:=gen_random_uuid();
  day date:=current_date+730; y integer; m integer; cfg jsonb; versions jsonb; snapshot jsonb;
  cell jsonb; empty_cell jsonb; occupied_cell jsonb; revision bigint; messages bigint; affected integer;
  roster jsonb; roles jsonb;
begin
  if has_function_privilege('anon','public.load_schedule_versions(integer,integer)','execute')
    or has_function_privilege('anon','public.load_schedule_configuration()','execute')
    or has_function_privilege('anon','public.apply_schedule_edit_v2(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute')
    or has_table_privilege('authenticated','schedule_private.edit_receipts','select')
    or has_column_privilege('authenticated','public.schedule_settings','sync_fallback_enabled','update') then
    raise exception 'unexpected public/private grants';
  end if;
  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
    values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-driven@example.invalid',now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(uid,'RP-EVENT','active','EV') returning id into mid;
  insert into member_roles(member_id,role_id) values(mid,'root');
  select id into kid from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;
  insert into players(member_id,room_id) select mid,room_id from schedule_kinds where id=kid
    on conflict(member_id,room_id) do update set room_id=excluded.room_id returning id into pid;
  insert into player_limits(player_id,variant_id,limit_id) values(pid,'nitro','50') on conflict do nothing;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  y:=extract(year from day); m:=extract(month from day);
  cfg:=load_schedule_configuration();
  if cfg->'settings'->>'sync_fallback_enabled'<>'false' or cfg->'settings'->>'sync_fallback_minutes'<>'5'
    or jsonb_array_length(cfg->'kinds')=0 or not(cfg ? 'deadTimeIntervals') then raise exception 'invalid bootstrap/defaults'; end if;
  revision:=(cfg->>'revision')::bigint;
  perform save_schedule_sync(true,8,false,5);
  cfg:=load_schedule_configuration();
  if cfg->'settings'->>'sync_fallback_minutes'<>'8' or (cfg->>'revision')::bigint<>revision+1 then raise exception 'config revision not advanced'; end if;
  perform save_schedule_sync(true,8,true,8);
  if load_schedule_configuration()->>'revision'<>cfg->>'revision' then raise exception 'no-op advanced config'; end if;
  begin perform save_schedule_sync(false,5,false,5); raise exception 'stale settings accepted'; exception when serialization_failure then null; end;
  begin perform save_schedule_sync(true,0,true,8); raise exception 'zero interval accepted'; exception when invalid_parameter_value then null; end;
  begin perform save_schedule_sync(true,61,true,8); raise exception 'unbounded interval accepted'; exception when invalid_parameter_value then null; end;
  perform save_schedule_filter_limits(array['50'],array['50']);

  cell:=jsonb_build_array(jsonb_build_object('date',day,'half',20,'level',0,'tables',3));
  empty_cell:=jsonb_build_array(jsonb_build_object('date',day,'half',20,'level',0,'member_id',null,'tables',null));
  occupied_cell:=jsonb_build_array(jsonb_build_object('date',day,'half',20,'level',0,'member_id',mid,'tables',3));
  affected:=apply_schedule_edit_v2(op,kid,mid,cell,'[]','[]',empty_cell);
  if affected<>1 then raise exception 'incorrect v2 result'; end if;
  if apply_schedule_edit_v2(op,kid,mid,cell,'[]','[]',empty_cell)<>1 then raise exception 'lost-response replay failed'; end if;
  if (select count(*) from schedule_private.edit_receipts where actor_id=mid)<>1 then raise exception 'duplicate receipt'; end if;
  begin perform apply_schedule_edit_v2(op,kid,mid,'[]',cell,'[]',occupied_cell); raise exception 'operation ID reused with new intent'; exception when serialization_failure then null; end;
  begin perform apply_schedule_edit_v2(gen_random_uuid(),kid,mid,cell,'[]','[]',empty_cell); raise exception 'stale empty cell accepted'; exception when serialization_failure then null; end;
  begin perform apply_schedule_edit_v2(gen_random_uuid(),kid,mid,cell,'[]','[]',empty_cell||empty_cell); raise exception 'duplicate expectation accepted'; exception when invalid_parameter_value then null; end;
  begin perform apply_schedule_edit_v2(gen_random_uuid(),kid,mid,cell,'[]','[]','[]'); raise exception 'missing expectation accepted'; exception when invalid_parameter_value then null; end;
  begin perform apply_schedule_edit_v2(gen_random_uuid(),kid,mid,'[]',cell,'[]',
    jsonb_build_array(jsonb_build_object('date',day,'half',20,'level',0,'member_id',mid,'tables',2)));
    raise exception 'own deletion ignored changed table count'; exception when serialization_failure then null; end;
  if not exists(select 1 from occupancy where kind_id=kid and slot_date=day and half=20 and tables=3) then raise exception 'failed edit changed data'; end if;

  snapshot:=load_schedule_snapshot_v2(y,m); versions:=load_schedule_versions(y,m);
  if snapshot->'revisions'<>versions or jsonb_array_length(snapshot->'slots')<>1 then raise exception 'inconsistent snapshot/revisions'; end if;
  if not exists(select 1 from jsonb_array_elements(versions->'targets') t where t->>'date'=day::text and t->>'kind_id'=kid::text) then raise exception 'missing target version'; end if;
  select count(*) into messages from realtime.messages where topic='app:changes' and event='slots' and payload->>'date'=day::text and payload->>'kind_id'=kid::text;
  if messages<>1 then raise exception 'transaction slot event not coalesced'; end if;
  perform apply_schedule_edit_v2(gen_random_uuid(),kid,mid,'[]',cell,'[]',occupied_cell);
  if load_schedule_snapshot_v2(y,m)->'slots'<>'[]'::jsonb or load_schedule_versions(y,m)<>versions then raise exception 'deleted target lost tombstone or transaction version'; end if;
  if not exists(select 1 from realtime.messages where topic='schedule:changes' and event='slots' and payload->>'date'=day::text and payload->>'kind_id'=kid::text) then raise exception 'legacy notification missing'; end if;

  insert into discord_members(discord_id,username) values(uid::text,'event-driven-fixture');
  insert into discord_sync_runs(id) values(uid);
  -- Reset only private fixture bookkeeping to test semantic no-op in this transaction.
  update schedule_private.sync_versions set changed_in=-1 where key in ('directory','priorities','access');
  versions:=load_schedule_versions(y,m);
  update discord_members set synced_at=clock_timestamp(),last_sync_id=uid where discord_id=uid::text;
  if load_schedule_versions(y,m)<>versions then raise exception 'timestamp-only update invalidated domain'; end if;
  update members set mark_tag='EW' where id=mid;
  if load_schedule_versions(y,m)->>'directory'=versions->>'directory' then raise exception 'semantic profile update not invalidated'; end if;
  if load_schedule_versions(y,m)->>'access'<>versions->>'access' then raise exception 'cosmetic mark triggered authorization refresh'; end if;
  insert into profiles(member_id,display_name) values(mid,'Event profile')
    on conflict(member_id) do update set display_name=excluded.display_name;
  if load_schedule_versions(y,m)->>'access'<>versions->>'access' then raise exception 'profile triggered authorization refresh'; end if;
  update member_table_presets set tables=2 where member_id=mid and position=1;
  if load_schedule_versions(y,m)->>'access'<>versions->>'access' then raise exception 'preset triggered authorization refresh'; end if;
  insert into identities(member_id,provider,provider_uid,username,guild_present)
    values(mid,'discord',uid::text,'before',true);
  update schedule_private.sync_versions set changed_in=-1 where key in ('directory','priorities','access');
  versions:=load_schedule_versions(y,m);
  update identities set username='after' where member_id=mid;
  if load_schedule_versions(y,m)->>'access'<>versions->>'access' then raise exception 'username triggered authorization refresh'; end if;
  update identities set discord_roles='[{"id":"event-driven-role","name":"Before"}]' where member_id=mid;
  update schedule_private.sync_versions set changed_in=-1 where key='access';
  versions:=load_schedule_versions(y,m);
  update identities set discord_roles='[{"id":"event-driven-role","name":"After"}]' where member_id=mid;
  if load_schedule_versions(y,m)->>'access'<>versions->>'access' then raise exception 'cosmetic role name triggered authorization refresh'; end if;
  update identities set guild_present=false where member_id=mid;
  if load_schedule_versions(y,m)->>'access'=versions->>'access' then raise exception 'membership access change not broadcast'; end if;

  -- A complete unchanged Discord refresh used to toggle every role absent/present.
  -- Two runs differ in last_sync_id but must not create application invalidations.
  roster:=jsonb_build_array(jsonb_build_object('discord_id',uid::text,'username','event-driven-fixture','roles','[]'::jsonb));
  roles:=jsonb_build_array(jsonb_build_object('id','event-driven-role','name','Event driven role'));
  perform replace_discord_roster('{"id":"event-driven-guild","name":"Fixture","member_count":1}',roster,roles);
  update schedule_private.sync_versions set changed_in=-1 where key in ('directory','priorities','access');
  versions:=load_schedule_versions(y,m);
  perform replace_discord_roster('{"id":"event-driven-guild","name":"Fixture","member_count":1}',roster,roles);
  if load_schedule_versions(y,m)<>versions then raise exception 'unchanged Discord roster created invalidations'; end if;

  perform set_config('realtime.topic','app:changes',true);
  execute 'set local role authenticated';
  if not exists(select 1 from realtime.messages where topic='app:changes') then raise exception 'active receive denied'; end if;
  insert into realtime.messages(topic,event,payload,private,extension) values('app:changes','presence','{}',true,'presence');
  begin insert into realtime.messages(topic,event,payload,private,extension) values('app:changes','config','{}',true,'broadcast');
    raise exception 'client forged config event'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update members set access_status='blocked' where id=mid;
  begin perform load_schedule_configuration(); raise exception 'blocked bootstrap accepted'; exception when insufficient_privilege then null; end;
  begin perform load_schedule_versions(y,m); raise exception 'blocked metadata accepted'; exception when insufficient_privilege then null; end;
  begin perform save_schedule_sync(false,5,true,8); raise exception 'blocked root settings accepted'; exception when insufficient_privilege then null; end;
  begin perform apply_schedule_edit_v2(op,kid,mid,cell,'[]','[]',empty_cell); raise exception 'receipt bypassed revoked access'; exception when insufficient_privilege then null; end;
  execute 'set local role authenticated';
  if exists(select 1 from realtime.messages where topic='app:changes') then raise exception 'blocked receiver accepted'; end if;
  begin insert into realtime.messages(topic,event,payload,private,extension) values('app:changes','presence','{}',true,'presence');
    raise exception 'blocked presence accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
