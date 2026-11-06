begin;
do $$
declare
  admin_auth uuid:=gen_random_uuid(); reader_auth uuid:=gen_random_uuid(); outsider_auth uuid:=gen_random_uuid();
  admin_id uuid; reader_id uuid; outsider_id uuid; room uuid; entry uuid;
  august jsonb; preview jsonb; roster jsonb; changed jsonb; unchanged jsonb; bad date;
begin
  if (select active_period from public.priority_settings where id)<>'2026-08-01' then raise exception 'wrong initial period'; end if;
  if has_table_privilege('authenticated','public.priority_settings','SELECT')
    or has_table_privilege('authenticated','public.priority_settings','UPDATE')
    or has_function_privilege('anon','public.set_active_priority(date,bigint)','EXECUTE')
    or has_function_privilege('anon','public.load_priority_view(date,text,text,boolean)','EXECUTE')
    or has_function_privilege('anon','public.load_active_month_roster(text,text,text[],text,text)','EXECUTE') then raise exception 'grants leak'; end if;
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
    (admin_auth,'authenticated','authenticated','active-admin@example.invalid','',now(),now()),
    (reader_auth,'authenticated','authenticated','active-reader@example.invalid','',now(),now()),
    (outsider_auth,'authenticated','authenticated','active-outsider@example.invalid','',now(),now());
  insert into public.members(auth_user_id,public_code,access_status) values(admin_auth,'ACT-ADMIN','active') returning id into admin_id;
  insert into public.members(auth_user_id,public_code,access_status,distance_ext_id) values(reader_auth,'ACT-READER','active','987650') returning id into reader_id;
  insert into public.members(auth_user_id,public_code,access_status) values(outsider_auth,'ACT-OUT','active') returning id into outsider_id;
  insert into public.member_roles(member_id,role_id) values(admin_id,'root');
  insert into public.discord_guild_roles(role_id,name) values('active-reader-role','Priority reader');
  insert into public.discord_role_permissions(role_id,permission_code) values('active-reader-role','priorities'),('active-reader-role','schedule');
  insert into public.identities(member_id,provider,provider_uid,guild_present,discord_roles)
    select reader_id,'discord',reader_auth::text,true,jsonb_build_array(jsonb_build_object('id',required_discord_role_id),jsonb_build_object('id','active-reader-role')) from public.club_settings where id;
  select id into room from public.rooms where slug='winamax';
  insert into public.distance_entries(member_id,room_id,month_start,variant_id,source,distance_ext_id)
    values(reader_id,room,'2026-07-01','nitro','manual','987650') returning id into entry;
  insert into public.distance_values(entry_id,limit_id,tournaments) values(entry,'50',10);
  perform set_config('request.jwt.claim.sub',reader_auth::text,true);
  execute 'set local role authenticated';
  august:=public.load_priority_view(null,'nitro','50-100');
  if august->>'periodStart'<>'2026-08-01' or august->>'activePeriod'<>'2026-08-01' or (august->>'canActivate')::boolean then raise exception 'reader default/rights'; end if;
  preview:=public.load_priority_view('2026-11-01','nitro','50-100');
  if preview->>'periodStart'<>'2026-11-01' or preview->>'activePeriod'<>'2026-08-01' then raise exception 'preview activated itself'; end if;
  roster:=public.load_active_month_roster('nitro','50-100',array['50']);
  if roster->>'periodStart'<>'2026-08-01' then raise exception 'roster uses calendar'; end if;
  unchanged:=public.load_priority_view(null,'nitro','50-100');
  if unchanged->>'calculatedAt'<>august->>'calculatedAt' then raise exception 'valid read recalculated'; end if;
  begin perform public.set_active_priority('2026-11-01',0); raise exception 'reader activated'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_auth::text,true);
  foreach bad in array array[null::date,'2026-09-01'::date,'2026-08-02'::date,'1999-11-01'::date] loop
    begin perform public.set_active_priority(bad,0); raise exception 'invalid period accepted'; exception when invalid_parameter_value then null; end;
  end loop;
  perform public.set_active_priority('2026-11-01',0);
  begin perform public.set_active_priority('2026-05-01',0); raise exception 'stale switch accepted'; exception when serialization_failure then null; end;
  changed:=public.load_active_month_roster('nitro','50-100',array['50'],roster->>'revision',roster->>'directoryRevision');
  if changed->>'periodStart'<>'2026-11-01' or changed->'people'='null'::jsonb then raise exception 'activation retained old array'; end if;
  unchanged:=public.load_priority_view(null,'regular','50-100');
  if unchanged->>'periodStart'<>'2026-11-01' then raise exception 'regular not switched'; end if;
  unchanged:=public.load_priority_view(null,'nitro','250');
  if exists(select 1 from jsonb_array_elements(unchanged->'people') p where (p->'calculation'->>'total')::numeric<>0) then raise exception '250 scores changed'; end if;
  execute 'reset role';
  update public.distance_values set tournaments=40 where entry_id=entry;
  perform set_config('request.jwt.claim.sub',reader_auth::text,true);
  execute 'set local role authenticated';
  unchanged:=public.load_active_month_roster('nitro','50-100',array['50']);
  if not exists(select 1 from jsonb_array_elements(unchanged->'people') p where p->>'memberId'=reader_id::text and (p->>'score')::numeric=20) then raise exception 'active calculation frozen'; end if;
  if (public.load_priority_view(null,'nitro','50-100')->>'activeRevision')::int<>1 then raise exception 'distance update changed selection'; end if;
  -- A granted administrator can switch, but revocation takes effect immediately.
  execute 'reset role';
  insert into public.discord_role_permissions(role_id,permission_code) values('active-reader-role','admin.people');
  execute 'set local role authenticated';
  perform public.set_active_priority('2026-08-01',1);
  execute 'reset role';
  delete from public.discord_role_permissions where role_id='active-reader-role' and permission_code='admin.people';
  execute 'set local role authenticated';
  begin perform public.set_active_priority('2026-11-01',2); raise exception 'revoked admin activated'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider_auth::text,true);
  begin perform public.load_priority_view(null,'nitro','50-100'); raise exception 'outsider read'; exception when insufficient_privilege then null; end;
  begin perform public.load_active_month_roster('nitro','50-100',array['50']); raise exception 'outsider roster'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.set_active_priority('2026-11-01',2); raise exception 'missing identity'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
