-- Shared palette permissions, atomic validation, concurrency and read access.
begin;
do $$
declare
  root_auth uuid := gen_random_uuid();
  plain_auth uuid := gen_random_uuid();
  root_member uuid;
  plain_member uuid;
  original jsonb;
  changed jsonb;
  actual jsonb;
  bad jsonb;
  original_flags jsonb;
  kinds_before bigint;
  original_tint jsonb;
  actual_tint jsonb;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values (root_auth, 'authenticated', 'authenticated', 'palette-root@example.invalid', '', now(), now()),
         (plain_auth, 'authenticated', 'authenticated', 'palette-player@example.invalid', '', now(), now());
  insert into public.members (auth_user_id, public_code, access_status, mark_tag)
  values (root_auth, 'RP-PALROOT', 'active', 'PR') returning id into root_member;
  insert into public.member_roles (member_id, role_id) values (root_member, 'root');
  insert into public.members (auth_user_id, public_code, access_status, mark_tag)
  values (plain_auth, 'RP-PALUSER', 'active', 'PU') returning id into plain_member;
  select limit_palette, to_jsonb(s) - array['limit_palette','updated_at','updated_by']
    into original, original_flags from public.schedule_settings s where id;
  select count(*) into kinds_before from public.schedule_kinds;
  if original #>> '{5,dark}' <> '#ff7070' or original #>> '{100,dark}' <> '#d8dee9'
    or not public.valid_schedule_limit_palette(original) then raise exception 'wrong defaults'; end if;
  changed := jsonb_set(original, '{50,dark}', '"#ABCDEF"');

  perform set_config('request.jwt.claim.sub', root_auth::text, true);
  execute 'set local role authenticated';
  perform public.save_schedule_limit_palette(changed, original);
  select limit_palette into actual from public.schedule_settings where id;
  if actual #>> '{50,dark}' <> '#abcdef' then raise exception 'not normalized/saved'; end if;
  begin
    update public.schedule_settings set limit_palette = original where id;
    raise exception 'direct palette update allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_schedule_limit_palette(original, original);
    raise exception 'stale save allowed';
  exception when serialization_failure then null; end;
  foreach bad in array array[null::jsonb, '{}'::jsonb, original - '25',
    original || '{"999":{"light":"#ffffff","dark":"#ffffff"}}',
    jsonb_set(original, '{50}', 'null'),
    jsonb_set(original, '{50,dark}', '"red"'),
    jsonb_set(original, '{50,light}', '"#abc"'),
    jsonb_set(original, '{50,extra}', '"#ffffff"')] loop
    begin
      perform public.save_schedule_limit_palette(bad, actual);
      raise exception 'invalid palette accepted: %', bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  if (select limit_palette from public.schedule_settings where id) is distinct from actual then
    raise exception 'failed save changed palette'; end if;
  if (select to_jsonb(s) - array['limit_palette','updated_at','updated_by'] from public.schedule_settings s where id) is distinct from original_flags then
    raise exception 'unrelated settings changed'; end if;
  if (select updated_by from public.schedule_settings where id) is distinct from root_member then raise exception 'audit missing'; end if;

  perform set_config('request.jwt.claim.sub', plain_auth::text, true);
  if (select limit_palette from public.schedule_settings where id) is distinct from actual then raise exception 'player cannot read'; end if;
  begin
    perform public.save_schedule_limit_palette(original, actual);
    raise exception 'player changed palette';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_schedule_limit_palette(original, actual);
    raise exception 'missing identity accepted';
  exception when insufficient_privilege then null; end;
  execute 'set local role anon';
  begin
    perform public.save_schedule_limit_palette(original, actual);
    raise exception 'anon RPC allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- An ordinary member can save only while its Discord role grants schedule.manage.
  insert into public.discord_guild_roles (role_id, name) values ('palette-test-admin', 'Palette test admin');
  insert into public.discord_role_permissions (role_id, permission_code) values ('palette-test-admin', 'schedule.manage');
  insert into public.identities (member_id, provider, provider_uid, guild_present, discord_roles)
  select plain_member, 'discord', plain_auth::text, true, jsonb_build_array(
    jsonb_build_object('id', s.required_discord_role_id), jsonb_build_object('id', 'palette-test-admin')
  ) from public.club_settings s where id;
  perform set_config('request.jwt.claim.sub', plain_auth::text, true);
  execute 'set local role authenticated';
  perform public.save_schedule_limit_palette(original, actual);
  perform public.save_schedule_limit_palette(actual, original);
  execute 'reset role';
  delete from public.discord_role_permissions where role_id = 'palette-test-admin';
  execute 'set local role authenticated';
  begin
    perform public.save_schedule_limit_palette(original, actual);
    raise exception 'revoked admin permission accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if (select count(*) from public.schedule_kinds) <> kinds_before then raise exception 'playable limits changed'; end if;
  perform set_config('request.jwt.claim.sub', root_auth::text, true);
  perform public.save_schedule_limit_palette(original, actual);
  if (select limit_palette from public.schedule_settings where id) is distinct from original then raise exception 'reset failed'; end if;

  -- Combined appearance editor: validation and conflict checks cover both fields atomically.
  select slot_tint into original_tint from public.schedule_settings where id;
  if original_tint <> '{"enabled":true,"strength":8}'::jsonb then raise exception 'wrong tint default'; end if;
  execute 'set local role authenticated';
  perform public.save_schedule_appearance(changed, original, '{"enabled":false,"strength":24}', original_tint);
  select limit_palette, slot_tint into actual, actual_tint from public.schedule_settings where id;
  if actual #>> '{50,dark}' <> '#abcdef' or actual_tint <> '{"enabled":false,"strength":24}'::jsonb then
    raise exception 'appearance was not saved'; end if;
  begin
    update public.schedule_settings set slot_tint = original_tint where id;
    raise exception 'direct tint update allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_schedule_appearance(original, actual, original_tint, original_tint);
    raise exception 'stale tint accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_schedule_appearance(original, original, original_tint, actual_tint);
    raise exception 'stale palette accepted';
  exception when serialization_failure then null; end;
  foreach bad in array array[null::jsonb, '{}'::jsonb, '[]'::jsonb,
    '{"enabled":"true","strength":8}'::jsonb, '{"enabled":true,"strength":31}'::jsonb,
    '{"enabled":true,"strength":-1}'::jsonb, '{"enabled":true,"strength":8.5}'::jsonb,
    '{"enabled":true,"strength":null}'::jsonb, '{"enabled":true,"strength":8,"extra":1}'::jsonb] loop
    if public.valid_schedule_slot_tint(bad) then raise exception 'bad tint passed validation'; end if;
    begin
      perform public.save_schedule_appearance(original, actual, bad, actual_tint);
      raise exception 'bad appearance write accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  if (select limit_palette from public.schedule_settings where id) <> actual
     or (select slot_tint from public.schedule_settings where id) <> actual_tint then raise exception 'partial write'; end if;
  if not public.valid_schedule_slot_tint('{"enabled":true,"strength":0}')
     or not public.valid_schedule_slot_tint('{"enabled":true,"strength":30}') then raise exception 'boundary rejected'; end if;
  perform set_config('request.jwt.claim.sub', plain_auth::text, true);
  if (select slot_tint from public.schedule_settings where id) <> actual_tint then raise exception 'player tint read failed'; end if;
  begin
    perform public.save_schedule_appearance(original, actual, original_tint, actual_tint);
    raise exception 'player changed appearance';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_schedule_appearance(original, actual, original_tint, actual_tint);
    raise exception 'no identity changed appearance';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform public.save_schedule_appearance(original, actual, original_tint, actual_tint);
    raise exception 'anon appearance RPC allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  insert into public.discord_role_permissions (role_id, permission_code) values ('palette-test-admin', 'schedule.manage');
  perform set_config('request.jwt.claim.sub', plain_auth::text, true);
  execute 'set local role authenticated';
  perform public.save_schedule_appearance(original, actual, original_tint, actual_tint);
  execute 'reset role';
  delete from public.discord_role_permissions where role_id = 'palette-test-admin';
  execute 'set local role authenticated';
  begin
    perform public.save_schedule_appearance(changed, original, actual_tint, original_tint);
    raise exception 'revoked permission changed appearance';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

end;
$$;
rollback;
