-- Disposable local database only. All fixture rows, messages and changes roll back.
begin;
do $$
declare
  uid uuid := gen_random_uuid(); mid uuid; kid uuid; pid uuid; payload jsonb; other_day date;
  first_day date := make_date(extract(year from current_date)::integer+2,1,1);
  target jsonb; before_messages bigint;
begin
  if has_function_privilege('anon','public.load_schedule_snapshot(integer,integer,jsonb,boolean)','EXECUTE') then
    raise exception 'anonymous compact read grant';
  end if;
  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
    values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','compact@example.invalid',now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(uid,'RP-COMPACT','active','CP') returning id into mid;
  insert into member_roles(member_id,role_id) values(mid,'root');
  select id into kid from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;
  insert into players(member_id,room_id) select mid,room_id from schedule_kinds where id=kid
    on conflict(member_id,room_id) do update set room_id=excluded.room_id returning id into pid;
  insert into player_limits(player_id,variant_id,limit_id) values(pid,'nitro','50') on conflict do nothing;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform save_schedule_filter_limits(array['50','100'],array['50']);
  insert into occupancy(kind_id,slot_date,half,level,member_id,tables)
    select kid,first_day+n/48,(n%48)::smallint,0,mid,3 from generate_series(0,1099)n;
  payload := load_schedule_snapshot(extract(year from first_day)::integer,1);
  if jsonb_array_length(payload->'slots')<>1100 or jsonb_array_length(payload->'members')<>1 then
    raise exception 'compact month incomplete or duplicated directory';
  end if;
  if exists(select 1 from jsonb_array_elements(payload->'slots')s where s ? 'mark_tag' or s ? 'discord') then
    raise exception 'slot repeats owner metadata';
  end if;
  target := jsonb_build_array(jsonb_build_object('date',first_day,'kind_id',kid));
  payload := load_schedule_snapshot(extract(year from first_day)::integer,1,target);
  if jsonb_array_length(payload->'slots')<>48 then raise exception 'slice crossed its day'; end if;
  select count(*) into before_messages from realtime.messages where topic='schedule:changes' and event='slots';
  delete from occupancy where kind_id=kid and slot_date=first_day;
  -- Inserts and deletion are in one transaction: one commit notification per target.
  if (select count(*) from realtime.messages where topic='schedule:changes' and event='slots')<>before_messages then
    raise exception 'same transaction published duplicate coordinates';
  end if;
  if not exists(select 1 from realtime.messages msg where topic='schedule:changes' and event='slots'
    and msg.payload->>'date'=first_day::text and msg.payload->>'kind_id'=kid::text) then raise exception 'invalid notification coordinates'; end if;
  payload := load_schedule_snapshot(extract(year from first_day)::integer,1,target);
  if payload->'slots'<>'[]'::jsonb then raise exception 'empty slice not empty'; end if;
  update members set mark_tag='CQ' where id=mid;
  payload := load_schedule_snapshot(extract(year from first_day)::integer,1,null,true);
  if payload->'slots'<>'[]'::jsonb or payload->'members'->0->>'mark_tag'<>'CQ' then raise exception 'directory refresh failed'; end if;
  other_day := first_day + interval '1 month';
  begin
    perform load_schedule_snapshot(extract(year from first_day)::integer,1,jsonb_build_array(jsonb_build_object('date',other_day,'kind_id',kid)));
    raise exception 'cross-month read accepted';
  exception when sqlstate '22023' then null; end;
  perform set_config('realtime.topic','schedule:changes',true);
  execute 'set local role authenticated';
  if not exists(select 1 from realtime.messages where topic='schedule:changes') then raise exception 'authorized receive denied'; end if;
  begin
    insert into realtime.messages(topic,event,payload,private,extension) values('schedule:changes','slots','{}',true,'broadcast');
    raise exception 'client forged a broadcast';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update members set access_status='blocked' where id=mid;
  delete from member_roles where member_id=mid;
  begin
    perform load_schedule_snapshot(extract(year from first_day)::integer,1);
    raise exception 'blocked member read schedule';
  exception when insufficient_privilege then null; end;
  execute 'set local role authenticated';
  if exists(select 1 from realtime.messages where topic='schedule:changes') then raise exception 'blocked receiver accepted'; end if;
  execute 'reset role';
end;
$$;
rollback;
