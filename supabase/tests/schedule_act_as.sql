-- Disposable local database. Test the public read/write path as authenticated.
begin;
do $$
declare
  actor_auth uuid := gen_random_uuid(); target_auth uuid := gen_random_uuid(); admin_auth uuid := gen_random_uuid();
  actor uuid; target uuid; admin_id uuid; kind uuid; other_kind uuid; target_player uuid;
  future date := current_date + 370;
  place jsonb;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
    (actor_auth,'authenticated','authenticated','act-as-actor@example.invalid','',now(),now()),
    (target_auth,'authenticated','authenticated','act-as-target@example.invalid','',now(),now()),
    (admin_auth,'authenticated','authenticated','act-as-admin@example.invalid','',now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(actor_auth,'ACT-AS-A','active','AA') returning id into actor;
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(target_auth,'ACT-AS-B','active','BB') returning id into target;
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(admin_auth,'ACT-AS-C','active','CC') returning id into admin_id;
  insert into discord_guild_roles(role_id,name) values('act-as-player','Act as player'),('act-as-admin','Act as people admin');
  insert into discord_role_permissions(role_id,permission_code) values('act-as-player','schedule'),('act-as-admin','admin.people'),('act-as-admin','schedule.manage');
  insert into discord_role_schedule_limits(role_id,variant_id,limit_id) values('act-as-player','nitro','50');
  insert into identities(member_id,provider,provider_uid,guild_present,discord_roles)
    select m,'discord',m::text,true,jsonb_build_array(jsonb_build_object('id',s.required_discord_role_id),
      jsonb_build_object('id',case when m=admin_id then 'act-as-admin' else 'act-as-player' end))
    from unnest(array[actor,target,admin_id]) m cross join club_settings s where s.id;
  select id into kind from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;
  select id into other_kind from schedule_kinds where variant_id='regular' and limit_id='50' limit 1;
  select p.id into target_player from players p join schedule_kinds k on k.room_id=p.room_id where p.member_id=target and k.id=kind;
  insert into player_limits(player_id,variant_id,limit_id)
    select p.id,'nitro','50' from players p where p.member_id in(actor,target) on conflict do nothing;
  insert into player_limits(player_id,variant_id,limit_id) values(target_player,'regular','50') on conflict do nothing;
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  update schedule_settings set allow_act_as=true,allow_overwrite_marks=false,filter_limits_nitro=array['50'],filter_limits_regular=array['50'] where id;
  update capacity_rules set hours=array_fill(1::smallint,array[24]) where kind_id in(kind,other_kind);
  place := jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'tables',1));
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  if is_staff() then raise exception 'fixture actor must be an ordinary player'; end if;
  if not exists(select 1 from effective_schedule_access(array[target]) where variant_id='nitro' and limit_id='50') then
    raise exception 'ordinary act-as cannot read recipient access';
  end if;
  if exists(select 1 from effective_schedule_access(array[target]) where variant_id='regular') then
    raise exception 'access response invented recipient limits';
  end if;
  if apply_schedule_edit(kind,target,place,'[]','[]')<>1 then raise exception 'ordinary act-as failed'; end if;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=20 and member_id=target and placed_by=actor) then
    raise exception 'wrong owner or author';
  end if;
  -- A second actor cannot overwrite the occupied seat through a placement.
  begin
    perform apply_schedule_edit(kind,actor,place,'[]','[]');
    raise exception 'occupied seat was overwritten';
  exception when others then if sqlerrm<>'seat taken' then raise; end if; end;
  begin
    perform apply_schedule_edit(kind,actor,'[]','[]',jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'member_id',target)));
    raise exception 'act-as enabled foreign removal';
  exception when others then if sqlerrm<>'overwrite-off' then raise; end if; end;
  place := jsonb_build_array(jsonb_build_object('date',future,'half',21,'level',0,'tables',1));
  begin
    perform apply_schedule_edit(other_kind,target,place,'[]','[]');
    raise exception 'recipient schedule restriction bypassed';
  exception when others then
    if sqlerrm<>'no schedule access' then raise; end if;
  end;
  begin
    perform apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',21,'level',1,'tables',1)),'[]','[]');
    raise exception 'closed seat accepted';
  exception when others then if sqlerrm<>'level is locked' then raise; end if; end;
  begin
    perform apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',current_date-1,'half',21,'level',0)),'[]','[]');
    raise exception 'past seat accepted';
  exception when others then if sqlerrm<>'schedule-conflict' then raise; end if; end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  update schedule_settings set allow_act_as=false where id;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from effective_schedule_access(array[target])) then raise exception 'act-as-off exposed other access'; end if;
  if not exists(select 1 from effective_schedule_access(array[actor])) then raise exception 'act-as-off removed self access'; end if;
  begin
    perform apply_schedule_edit(kind,target,place,'[]','[]');
    raise exception 'act-as-off accepted placement';
  exception when others then if sqlerrm<>'not allowed' then raise; end if; end;
  if apply_schedule_edit(kind,actor,place,'[]','[]')<>1 then raise exception 'self placement failed'; end if;
  -- People administrators retain the existing exception, without root.
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  if not is_staff() or is_root() then raise exception 'bad admin fixture'; end if;
  if not exists(select 1 from effective_schedule_access(array[target])) then raise exception 'admin lost recipient read'; end if;
  if apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',22,'level',0)),'[]','[]')<>1 then
    raise exception 'admin act-as-off exception broken';
  end if;

  execute 'reset role';
  update schedule_settings set allow_act_as=true where id;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  update members set access_status='blocked' where id=actor;
  execute 'set local role authenticated';
  if exists(select 1 from effective_schedule_access(array[target])) then raise exception 'blocked actor read recipient'; end if;
  begin
    perform apply_schedule_edit(kind,target,place,'[]','[]');
    raise exception 'blocked actor placed';
  exception when others then if sqlerrm<>'member is not active' then raise; end if; end;
  execute 'reset role';
  update members set access_status='active' where id=actor;
  update members set access_status='blocked' where id=target;
  execute 'set local role authenticated';
  if exists(select 1 from effective_schedule_access(array[target])) then raise exception 'blocked recipient access returned'; end if;
  begin
    perform apply_schedule_edit(kind,target,place,'[]','[]');
    raise exception 'blocked recipient placed';
  exception when others then if sqlerrm<>'member is not active' then raise; end if; end;
  execute 'reset role';
  update members set access_status='active' where id=target;
  delete from player_limits where player_id=target_player and variant_id='nitro' and limit_id='50';
  execute 'set local role authenticated';
  begin
    perform apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',23,'level',0)),'[]','[]');
    raise exception 'unselected player limit placed';
  exception when others then if sqlerrm<>'schedule-player-limit-not-selected' then raise; end if; end;
  execute 'reset role';
  insert into player_limits(player_id,variant_id,limit_id) values(target_player,'nitro','50');
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  update schedule_settings set filter_limits_nitro=array['100'] where id;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  begin
    perform apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',23,'level',0)),'[]','[]');
    raise exception 'club-disabled limit placed';
  exception when others then if sqlerrm<>'schedule-filter-limit-disabled' then raise; end if; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  update schedule_settings set filter_limits_nitro=array['50'] where id;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  update members set mark_tag='' where id=target;
  execute 'set local role authenticated';
  begin
    perform apply_schedule_edit(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',23,'level',0)),'[]','[]');
    raise exception 'empty mark placed';
  exception when others then if sqlerrm<>'schedule-mark-required' then raise; end if; end;
  -- No profile and users without schedule permission do not get new read rights.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from effective_schedule_access(array[target])) then raise exception 'unlinked user read recipient'; end if;
  execute 'reset role';
  update members set mark_tag='BB' where id=target;
  update identities set discord_roles=jsonb_build_array(jsonb_build_object('id',(select required_discord_role_id from club_settings where id))) where member_id=actor;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from effective_schedule_access(array[target])) then raise exception 'non-schedule user read recipient'; end if;
  execute 'reset role';
  if has_function_privilege('anon','public.effective_schedule_access(uuid[])','EXECUTE') then raise exception 'anon can read access'; end if;
end;
$$;
rollback;
