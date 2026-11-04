-- Working smoke: uses existing root identity, synthetic ordinary member, transaction rollback.
begin;
do $$
declare
  root_auth uuid := gen_random_uuid();
  plain_auth uuid := gen_random_uuid();
  root_member uuid;
  plain_member uuid;
  empty_row jsonb := (select jsonb_agg(null::text) from generate_series(1,24));
  peach jsonb;
  sky jsonb;
  before_flags jsonb;
  bad jsonb;
begin
  select m.auth_user_id,m.id into root_auth,root_member from public.members m join public.member_roles r on r.member_id=m.id where r.role_id='root' and m.auth_user_id is not null limit 1;
  if root_auth is null then raise exception 'root fixture unavailable'; end if;
  insert into auth.users(id,email) values(plain_auth,'schedule-release-check@example.invalid');
  insert into public.members(auth_user_id,public_code,access_status) values(plain_auth,'RP-RELCHK','active') returning id into plain_member;
  select to_jsonb(s) - array['hour_load','updated_by','updated_at'] into before_flags from public.schedule_settings s where id;
  peach := jsonb_set(empty_row,'{3}','"peach"');
  sky := jsonb_set(empty_row,'{3}','"sky"');
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  perform public.save_schedule_hour_load('nitro:50',peach,empty_row);
  perform public.save_schedule_hour_load('regular:50',sky,empty_row);
  perform public.save_schedule_hour_load('nitro:100',empty_row,empty_row);
  if (select hour_load #>> '{nitro:50,3}' from public.schedule_settings where id) <> 'peach'
    or (select hour_load #>> '{regular:50,3}' from public.schedule_settings where id) <> 'sky'
    or (select hour_load -> 'nitro:100' from public.schedule_settings where id) <> empty_row then
    raise exception 'pair isolation failed'; end if;
  -- Different-pair writes must not cause a conflict or erase earlier rows.
  perform public.save_schedule_hour_load('nitro:50',sky,peach);
  begin
    perform public.save_schedule_hour_load('nitro:50',peach,peach);
    raise exception 'stale write allowed';
  exception when serialization_failure then null; end;
  foreach bad in array array[null::jsonb,'{}'::jsonb,'[]'::jsonb,
    jsonb_set(empty_row,'{3}','"rgba(1,2,3,.2)"'),jsonb_set(empty_row,'{3}','7')] loop
    begin
      perform public.save_schedule_hour_load('nitro:50',bad,sky);
      raise exception 'invalid row accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.save_schedule_hour_load('nitro:50:',peach,empty_row);
    raise exception 'invalid key accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update public.schedule_settings set hour_load='{}' where id;
    raise exception 'direct update allowed';
  exception when insufficient_privilege then null; end;
  if (select to_jsonb(s) - array['hour_load','updated_by','updated_at'] from public.schedule_settings s where id) is distinct from before_flags then
    raise exception 'unrelated flags changed'; end if;
  if (select updated_by from public.schedule_settings where id) <> root_member then raise exception 'audit missing'; end if;
  perform set_config('request.jwt.claim.sub',plain_auth::text,true);
  if (select hour_load -> 'nitro:50' from public.schedule_settings where id) <> sky then raise exception 'player read failed'; end if;
  begin
    perform public.save_schedule_hour_load('nitro:50',peach,sky);
    raise exception 'player write allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  insert into public.discord_guild_roles(role_id,name) values('hour-load-admin','Load admin');
  insert into public.discord_role_permissions(role_id,permission_code) values('hour-load-admin','schedule.manage');
  insert into public.identities(member_id,provider,provider_uid,guild_present,discord_roles)
    select plain_member,'discord',plain_auth::text,true,jsonb_build_array(
      jsonb_build_object('id',s.required_discord_role_id),jsonb_build_object('id','hour-load-admin'))
    from public.club_settings s where id;
  execute 'set local role authenticated';
  perform public.save_schedule_hour_load('nitro:50',empty_row,sky);
  execute 'reset role';
  delete from public.discord_role_permissions where role_id='hour-load-admin';
  execute 'set local role authenticated';
  begin
    perform public.save_schedule_hour_load('nitro:50',peach,empty_row);
    raise exception 'revoked permission allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.save_schedule_hour_load('nitro:50',peach,empty_row);
    raise exception 'missing identity allowed';
  exception when insufficient_privilege then null; end;
  execute 'set local role anon';
  begin
    perform public.save_schedule_hour_load('nitro:50',peach,empty_row);
    raise exception 'anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
