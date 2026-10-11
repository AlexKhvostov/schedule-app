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

  placements := jsonb_build_array(
    jsonb_build_object('date',current_date-1,'half',20,'level',0,'tables',1),
    jsonb_build_object('date',future,'half',24,'level',0,'tables',1)
  );
  events_before := apply_own_slots(kind,actor,placements,'[]');
  if events_before <> 1 or not exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=24 and member_id=actor) then
    raise exception 'reproduction did not match';
  end if;
  raise notice 'REPRODUCED: requested=2 affected=%; own range partly saved without error', events_before;
  placements := jsonb_build_array(
    jsonb_build_object('date',current_date-1,'half',20,'level',0,'tables',1),
    jsonb_build_object('date',future,'half',25,'level',0,'tables',1)
  );
  begin
    perform apply_schedule_edit(kind,actor,placements,'[]','[]');
    raise exception 'strict RPC did not reject expired cell';
  exception when sqlstate '40001' then
    if sqlerrm <> 'schedule-conflict' then raise; end if;
  end;
  if exists(select 1 from occupancy where kind_id=kind and slot_date=future and half=25 and member_id=actor) then
    raise exception 'strict RPC partly saved';
  end if;
  raise notice 'VERIFIED: strict atomic RPC rejects expired range with no partial insert';
end;
$$;
rollback;