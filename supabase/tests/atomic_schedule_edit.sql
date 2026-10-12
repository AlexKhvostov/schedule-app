-- Disposable database only. Fixtures and every mutation are rolled back.
begin;

do $$
declare
  actor_auth uuid := gen_random_uuid();
  target_auth uuid := gen_random_uuid();
  stranger_auth uuid := gen_random_uuid();
  actor uuid;
  target uuid;
  stranger uuid;
  kind uuid;
  player uuid;
  future date := current_date + 370;
  foreign_slots jsonb;
  own_slots jsonb;
  placements jsonb;
  events_before bigint;
begin
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',actor_auth,'authenticated','authenticated','atomic-actor@example.invalid','',now(),now(),now()),
    ('00000000-0000-0000-0000-000000000000',target_auth,'authenticated','authenticated','atomic-target@example.invalid','',now(),now(),now()),
    ('00000000-0000-0000-0000-000000000000',stranger_auth,'authenticated','authenticated','atomic-stranger@example.invalid','',now(),now(),now());
  insert into members (auth_user_id,public_code,access_status,mark_tag)
    values (actor_auth,'RP-ATOACT','active','Z1') returning id into actor;
  insert into members (auth_user_id,public_code,access_status,mark_tag)
    values (target_auth,'RP-ATOTGT','active','Z2') returning id into target;
  insert into members (auth_user_id,public_code,access_status,mark_tag)
    values (stranger_auth,'RP-ATOSTR','active','Z3') returning id into stranger;
  insert into member_roles (member_id,role_id) values (actor,'root');
  insert into discord_guild_roles (role_id,name) values ('atomic-test-player-role','Atomic test player');
  insert into discord_role_permissions (role_id,permission_code) values ('atomic-test-player-role','schedule');
  insert into discord_role_schedule_limits (role_id,variant_id,limit_id) values ('atomic-test-player-role','nitro','50');
  insert into identities (member_id,provider,provider_uid,guild_present,discord_roles)
  select target,'discord',target_auth::text,true,jsonb_build_array(
    jsonb_build_object('id',s.required_discord_role_id),jsonb_build_object('id','atomic-test-player-role')
  ) from club_settings s where s.id;
  select id into kind from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;
  insert into players (member_id,room_id) select actor,room_id from schedule_kinds where id=kind
    on conflict (member_id,room_id) do update set room_id=excluded.room_id returning id into player;
  insert into player_limits (player_id,variant_id,limit_id) values (player,'nitro','50') on conflict do nothing;
  insert into player_limits (player_id,variant_id,limit_id)
    select p.id,'nitro','50' from players p join schedule_kinds k on k.room_id=p.room_id
    where p.member_id=target and k.id=kind on conflict do nothing;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  perform save_schedule_filter_limits(array['50'],array['50']);

  foreign_slots := jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'member_id',target));
  own_slots := jsonb_build_array(jsonb_build_object('date',future,'half',21,'level',0));
  placements := jsonb_build_array(
    jsonb_build_object('date',future,'half',20,'level',0,'tables',3),
    jsonb_build_object('date',future,'half',22,'level',0,'tables',7)
  );
  perform apply_own_slots(kind,target,jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'tables',1)),'[]');
  perform apply_own_slots(kind,actor,jsonb_build_array(jsonb_build_object('date',future,'half',21,'level',0,'tables',1)),'[]');
  select count(*) into events_before from occupancy_events;

  -- A placement guard fails after both removal steps. Neither seats nor events may commit.
  delete from player_limits where player_id=player and variant_id='nitro' and limit_id='50';
  begin
    perform apply_schedule_edit(kind,actor,placements,own_slots,foreign_slots);
    raise exception 'disabled player selection did not fail';
  exception when sqlstate '42501' then
    if sqlerrm <> 'schedule-player-limit-not-selected' then raise; end if;
  end;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=20 and member_id=target)
    or not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=21 and member_id=actor)
    or exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=22)
    or (select count(*) from occupancy_events) <> events_before then
    raise exception 'failed mixed range partially committed seats or events';
  end if;
  insert into player_limits (player_id,variant_id,limit_id) values (player,'nitro','50');

  -- An old confirmation may not remove a different owner.
  begin
    perform apply_schedule_edit(kind,actor,placements,own_slots,
      jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'member_id',stranger)));
    raise exception 'stale owner confirmation succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'schedule-conflict' then raise; end if;
  end;

  -- Removal remains protected even though the new function is SECURITY DEFINER.
  update schedule_settings set allow_overwrite_marks=false where id;
  perform set_config('request.jwt.claim.sub',stranger_auth::text,true);
  begin
    perform apply_schedule_edit(kind,stranger,'[]','[]',foreign_slots);
    raise exception 'stranger removed a foreign mark';
  exception when others then
    if sqlerrm <> 'overwrite-off' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);

  -- No actor can use the wrapper to bypass act-as permission.
  perform set_config('request.jwt.claim.sub',stranger_auth::text,true);
  begin
    perform apply_schedule_edit(kind,target,
      jsonb_build_array(jsonb_build_object('date',future,'half',24,'level',0,'tables',1)),'[]','[]');
    raise exception 'stranger painted as another player';
  exception when sqlstate '42501' then
    if sqlerrm <> 'not allowed' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);

  -- Malformed placement must not turn a replacement into a removal-only commit.
  begin
    perform apply_schedule_edit(kind,actor,
      jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'tables','bad')),
      own_slots,foreign_slots);
    raise exception 'invalid table count did not fail';
  exception when sqlstate '22P02' then null;
  end;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=20 and member_id=target)
    or not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=21 and member_id=actor) then
    raise exception 'malformed replacement removed existing shifts';
  end if;

  -- Mixed replacement succeeds, including independent per-seat table snapshots.
  if apply_schedule_edit(kind,actor,placements,own_slots,foreign_slots) <> 4 then
    raise exception 'wrong mixed range affected count';
  end if;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=20 and member_id=actor and tables=3)
    or exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=21)
    or not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=22 and member_id=actor and tables=7) then
    raise exception 'mixed range result is incorrect';
  end if;

  -- Ordinary gestures use this same RPC. A seat expiring during queue/network
  -- waiting must reject the whole placement/removal, including its events.
  select count(*) into events_before from occupancy_events;
  begin
    perform apply_schedule_edit(kind,actor,jsonb_build_array(
      jsonb_build_object('date',future,'half',30,'level',0,'tables',1),
      jsonb_build_object('date',current_date-1,'half',20,'level',0,'tables',1)
    ),'[]','[]');
    raise exception 'ordinary placement accepted an expired seat';
  exception when sqlstate '40001' then
    if sqlerrm <> 'schedule-conflict' then raise; end if;
  end;
  if exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=30)
    or (select count(*) from occupancy_events) <> events_before then
    raise exception 'ordinary expired placement partially committed';
  end if;
  begin
    perform apply_schedule_edit(kind,actor,'[]',jsonb_build_array(
      jsonb_build_object('date',future,'half',22,'level',0),
      jsonb_build_object('date',current_date-1,'half',20,'level',0)
    ),'[]');
    raise exception 'ordinary removal accepted an expired seat';
  exception when sqlstate '40001' then
    if sqlerrm <> 'schedule-conflict' then raise; end if;
  end;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=22 and member_id=actor)
    or (select count(*) from occupancy_events) <> events_before then
    raise exception 'ordinary expired removal partially committed';
  end if;

  -- Empty brushes cannot create slots; clearing a profile does not erase old rows.
  update members set mark_tag=null where id=actor;
  begin
    perform apply_own_slots(kind,actor,jsonb_build_array(jsonb_build_object('date',future,'half',24,'level',0,'tables',1)),'[]');
    raise exception 'empty brush placed occupancy';
  exception when sqlstate '42501' then
    if sqlerrm <> 'schedule-mark-required' then raise; end if;
  end;
  perform apply_own_slots(kind,actor,'[]',jsonb_build_array(jsonb_build_object('date',future,'half',22,'level',0)));
end;
$$;

rollback;
