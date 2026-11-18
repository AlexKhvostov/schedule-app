-- Completion is independent of occupied cells and has its own actor and audit time.
alter table public.schedule_settings add column lock_fill_queue boolean not null default false;
alter table public.bot_settings add column fill_channels jsonb not null default '{}'
  check (jsonb_typeof(fill_channels)='object'
    and (fill_channels - array['nitro','regular','both'])='{}'
    and coalesce(fill_channels->>'nitro','') ~ '^([0-9]{17,20})?$'
    and coalesce(fill_channels->>'regular','') ~ '^([0-9]{17,20})?$'
    and coalesce(fill_channels->>'both','') ~ '^([0-9]{17,20})?$');

create table schedule_private.fill_completions (
  id uuid not null unique default gen_random_uuid(),
  month date not null,
  queue text not null check (queue in ('nitro','regular','both')),
  member_id uuid not null,
  actor_id uuid not null,
  skipped boolean not null default false,
  at timestamptz not null default clock_timestamp(),
  primary key (month,queue,member_id)
);
create index fill_completions_audit on schedule_private.fill_completions(at desc,id desc);
alter table schedule_private.fill_completions enable row level security;
revoke all on schedule_private.fill_completions from public,anon,authenticated;

create table schedule_private.fill_deliveries (
  completion_id uuid not null references schedule_private.fill_completions(id) on delete cascade,
  destination text not null check (destination in ('channel','dm')),
  channel_id text,
  discord_id text,
  next_member uuid not null,
  completed_name text not null,
  delegated boolean not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  error_code text,
  primary key (completion_id,destination)
);
create index fill_deliveries_due on schedule_private.fill_deliveries(next_at)
  where status in ('pending','sending');
alter table schedule_private.fill_deliveries enable row level security;
revoke all on schedule_private.fill_deliveries from public,anon,authenticated;

-- Use the same projection as the roster. The client displays this exact numbered
-- order whenever it has the corresponding roster revision.
create collation schedule_private.fill_nickname (provider=icu, locale='ru-u-kn-true-ks-level1', deterministic=false);

create function schedule_private.fill_order(p_queue text)
returns table(member_id uuid, name text, rank_no bigint)
language sql set search_path='' as $$
  with roster as materialized (
    select public.load_active_month_roster(p_queue,
      case when p_queue='both' then '250' else '50-100' end,
      case when p_queue='both' then array['250','500'] else array['50','100'] end) as data
  ), priorities as materialized (
    select p.* from roster r
    cross join lateral jsonb_to_recordset(r.data->'people') p("memberId" uuid,tier int,core int,score numeric,excluded bool)
  ), people as (
    select distinct on (d.member_id) d.member_id,
      coalesce(nullif(d.discord_global_name,''),nullif(d.display_name,''),nullif(d.discord_username,''),
        nullif(d.username,''),d.public_code) as name,
      coalesce(p.tier,0) as tier,
      nullif(coalesce(p.core,case when p_queue='nitro' then d.vip_nitro else d.vip_regular end),0) as core,
      coalesce(p.score,0) as score
    from roster r
    cross join lateral jsonb_to_recordset(r.data->'directory') d(member_id uuid, provider_uid text,
      discord_guild_nick text, discord_global_name text, guild_nick text, display_name text,
      discord_username text, username text, public_code text, vip_nitro int, vip_regular int)
    left join priorities p on p."memberId"=d.member_id
    where not coalesce(p.excluded,false)
    order by d.member_id,d.provider_uid
  )
  select member_id,name,row_number() over(order by tier,case when core>0 then core end nulls last,
    score desc,name collate schedule_private.fill_nickname,member_id)
  from people;
$$;
revoke all on function schedule_private.fill_order(text) from public,anon,authenticated;

create function schedule_private.require_fill_access(p_month date,p_queue text)
returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid := public.current_member_id();
begin
  if auth.uid() is null or not public.current_has_permission('schedule') or not exists (
    select 1 from public.members m where m.id=actor and m.access_status='active'
  ) then raise insufficient_privilege using message='fill-queue-forbidden'; end if;
  if p_month is null or extract(day from p_month)<>1 or extract(year from p_month) not between 2000 and 2200
    or p_queue is null or p_queue not in ('nitro','regular','both') then
    raise invalid_parameter_value using message='fill-queue-invalid';
  end if;
  return actor;
end $$;
revoke all on function schedule_private.require_fill_access(date,text) from public,anon,authenticated;

create function public.load_fill_queue(p_month date,p_queue text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ranked uuid[]; done uuid[]; skipped uuid[]; current_player uuid;
begin
  perform schedule_private.require_fill_access(p_month,p_queue);
  select coalesce(array_agg(o.member_id order by o.rank_no),'{}'),
    coalesce(array_agg(o.member_id order by o.rank_no) filter(where c.id is not null),'{}'),
    coalesce(array_agg(o.member_id order by o.rank_no) filter(where c.skipped),'{}'),
    (array_agg(o.member_id order by o.rank_no) filter(where c.id is null))[1]
  into ranked,done,skipped,current_player
  from schedule_private.fill_order(p_queue) o
  left join schedule_private.fill_completions c on c.month=p_month and c.queue=p_queue and c.member_id=o.member_id;
  return jsonb_build_object('order',ranked,'done',done,'skipped',skipped,'current',
    case when p_month>=date_trunc('month',now() at time zone 'Europe/Madrid')::date then current_player end);
end $$;
revoke all on function public.load_fill_queue(date,text) from public,anon,authenticated;
grant execute on function public.load_fill_queue(date,text) to authenticated;

create function schedule_private.fill_offer(p_month date,p_queue text,p_member uuid)
returns jsonb language plpgsql set search_path='' as $$
declare actor uuid; players jsonb; member_name text; next_id uuid; bot public.bot_settings%rowtype; channel text;
begin
  actor := schedule_private.require_fill_access(p_month,p_queue);
  if p_month<date_trunc('month',now() at time zone 'Europe/Madrid')::date then
    raise invalid_parameter_value using message='fill-queue-stale';
  end if;
  select jsonb_agg(jsonb_build_object('id',o.member_id,'name',o.name) order by o.rank_no),
    max(o.name) filter(where o.member_id=p_member)
  into players,member_name
  from schedule_private.fill_order(p_queue) o
  where not exists (select 1 from schedule_private.fill_completions c
    where c.month=p_month and c.queue=p_queue and c.member_id=o.member_id);
  if p_member is null or (players->0->>'id')::uuid is distinct from p_member then
    if actor=p_member and member_name is not null then
      return jsonb_build_object('mode','skip','member',p_member,'name',member_name,'next',null,'nextName',null,'channel',null,'dm',false);
    end if;
    raise invalid_parameter_value using message='fill-queue-stale';
  end if;
  next_id := (players->1->>'id')::uuid;
  select * into bot from public.bot_settings where id='discord';
  channel := case when next_id is not null and bot.notify_fill_queue then nullif(bot.fill_channels->>p_queue,'') end;
  return jsonb_build_object('mode','complete','member',p_member,'name',players->0->>'name','next',next_id,'nextName',players->1->>'name',
    'channel',channel,'dm',coalesce(bot.notify_fill_queue,false) and next_id is not null);
end $$;
revoke all on function schedule_private.fill_offer(date,text,uuid) from public,anon,authenticated;

create function public.preview_fill_completion(p_month date,p_queue text,p_member uuid)
returns jsonb language sql security definer set search_path='' as $$
  select schedule_private.fill_offer(p_month,p_queue,p_member);
$$;
revoke all on function public.preview_fill_completion(date,text,uuid) from public,anon,authenticated;
grant execute on function public.preview_fill_completion(date,text,uuid) to authenticated;

create function public.confirm_fill_completion(p_month date,p_queue text,p_member uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; offer jsonb; event_id uuid; recipient uuid; discord_user text;
begin
  actor := schedule_private.require_fill_access(p_month,p_queue);
  perform pg_advisory_xact_lock(hashtext('fill-queue:'||p_queue),(p_month-date '2000-01-01'));
  select c.id into event_id from schedule_private.fill_completions c
  where c.month=p_month and c.queue=p_queue and c.member_id=p_member and c.actor_id=actor;
  if event_id is not null then return jsonb_build_object('id',event_id); end if;
  offer := schedule_private.fill_offer(p_month,p_queue,p_member);
  if offer is distinct from p_expected then return jsonb_build_object('offer',offer); end if;
  insert into schedule_private.fill_completions(month,queue,member_id,actor_id,skipped)
    values(p_month,p_queue,p_member,actor,offer->>'mode'='skip') returning id into event_id;
  recipient := (offer->>'next')::uuid;
  if (offer->>'dm')::boolean then
    select i.provider_uid into discord_user from public.identities i
    where i.member_id=recipient and i.provider='discord' and i.provider_uid ~ '^[0-9]{17,20}$'
    order by i.updated_at desc,i.id limit 1;
    insert into schedule_private.fill_deliveries(completion_id,destination,channel_id,discord_id,next_member,completed_name,delegated,status,error_code)
    select event_id,destination,offer->>'channel',discord_user,recipient,offer->>'name',actor<>p_member,
      case when discord_user is null then 'skipped' else 'pending' end,
      case when discord_user is null then 'no-discord-id' end
    from unnest(case when offer->>'channel' is null then array['dm'] else array['channel','dm'] end) destination;
  end if;
  perform realtime.send(jsonb_build_object('month',p_month,'queue',p_queue),'fill-queue','app:changes',true);
  return jsonb_build_object('id',event_id);
end $$;
revoke all on function public.confirm_fill_completion(date,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_fill_completion(date,text,uuid,jsonb) to authenticated;

create function schedule_private.guard_fill_occupancy()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; target uuid; slot_month date; queue_id text;
  lock_on boolean; ranked uuid[]; done uuid[]; current_player uuid; checked_kind uuid;
begin
  -- Service maintenance and cascades have their own trusted entry points.
  if auth.uid() is null or pg_trigger_depth()>1 then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select lock_fill_queue into lock_on from public.schedule_settings where id;
  if not coalesce(lock_on,false) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  actor := public.current_member_id();
  -- UPDATE may move a cell; both its old and new targets must be authorized.
  for checked_kind,slot_month,target in
    select kind_id,date_trunc('month',slot_date)::date,member_id
    from jsonb_to_recordset(case tg_op when 'INSERT' then jsonb_build_array(to_jsonb(new))
      when 'DELETE' then jsonb_build_array(to_jsonb(old))
      else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x(kind_id uuid,slot_date date,member_id uuid)
    order by 1,2,3
  loop
    select case when k.limit_id in ('50','100') then k.variant_id when k.limit_id in ('250','500') then 'both' end
    into queue_id from public.schedule_kinds k join public.rooms r on r.id=k.room_id and r.slug='winamax'
    where k.id=checked_kind;
    if queue_id not in ('nitro','regular','both') or queue_id is null then continue; end if;
    if not public.current_has_permission('schedule') then
      raise insufficient_privilege using message='schedule-fill-queue-locked';
    end if;
    perform pg_advisory_xact_lock_shared(hashtext('fill-queue:'||queue_id),(slot_month-date '2000-01-01'));
    select array_agg(o.member_id),array_agg(o.member_id) filter(where c.id is not null and not c.skipped),
      (array_agg(o.member_id order by o.rank_no) filter(where c.id is null))[1]
    into ranked,done,current_player from schedule_private.fill_order(queue_id) o
    left join schedule_private.fill_completions c on c.month=slot_month and c.queue=queue_id and c.member_id=o.member_id;
    if current_player is not null and (
      (actor=any(ranked) and actor is distinct from current_player and not coalesce(actor=any(done),false))
      or (tg_op<>'DELETE' and target=any(ranked) and target is distinct from current_player and not coalesce(target=any(done),false))
    ) then
      raise insufficient_privilege using message='schedule-fill-queue-locked';
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function schedule_private.guard_fill_occupancy() from public,anon,authenticated;
create trigger occupancy_fill_queue before insert or update or delete on public.occupancy
  for each row execute function schedule_private.guard_fill_occupancy();

create table schedule_private.fill_worker (
  id boolean primary key default true check(id),
  endpoint text,
  token text not null default gen_random_uuid()::text
);
insert into schedule_private.fill_worker default values;
alter table schedule_private.fill_worker enable row level security;
revoke all on schedule_private.fill_worker from public,anon,authenticated;

create function public.fill_queue_worker_authorized(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from schedule_private.fill_worker where id and token=p_token);
$$;
revoke all on function public.fill_queue_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.fill_queue_worker_authorized(text) to service_role;

create function public.claim_fill_deliveries(p_id uuid,p_auth_user uuid)
returns table(completion_id uuid,destination text,channel_id text,discord_id text,completed_name text,
  delegated boolean,month date,queue text,attempt int)
language sql security definer set search_path='' as $$
  with candidates as (
    select d.completion_id,d.destination,exists (
      select 1 from schedule_private.fill_completions recipient
      where recipient.month=c.month and recipient.queue=c.queue and recipient.member_id=d.next_member
    ) recipient_finished
    from schedule_private.fill_deliveries d join schedule_private.fill_completions c on c.id=d.completion_id
    where d.status in ('pending','sending') and d.next_at<=now()
      and (p_id is null or c.id=p_id)
      and (p_auth_user is null or exists(select 1 from public.members m where m.id=c.actor_id
        and m.auth_user_id=p_auth_user and m.access_status='active'))
    order by d.next_at,d.completion_id,d.destination limit 12 for update of d skip locked
  ), claimed as (
    update schedule_private.fill_deliveries d set
      status=case when not b.enabled or q.recipient_finished then 'skipped'
        when d.attempts>=3 or (d.status='sending' and now()>d.next_at+interval '45 seconds') then 'failed' else 'sending' end,
      error_code=case when not b.enabled then 'notifications-off' when q.recipient_finished then 'recipient-finished'
        when d.attempts>=3 or (d.status='sending' and now()>d.next_at+interval '45 seconds') then 'delivery-uncertain' end,
      attempts=d.attempts+1, next_at=now()+interval '90 seconds'
    from candidates q, (select coalesce((select notify_fill_queue from public.bot_settings where id='discord'),false) enabled) b
    where d.completion_id=q.completion_id and d.destination=q.destination
    returning d.*
  )
  select d.completion_id,d.destination,d.channel_id,d.discord_id,d.completed_name,d.delegated,c.month,c.queue,d.attempts
  from claimed d join schedule_private.fill_completions c on c.id=d.completion_id where d.status='sending';
$$;
revoke all on function public.claim_fill_deliveries(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_fill_deliveries(uuid,uuid) to service_role;

create function public.finish_fill_delivery(p_id uuid,p_destination text,p_attempt int,p_status text,p_error text,p_retry_seconds int)
returns void language sql security definer set search_path='' as $$
  update schedule_private.fill_deliveries d set
    status=case when p_status='pending' and d.attempts>=3 then 'failed' else p_status end,
    error_code=p_error,next_at=now()+make_interval(secs=>greatest(1,least(p_retry_seconds,3600)))
  where d.completion_id=p_id and d.destination=p_destination and d.status='sending' and d.attempts=p_attempt
    and p_status in ('pending','sent','failed');
$$;
revoke all on function public.finish_fill_delivery(uuid,text,int,text,text,int) from public,anon,authenticated;
grant execute on function public.finish_fill_delivery(uuid,text,int,text,text,int) to service_role;

-- Deployment configures the endpoint in the private row. The local job remains inert.
select cron.schedule('schedule-fill-delivery','* * * * *',$job$
  select net.http_post(url:=endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','x-fill-worker-token',token),
    body:='{}'::jsonb) from schedule_private.fill_worker where id and endpoint is not null
    and exists(select 1 from schedule_private.fill_deliveries
      where status in ('pending','sending') and next_at<=now())
$job$);

create or replace function public.load_schedule_configuration()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_schedule boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.members where id=public.current_member_id() and access_status='active') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  can_schedule:=public.current_has_permission('schedule') or public.current_has_permission('schedule.manage');
  return jsonb_build_object('settings',(select jsonb_build_object(
    'allow_overwrite_marks',s.allow_overwrite_marks,'allow_act_as',s.allow_act_as,'count_tables',s.count_tables,
    'lock_fill_queue',s.lock_fill_queue,'edit_by_button',s.edit_by_button,'merge_adjacent_slots',s.merge_adjacent_slots,
    'filter_limits_nitro',s.filter_limits_nitro,'filter_limits_regular',s.filter_limits_regular,
    'limit_palette',s.limit_palette,'slot_tint',s.slot_tint,'locked_slot_appearance',s.locked_slot_appearance,
    'hour_load',s.hour_load,'sync_fallback_enabled',s.sync_fallback_enabled,'sync_fallback_minutes',s.sync_fallback_minutes)
    from public.schedule_settings s where s.id),
    'kinds',case when can_schedule then coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'variant_id',k.variant_id,'limit_id',k.limit_id) order by k.id)
      from public.schedule_kinds k join public.rooms r on r.id=k.room_id where r.slug='winamax'),'[]'::jsonb) else '[]'::jsonb end,
    'deadTimeIntervals',case when can_schedule then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'variant_id',d.variant_id,'limit_id',d.limit_id,'start_half',d.start_half,'end_half',d.end_half) order by d.id)
      from public.schedule_dead_intervals d),'[]'::jsonb) else '[]'::jsonb end,
    'capacityFlags',case when can_schedule then coalesce((select jsonb_agg(to_jsonb(f) order by f.kind_id) from public.capacity_flags f),'[]'::jsonb) else '[]'::jsonb end,
    'capacityRules',case when can_schedule then coalesce((select jsonb_agg(to_jsonb(r)-'id' order by r.kind_id,r.layer,r.day_of_month,r.weekday) from public.capacity_rules r),'[]'::jsonb) else '[]'::jsonb end,
    'revision',(select revision::text from schedule_private.sync_versions where key='config'));
end;
$$;

create or replace function public.root_logs(
  p_source text default 'schedule', p_person text default '', p_role text default 'actor',
  p_from date default null, p_to date default null, p_action text default '',
  p_limit integer default 50, p_before_at timestamptz default null, p_before_id text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_rows jsonb; v_uuid uuid; v_bigint bigint;
begin
  if auth.uid() is null or not public.is_root() then raise insufficient_privilege using message='root-required'; end if;
  if p_source is null or p_source not in ('schedule','distance')
    or p_role is null or p_role not in ('actor','member')
    or p_limit is null or p_limit not between 1 and 200
    or p_person is null or length(p_person)>120
    or p_action is null or p_action not in ('','place','remove','distance_ids','fill_complete','fill_skip')
    or (p_from is not null and p_to is not null and p_from>p_to)
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise invalid_parameter_value using message='invalid-log-filter';
  end if;
  if p_source='schedule' then v_uuid:=p_before_id::uuid; else v_bigint:=p_before_id::bigint; end if;
  with people as materialized (
    select m.id, jsonb_build_object('id',m.id,'code',m.public_code,
      'name',coalesce(nullif(p.display_name,''),nullif(d.global_name,''),nullif(i.display_name,''),d.username,i.username,m.public_code),
      'discord',coalesce(nullif(d.global_name,''),nullif(i.display_name,''),d.username,i.username),
      'discord_id',i.provider_uid) as person,
      lower(concat_ws(' ',m.id::text,m.public_code,p.display_name,d.guild_nick,d.global_name,d.username,
        i.guild_nick,i.display_name,i.username,i.provider_uid)) as search
    from public.members m left join public.profiles p on p.member_id=m.id
    left join lateral (select * from public.identities i where i.member_id=m.id and i.provider='discord'
      order by i.updated_at desc,i.id limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
  ), matched as (
    select id from people where strpos(search,lower(btrim(p_person)))>0
  ), events as (
    (select e.id::text as id,e.id::text as sort_key,e.at,e.action,e.actor_id,e.member_id,
      jsonb_build_object('date',e.slot_date,'half',e.half,'level',e.level,'tables',e.tables,
        'room',r.title,'limit',k.limit_id,'variant',k.variant_id) as detail
    from public.occupancy_events e left join public.schedule_kinds k on k.id=e.kind_id left join public.rooms r on r.id=k.room_id
    where p_source='schedule' and (p_action='' or e.action=p_action)
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Minsk'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Minsk'))
      and (p_before_at is null or (e.at,e.id)<(p_before_at,v_uuid))
      and (btrim(p_person)='' or (case when p_role='actor' then e.actor_id else e.member_id end) in (select id from matched)
        or (case when p_role='actor' then e.actor_id else e.member_id end)::text=btrim(p_person))
    order by e.at desc,e.id desc limit p_limit+1)
    union all
    (select e.id::text,e.id::text,e.at,case when e.skipped then 'fill_skip' else 'fill_complete' end,e.actor_id,e.member_id,
      jsonb_build_object('date',e.month,'queue',e.queue,
        'delivery',(select jsonb_object_agg(d.destination,d.status) from schedule_private.fill_deliveries d where d.completion_id=e.id))
    from schedule_private.fill_completions e
    where p_source='schedule' and (p_action='' or p_action=case when e.skipped then 'fill_skip' else 'fill_complete' end)
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Minsk'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Minsk'))
      and (p_before_at is null or (e.at,e.id)<(p_before_at,v_uuid))
      and (btrim(p_person)='' or (case when p_role='actor' then e.actor_id else e.member_id end) in (select id from matched)
        or (case when p_role='actor' then e.actor_id else e.member_id end)::text=btrim(p_person))
    order by e.at desc,e.id desc limit p_limit+1)
    union all
    (select e.id::text,lpad(e.id::text,20,'0'),e.at,'distance_ids',e.actor_id,e.member_id,
      jsonb_build_object('old_ids',e.old_ids,'new_ids',e.new_ids)
    from public.member_distance_id_audit e
    where p_source='distance' and p_action in ('','distance_ids')
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Minsk'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Minsk'))
      and (p_before_at is null or (e.at,e.id)<(p_before_at,v_bigint))
      and (btrim(p_person)='' or (case when p_role='actor' then e.actor_id else e.member_id end) in (select id from matched)
        or (case when p_role='actor' then e.actor_id else e.member_id end)::text=btrim(p_person))
    order by e.at desc,e.id desc limit p_limit+1)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'at',e.at,'action',e.action,'detail',e.detail,
    'actor',coalesce(a.person,jsonb_build_object('id',e.actor_id)),
    'member',coalesce(m.person,jsonb_build_object('id',e.member_id))) order by e.at desc,e.sort_key desc),'[]')
  into v_rows from events e left join people a on a.id=e.actor_id left join people m on m.id=e.member_id;
  return jsonb_build_object('rows',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(v_rows)
    with ordinality where ordinality<=p_limit),'has_more',jsonb_array_length(v_rows)>p_limit);
end $$;
