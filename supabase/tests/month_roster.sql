-- Disposable data only. Check projection equivalence, independent revisions and authorization.
begin;
do $$
declare
  actor_auth uuid := gen_random_uuid(); outsider_auth uuid := gen_random_uuid();
  actor uuid; target uuid; outsider uuid; room uuid; player uuid; entry uuid;
  full_source jsonb; first_read jsonb; next_read jsonb; expected jsonb;
  kind text; grp text;
begin
  if has_function_privilege('anon','public.load_month_roster(date,text,text,text[],text,text)','EXECUTE')
    or has_table_privilege('authenticated','public.priority_rating_cache','SELECT') then
    raise exception 'roster/cache grants leak';
  end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',actor_auth,'authenticated','authenticated','roster-reader@example.invalid','',now(),now(),now()),
    ('00000000-0000-0000-0000-000000000000',outsider_auth,'authenticated','authenticated','roster-outsider@example.invalid','',now(),now(),now());
  insert into members(auth_user_id,public_code,access_status) values(actor_auth,'ROSTER-READER','active') returning id into actor;
  insert into members(auth_user_id,public_code,access_status) values(outsider_auth,'ROSTER-OUT','active') returning id into outsider;
  target:=actor;
  update members set mark_tag='ZX',vip_nitro=998,vip_regular=997,core_nitro_250=996,core_regular_250=995 where id=target;
  insert into member_roles(member_id,role_id) values(actor,'root');
  select id into room from rooms where slug='winamax';
  insert into players(member_id,room_id) values(target,room) on conflict(member_id,room_id) do update set room_id=excluded.room_id returning id into player;
  insert into player_limits(player_id,variant_id,limit_id) values(player,'nitro','50'),(player,'regular','100'),(player,'nitro','250') on conflict do nothing;
  insert into distance_entries(member_id,room_id,month_start,variant_id,source,distance_ext_id) values(target,room,'2026-10-01','nitro','manual','987651') returning id into entry;
  insert into distance_values(entry_id,limit_id,tournaments) values(entry,'50',10),(entry,'100',4);
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  foreach kind in array array['nitro','regular'] loop
    foreach grp in array array['50-100','250'] loop
      full_source:=load_priority_slice('2026-11-01',kind,grp);
      first_read:=load_month_roster('2026-11-01',kind,grp,array['50','100','250']);
      select jsonb_agg(jsonb_build_object('memberId',p->'memberId',
        'core',p->case when grp='250' then case when kind='nitro' then 'coreNitro250' else 'coreRegular250' end else case when kind='nitro' then 'vipNitro' else 'vipRegular' end end,
        'score',p->'calculation'->'total','excluded',p->case when kind='nitro' then 'excludedNitro' else 'excludedRegular' end) order by p->>'memberId') into expected
        from jsonb_array_elements(full_source->'people') p;
      if first_read->'people' is distinct from expected then raise exception 'compact projection changed order inputs: % %',kind,grp; end if;
      if first_read->>'calculatedAt' is distinct from full_source->>'calculatedAt' then raise exception 'valid cache recalculated'; end if;
      next_read:=load_month_roster('2026-11-01',kind,grp,array['250','100','50'],first_read->>'revision',first_read->>'directoryRevision');
      if next_read->'people'<>'null'::jsonb or next_read->'directory'<>'null'::jsonb then raise exception 'unchanged arrays resent'; end if;
      if octet_length(next_read::text)>=octet_length(first_read::text) then raise exception 'conditional read not smaller'; end if;
    end loop;
  end loop;
  first_read:=load_month_roster('2026-11-01','nitro','50-100',array['50']);
  execute 'reset role';
  -- Display-only change: preserve ranking revision but deliver the new mark.
  update members set mark_tag='ZY' where id=target;
  execute 'set local role authenticated';
  next_read:=load_month_roster('2026-11-01','nitro','50-100',array['50'],first_read->>'revision',first_read->>'directoryRevision');
  if next_read->'people'<>'null'::jsonb or next_read->'directory'='null'::jsonb
    or not exists(select 1 from jsonb_array_elements(next_read->'directory') d where d->>'member_id'=target::text and d->>'mark_tag'='ZY') then raise exception 'directory-only change lost'; end if;
  first_read:=load_month_roster('2026-11-01','nitro','50-100',array['50']);
  execute 'reset role';
  update distance_values set tournaments=20 where entry_id=entry and limit_id='50';
  execute 'set local role authenticated';
  next_read:=load_month_roster('2026-11-01','nitro','50-100',array['50'],first_read->>'revision',first_read->>'directoryRevision');
  if next_read->'directory'<>'null'::jsonb or not exists(select 1 from jsonb_array_elements(next_read->'people') p where p->>'memberId'=target::text and (p->>'score')::numeric=28) then raise exception 'score-only change lost'; end if;
  first_read:=load_month_roster('2026-11-01','nitro','50-100',array['50']);
  next_read:=load_month_roster('2026-11-01','nitro','250',array['50'],first_read->>'revision',first_read->>'directoryRevision');
  if next_read->'people'='null'::jsonb then raise exception 'group reused another group revision'; end if;
  next_read:=load_month_roster('2026-08-01','nitro','50-100',array['50'],first_read->>'revision',first_read->>'directoryRevision');
  if next_read->'people'='null'::jsonb then raise exception 'period reused another period revision'; end if;
  execute 'reset role';
  -- Access changes can affect the directory without changing the cached score.
  delete from player_limits where player_id=player and variant_id='nitro' and limit_id='50';
  execute 'set local role authenticated';
  next_read:=load_month_roster('2026-11-01','nitro','50-100',array['50'],first_read->>'revision',first_read->>'directoryRevision');
  if next_read->'directory'='null'::jsonb or exists(select 1 from jsonb_array_elements(next_read->'directory') d where d->>'member_id'=target::text) then raise exception 'membership permissions not rechecked'; end if;
  perform set_config('request.jwt.claim.sub',outsider_auth::text,true);
  begin
    perform load_month_roster('2026-11-01','nitro','50-100',array['50'],first_read->>'revision',first_read->>'directoryRevision');
    raise exception 'outsider conditional read authorized';
  exception when sqlstate '42501' then null; end;
  execute 'reset role';
end $$;
rollback;
