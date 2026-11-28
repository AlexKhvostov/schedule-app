-- Displayed log dates and filter boundaries follow schedule CET (Europe/Madrid, including summer time).
-- Event timestamps, ACLs and retention remain unchanged.
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
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Madrid'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Madrid'))
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
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Madrid'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Madrid'))
      and (p_before_at is null or (e.at,e.id)<(p_before_at,v_uuid))
      and (btrim(p_person)='' or (case when p_role='actor' then e.actor_id else e.member_id end) in (select id from matched)
        or (case when p_role='actor' then e.actor_id else e.member_id end)::text=btrim(p_person))
    order by e.at desc,e.id desc limit p_limit+1)
    union all
    (select e.id::text,lpad(e.id::text,20,'0'),e.at,'distance_ids',e.actor_id,e.member_id,
      jsonb_build_object('old_ids',e.old_ids,'new_ids',e.new_ids)
    from public.member_distance_id_audit e
    where p_source='distance' and p_action in ('','distance_ids')
      and (p_from is null or e.at >= (p_from::timestamp at time zone 'Europe/Madrid'))
      and (p_to is null or e.at < ((p_to+1)::timestamp at time zone 'Europe/Madrid'))
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
