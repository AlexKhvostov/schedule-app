begin;
do $$
declare
  auth_id uuid := gen_random_uuid();
  viewer uuid;
  recent_member uuid;
  old_member uuid;
  schedule_kind uuid;
begin
  if has_table_privilege('authenticated','public.member_presence','SELECT')
    or has_table_privilege('authenticated','public.member_presence','INSERT')
    or has_function_privilege('anon','public.list_member_presence()','EXECUTE')
    or has_function_privilege('anon','public.ping_member_presence(boolean)','EXECUTE') then
    raise exception 'presence grants expose direct access';
  end if;
  insert into auth.users(id,email) values(auth_id,'presence-test@example.invalid');
  insert into public.members(auth_user_id,public_code,access_status)
    values(auth_id,'RP-PRESENCE-VIEWER','active') returning id into viewer;
  insert into public.members(public_code,access_status)
    values('RP-PRESENCE-RECENT','active') returning id into recent_member;
  insert into public.members(public_code,access_status)
    values('RP-PRESENCE-OLD','active') returning id into old_member;
  insert into public.member_presence values
    (viewer,now()-interval '3 minutes',now()-interval '22 minutes'),
    (recent_member,now()-interval '5 minutes',now()-interval '41 minutes'),
    (old_member,now()-interval '25 hours',now()-interval '25 hours');
  select id into strict schedule_kind from public.schedule_kinds
    where variant_id='nitro' and limit_id='50' limit 1;
  insert into public.occupancy_events(at,action,member_id,actor_id,kind_id,slot_date,half,level)
    values(now()-interval '5 minutes','place',old_member,recent_member,schedule_kind,current_date,0,0);

  perform set_config('request.jwt.claim.sub',auth_id::text,true);
  execute 'set local role authenticated';
  perform public.ping_member_presence(false);
  if not exists(select 1 from public.list_member_presence() p
    where p.member_id=viewer and p.online and p.activity_minutes=22) then
    raise exception 'background ping advanced interaction time or failed to mark presence';
  end if;
  if not exists(select 1 from public.list_member_presence() p
    where p.member_id=recent_member and not p.online and p.activity_minutes=41
      and p.edit_minutes=5 and p.edit_variant='nitro' and p.edit_limit='50') then
    raise exception 'recent visitor or last edit summary missing';
  end if;
  if exists(select 1 from public.list_member_presence() p where p.member_id=old_member) then
    raise exception 'old visitor still listed';
  end if;
  perform public.ping_member_presence(true);
  if not exists(select 1 from public.list_member_presence() p where p.member_id=viewer and p.activity_minutes=0) then
    raise exception 'interaction not recorded';
  end if;
  execute 'reset role';
  update public.members set access_status='blocked' where id=viewer;
  execute 'set local role authenticated';
  begin
    perform public.list_member_presence();
    raise exception 'blocked viewer can read presence';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.ping_member_presence(true);
    raise exception 'blocked viewer can write presence';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
rollback;
