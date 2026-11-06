begin;

do $$
declare
  root_auth uuid := gen_random_uuid(); reader_auth uuid := gen_random_uuid();
  root_id uuid; reader_id uuid; context jsonb; affected integer;
begin
  if not exists (select 1 from public.app_permissions where code='dashboard' and section='module') then
    raise exception 'Dashboard must be an assignable module permission';
  end if;
  if exists (select 1 from public.discord_role_permissions where permission_code='dashboard') then
    raise exception 'Clean migrations must not automatically grant Dashboard to roles';
  end if;
  if has_function_privilege('anon','public.member_access_context()','EXECUTE')
    or has_table_privilege('anon','public.discord_role_permissions','INSERT') then
    raise exception 'Anonymous permission access';
  end if;
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
    (root_auth,'authenticated','authenticated','dashboard-root@example.invalid','',now(),now()),
    (reader_auth,'authenticated','authenticated','dashboard-reader@example.invalid','',now(),now());
  insert into public.members(auth_user_id,public_code,access_status) values(root_auth,'DASH-ROOT','active') returning id into root_id;
  insert into public.members(auth_user_id,public_code,access_status) values(reader_auth,'DASH-READER','active') returning id into reader_id;
  insert into public.member_roles(member_id,role_id) values(root_id,'root');
  insert into public.discord_guild_roles(role_id,name) values('dashboard-test-role','Dashboard test role');
  insert into public.identities(member_id,provider,provider_uid,guild_present,discord_roles)
    select reader_id,'discord',reader_auth::text,true,jsonb_build_array(jsonb_build_object('id',required_discord_role_id),jsonb_build_object('id','dashboard-test-role'))
    from public.club_settings where id;

  perform set_config('request.jwt.claim.sub',reader_auth::text,true);
  execute 'set local role authenticated';
  context := public.member_access_context();
  if context->'permissions' ? 'dashboard' then raise exception 'Reader initially has no Dashboard grant'; end if;
  begin
    insert into public.discord_role_permissions(role_id,permission_code) values('dashboard-test-role','dashboard');
    raise exception 'Ordinary reader assigned their own access';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  if not (public.member_access_context()->'permissions' ? 'dashboard') then raise exception 'Root lost Dashboard'; end if;
  insert into public.discord_role_permissions(role_id,permission_code) values('dashboard-test-role','dashboard');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',reader_auth::text,true);
  execute 'set local role authenticated';
  context := public.member_access_context();
  if not (context->'permissions' ? 'dashboard') then raise exception 'Role grant missing from server context'; end if;
  if context->'permissions' ? 'schedule' then raise exception 'Dashboard must not imply schedule'; end if;
  delete from public.discord_role_permissions where role_id='dashboard-test-role' and permission_code='dashboard';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Reader must not change role grants'; end if;
  execute 'reset role';

  update public.members set access_status='blocked' where id=reader_id;
  if public.member_has_permission(reader_id,'dashboard') then raise exception 'Blocked member retains permission'; end if;
  update public.members set access_status='active' where id=reader_id;
  update public.identities set guild_present=false where member_id=reader_id;
  if public.member_has_permission(reader_id,'dashboard') then raise exception 'Departed Discord member retains permission'; end if;
  update public.identities set guild_present=true,discord_roles='[]'::jsonb where member_id=reader_id;
  if public.member_has_permission(reader_id,'dashboard') then raise exception 'Removed role retains permission'; end if;
  update public.identities set discord_roles=(select jsonb_build_array(jsonb_build_object('id',required_discord_role_id),jsonb_build_object('id','dashboard-test-role')) from public.club_settings where id) where member_id=reader_id;

  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  delete from public.discord_role_permissions where role_id='dashboard-test-role' and permission_code='dashboard';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',reader_auth::text,true);
  execute 'set local role authenticated';
  if public.member_access_context()->'permissions' ? 'dashboard' then raise exception 'Revoked grant persists'; end if;
  execute 'reset role';
end $$;

rollback;
