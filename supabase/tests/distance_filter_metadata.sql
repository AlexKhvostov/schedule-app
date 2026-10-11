-- Disposable fixtures. Current roles are independent of profile/access status.
begin;
do $$
declare
  actor_auth uuid := gen_random_uuid();
  actor uuid;
  active_player uuid;
  blocked_player uuid;
  room uuid;
  role_id text;
  month date := date_trunc('month',now())::date;
  snapshot jsonb;
  entry jsonb;
begin
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',actor_auth,'authenticated','authenticated','distance-filter@example.invalid','',now(),now(),now());
  insert into members (auth_user_id,public_code,access_status,mark_tag)
    values (actor_auth,'RP-DBKROOT','active','DR') returning id into actor;
  insert into member_roles (member_id,role_id) values (actor,'root');
  insert into members (public_code,access_status,mark_tag) values ('RP-DBKACTIVE','active','DA') returning id into active_player;
  insert into members (public_code,access_status,mark_tag) values ('RP-DBKBLOCK','blocked','DB') returning id into blocked_player;
  insert into member_roles (member_id,role_id) values (active_player,'member'),(blocked_player,'member');
  insert into profiles (member_id) values (active_player),(blocked_player) on conflict (member_id) do nothing;
  select required_discord_role_id into role_id from club_settings where id;
  select id into room from rooms where slug='winamax';
  insert into discord_members (discord_id,username,roles,present) values
    ('990000000000000001','HistoryRP',jsonb_build_array(jsonb_build_object('id',role_id)),true),
    ('990000000000000002','ActiveRP',jsonb_build_array(jsonb_build_object('id',role_id)),true),
    ('990000000000000003','BlockedRP',jsonb_build_array(jsonb_build_object('id',role_id)),true),
    ('990000000000000004','LeftRP',jsonb_build_array(jsonb_build_object('id',role_id)),false);
  update discord_members set avatar_url='https://cdn.discordapp.com/embed/avatars/0.png',guild_nick='CurrentHistoryNick'
    where discord_id='990000000000000001';
  insert into identities (member_id,provider,provider_uid,guild_present,discord_roles) values
    (active_player,'discord','990000000000000002',true,jsonb_build_array(jsonb_build_object('id',role_id))),
    (blocked_player,'discord','990000000000000003',true,jsonb_build_array(jsonb_build_object('id',role_id)));
  insert into distance_entries (room_id,month_start,variant_id,source,discord_id,distance_ext_id,member_id) values
    (room,month,'nitro','historical','990000000000000001','990001',null),
    (room,month,'nitro','historical','990000000000000002','990002',null),
    (room,month,'nitro','historical','990000000000000003','990003',blocked_player),
    (room,month,'nitro','historical','990000000000000004','990004',null);
  insert into distance_values (entry_id,limit_id,tournaments)
    select id,'50',100 from distance_entries where distance_ext_id in ('990001','990002','990003','990004');
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  snapshot := admin_distance_book(month,'winamax');
  if snapshot->>'people_filters_version' <> '1' then raise exception 'missing filter contract'; end if;
  select value into entry from jsonb_array_elements(snapshot->'entries') where value->>'distance_ext_id'='990001';
  if not (entry->>'present')::boolean or not (entry->'roles') @> jsonb_build_array(jsonb_build_object('id',role_id))
    or (entry->>'has_active_profile')::boolean then raise exception 'historical RP without profile classified incorrectly'; end if;
  if entry->>'avatar_url' <> 'https://cdn.discordapp.com/embed/avatars/0.png' or entry->>'discord_nick' <> 'CurrentHistoryNick' then
    raise exception 'historical Discord avatar or nickname lost'; end if;
  select value into entry from jsonb_array_elements(snapshot->'entries') where value->>'distance_ext_id'='990002';
  if not (entry->>'has_active_profile')::boolean or entry->>'profile_member_id' <> active_player::text then
    raise exception 'active profile not linked through Discord identity'; end if;
  select value into entry from jsonb_array_elements(snapshot->'entries') where value->>'distance_ext_id'='990003';
  if not (entry->>'present')::boolean or (entry->>'has_active_profile')::boolean
    or not (entry->'roles') @> jsonb_build_array(jsonb_build_object('id',role_id)) then
    raise exception 'blocked profile must not remove current Discord role'; end if;
  select value into entry from jsonb_array_elements(snapshot->'entries') where value->>'distance_ext_id'='990004';
  if (entry->>'present')::boolean then raise exception 'left Discord user treated as present'; end if;
  if exists(select 1 from jsonb_array_elements(snapshot->'people') x where x->>'member_id'=blocked_player::text) then
    raise exception 'blocked profile in active roster'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform admin_distance_book(month,'winamax');
    raise exception 'outsider read distance metadata';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
rollback;
