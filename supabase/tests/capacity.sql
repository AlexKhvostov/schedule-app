-- Disposable database only. Check each Nitro/Regular pair and roll everything back.
begin;
do $$
declare
  actor_auth uuid := gen_random_uuid(); actor uuid; outsider_auth uuid := gen_random_uuid();
  k record; n uuid; e uuid; room uuid; player uuid; profile jsonb; profiles jsonb;
  future date := current_date + 370; caps smallint[]; wd text; dom text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
    values(actor_auth,'authenticated','authenticated','capacity-admin@example.invalid','',now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(actor_auth,'CAP-ADMIN','active','CA') returning id into actor;
  insert into member_roles(member_id,role_id) values(actor,'root');
  select id into room from rooms where slug='winamax';
  insert into players(member_id,room_id) values(actor,room)
    on conflict(member_id,room_id) do update set room_id=excluded.room_id returning id into player;
  insert into player_limits(player_id,variant_id,limit_id)
    select player,variant_id,limit_id from schedule_kinds where room_id=room on conflict do nothing;
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  for k in select distinct variant_id from schedule_kinds where room_id=room loop
    profile := jsonb_build_object('hours',to_jsonb(array_fill(case when k.variant_id='nitro' then 2 else 4 end,array[24])),
      'days','{}'::jsonb,'weekdays','{}'::jsonb,'equalize',false,'weekOn',true,'monthOn',true);
    select jsonb_object_agg(limit_id,profile) into profiles from schedule_kinds where room_id=room and variant_id=k.variant_id;
    perform save_capacity_profiles(k.variant_id,profiles);
  end loop;
  for k in select * from schedule_kinds where room_id=room loop
    caps := hours_of(k.id,future);
    if caps <> array_fill(case when k.variant_id='nitro' then 2 else 4 end::smallint,array[24]) then
      raise exception 'wrong capacity for % %',k.variant_id,k.limit_id;
    end if;
  end loop;
  select id into n from schedule_kinds where room_id=room and variant_id='nitro' and limit_id='50';
  select id into e from schedule_kinds where room_id=room and variant_id='regular' and limit_id='50';
  -- A third Regular lane is legal; the same lane in Nitro is closed.
  insert into occupancy(member_id,kind_id,slot_date,half,level,tables) values(actor,e,future,20,2,1);
  begin
    insert into occupancy(member_id,kind_id,slot_date,half,level,tables) values(actor,n,future,21,2,1);
    raise exception 'Nitro accepted a closed level';
  exception when others then if sqlerrm <> 'level is locked' then raise; end if; end;
  dom := extract(day from future)::text; wd := extract(dow from future)::text;
  profile := jsonb_build_object('hours',to_jsonb(array_fill(4,array[24])),
    'days',jsonb_build_object(dom,to_jsonb(array_fill(3,array[24]))),
    'weekdays',jsonb_build_object(wd,to_jsonb(array_fill(2,array[24]))),
    'equalize',true,'weekOn',true,'monthOn',true);
  perform save_capacity_profiles('regular',jsonb_build_object('50',profile));
  if hours_of(e,future) <> array_fill(2::smallint,array[24]) then raise exception 'week/month minimum failed'; end if;
  if not exists(select 1 from occupancy where kind_id=e and slot_date=future and level=2) then raise exception 'capacity reduction removed a mark'; end if;
  profile := jsonb_set(profile,'{weekOn}','false');
  perform save_capacity_profiles('regular',jsonb_build_object('50',profile));
  if hours_of(e,future) <> array_fill(3::smallint,array[24]) then raise exception 'disabled week still applied'; end if;
  for k in select * from schedule_kinds where room_id=room and id<>e loop
    if hours_of(k.id,future) <> array_fill(case when k.variant_id='nitro' then 2 else 4 end::smallint,array[24]) then raise exception 'saving E50 changed another pair'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',outsider_auth::text,true);
  begin
    perform save_capacity_profiles('regular',jsonb_build_object('50',profile));
    raise exception 'unprivileged capacity save accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$$;
rollback;
