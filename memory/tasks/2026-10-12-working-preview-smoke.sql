-- Working-only smoke: existing root, no fixture users, all writes rolled back.
begin;
set local lock_timeout = '5s';
do $$
declare
  actor uuid;
  actor_auth uuid;
  kind uuid;
  test_day date := current_date + 370;
  test_half integer;
  snapshot jsonb;
  places jsonb;
  removals jsonb;
begin
  select m.id,m.auth_user_id into actor,actor_auth
  from members m join member_roles mr on mr.member_id=m.id
  where mr.role_id='root' and m.access_status='active'
    and m.auth_user_id is not null and nullif(btrim(m.mark_tag),'') is not null
  limit 1;
  if actor is null then raise exception 'No existing active root brush'; end if;
  select k.id into kind from schedule_kinds k
  join players p on p.room_id=k.room_id and p.member_id=actor
  join player_limits pl on pl.player_id=p.id and pl.variant_id=k.variant_id and pl.limit_id=k.limit_id
  cross join schedule_settings s
  where s.id and case k.variant_id
    when 'nitro' then k.limit_id=any(s.filter_limits_nitro)
    when 'regular' then k.limit_id=any(s.filter_limits_regular)
    else false end
  order by k.variant_id,k.limit_id limit 1;
  if kind is null then raise exception 'Root has no selected enabled schedule limit'; end if;
  select g.half into test_half from generate_series(0,47) as g(half)
  where not exists(select 1 from occupancy o where o.kind_id=kind and o.slot_date=test_day and o.half=g.half and o.level=0)
  limit 1;
  if test_half is null then raise exception 'No empty smoke seat'; end if;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  snapshot := admin_distance_book(date_trunc('month',now())::date,'winamax');
  if snapshot->>'people_filters_version' <> '1' then raise exception 'Missing distance metadata'; end if;
  if exists(select 1 from jsonb_array_elements(snapshot->'entries') e
    where not (e ?& array['roles','present','has_active_profile','profile_member_id','avatar_url','discord_nick'])
      or jsonb_typeof(e->'roles') <> 'array'
      or jsonb_typeof(e->'present') <> 'boolean'
      or jsonb_typeof(e->'has_active_profile') <> 'boolean') then
    raise exception 'Incomplete distance metadata';
  end if;
  places := jsonb_build_array(jsonb_build_object('date',test_day,'half',test_half,'level',0,'tables',2));
  removals := jsonb_build_array(jsonb_build_object('date',test_day,'half',test_half,'level',0));
  if apply_schedule_edit(kind,actor,places,'[]','[]') <> 1 then raise exception 'Place count mismatch'; end if;
  if not exists(select 1 from occupancy where kind_id=kind and slot_date=test_day and half=test_half and level=0 and member_id=actor and tables=2) then
    raise exception 'Placement missing or incorrect table snapshot';
  end if;
  begin
    perform apply_schedule_edit(kind,actor,jsonb_build_array(jsonb_build_object('date',current_date-1,'half',0,'level',0)),'[]','[]');
    raise exception 'Expired seat accepted';
  exception when sqlstate '40001' then null;
  end;
  if apply_schedule_edit(kind,actor,'[]',removals,'[]') <> 1 then raise exception 'Remove count mismatch'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform admin_distance_book(date_trunc('month',now())::date,'winamax');
    raise exception 'Outsider read distance book';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform apply_schedule_edit(kind,actor,places,'[]','[]');
    raise exception 'Outsider used schedule edit';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
rollback;
select jsonb_build_object('smoke','passed; all writes rolled back',
  'members',(select count(*) from public.members),
  'occupancy',(select count(*) from public.occupancy),
  'distance_entries',(select count(*) from public.distance_entries)) as working_smoke;
