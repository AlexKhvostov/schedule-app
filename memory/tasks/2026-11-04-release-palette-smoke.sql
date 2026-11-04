-- Working smoke: uses existing root identity, synthetic ordinary member, transaction rollback.
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
begin
  select m.auth_user_id,m.id into root_auth,root_member from public.members m join public.member_roles r on r.member_id=m.id where r.role_id='root' and m.auth_user_id is not null limit 1;
  if root_auth is null then raise exception 'root fixture unavailable'; end if;
  insert into auth.users(id,email) values(plain_auth,'schedule-release-check@example.invalid');
  insert into public.members(auth_user_id,public_code,access_status) values(plain_auth,'RP-RELCHK','active') returning id into plain_member;
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
end;
$$;
rollback;
