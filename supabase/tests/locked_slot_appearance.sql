begin;
do $$
declare
  admin_auth uuid := gen_random_uuid();
  player_auth uuid := gen_random_uuid();
  admin_member uuid;
  player_member uuid;
  original jsonb;
  other_settings jsonb;
  changed jsonb;
  actual jsonb;
  bad jsonb;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values (admin_auth, 'authenticated', 'authenticated', 'locked-admin@example.invalid', '', now(), now()),
         (player_auth, 'authenticated', 'authenticated', 'locked-player@example.invalid', '', now(), now());
  insert into public.members (auth_user_id, public_code, access_status, mark_tag)
  values (admin_auth, 'RP-LOCKADMIN', 'active', 'LA') returning id into admin_member;
  insert into public.member_roles (member_id, role_id) values (admin_member, 'root');
  insert into public.members (auth_user_id, public_code, access_status, mark_tag)
  values (player_auth, 'RP-LOCKUSER', 'active', 'LU') returning id into player_member;
  select locked_slot_appearance, to_jsonb(s) - array['locked_slot_appearance','updated_at','updated_by']
    into original, other_settings from public.schedule_settings s where id;
  if original <> '{"light":"#d5dbe4","dark":"#343e50","short":"","long":"","merge":true}'::jsonb then raise exception 'wrong defaults'; end if;
  changed := '{"light":"#ABCDEF","dark":"#123456","short":"Closed","long":"No capacity available","merge":false}'::jsonb;
  perform set_config('request.jwt.claim.sub', admin_auth::text, true);
  execute 'set local role authenticated';
  perform public.save_schedule_locked_appearance(changed, original);
  select locked_slot_appearance into actual from public.schedule_settings where id;
  if actual->>'light' <> '#abcdef' or actual->>'long' <> 'No capacity available' or (actual->>'merge')::boolean then raise exception 'save/normalization failed'; end if;
  begin
    update public.schedule_settings set locked_slot_appearance = original where id;
    raise exception 'direct update permitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_schedule_locked_appearance(original, original);
    raise exception 'stale update permitted';
  exception when serialization_failure then null; end;
  foreach bad in array array[null::jsonb, '{}'::jsonb, '[]'::jsonb, original - 'short', original || '{"extra":true}',
    jsonb_set(original, '{light}', '"red"'), jsonb_set(original, '{dark}', 'null'), jsonb_set(original, '{merge}', '"true"'),
    jsonb_set(original, '{short}', to_jsonb(repeat('x',13))), jsonb_set(original, '{long}', to_jsonb(repeat('x',121)))] loop
    begin
      perform public.save_schedule_locked_appearance(bad, actual);
      raise exception 'invalid value accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  if (select locked_slot_appearance from public.schedule_settings where id) <> actual then raise exception 'failed write changed state'; end if;
  if (select to_jsonb(s) - array['locked_slot_appearance','updated_at','updated_by'] from public.schedule_settings s where id) is distinct from other_settings then raise exception 'other settings overwritten'; end if;
  if (select updated_by from public.schedule_settings where id) <> admin_member then raise exception 'audit missing'; end if;
  perform set_config('request.jwt.claim.sub', player_auth::text, true);
  if (select locked_slot_appearance from public.schedule_settings where id) <> actual then raise exception 'player cannot read'; end if;
  begin
    perform public.save_schedule_locked_appearance(original, actual);
    raise exception 'player write permitted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_schedule_locked_appearance(original, actual);
    raise exception 'no identity permitted';
  exception when insufficient_privilege then null; end;
  execute 'set local role anon';
  begin
    perform public.save_schedule_locked_appearance(original, actual);
    raise exception 'anonymous RPC permitted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- A real administrator permission, and its immediate revocation, without a root role.
  insert into public.discord_guild_roles (role_id, name) values ('locked-admin-test', 'Locked appearance admin');
  insert into public.discord_role_permissions (role_id, permission_code) values ('locked-admin-test', 'schedule.manage');
  insert into public.identities (member_id, provider, provider_uid, guild_present, discord_roles)
  select player_member, 'discord', player_auth::text, true, jsonb_build_array(
    jsonb_build_object('id', s.required_discord_role_id), jsonb_build_object('id', 'locked-admin-test')) from public.club_settings s where id;
  perform set_config('request.jwt.claim.sub', player_auth::text, true);
  execute 'set local role authenticated';
  perform public.save_schedule_locked_appearance(original, actual);
  execute 'reset role';
  delete from public.discord_role_permissions where role_id = 'locked-admin-test';
  execute 'set local role authenticated';
  begin
    perform public.save_schedule_locked_appearance(changed, original);
    raise exception 'revoked permission accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$$;
rollback;
