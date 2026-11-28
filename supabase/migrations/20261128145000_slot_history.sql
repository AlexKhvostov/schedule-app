-- Bounded, on-demand history for one physical half-hour and seat. No broad journal grants.
create index occupancy_events_slot_history on public.occupancy_events
  (kind_id,slot_date,half,level,at desc,id desc);

create function public.slot_history(p_date date,p_half integer,p_level integer,p_variant text,p_limit text,
  p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_kind uuid; v_rows jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.members where id=public.current_member_id() and access_status='active')
    or not (public.current_has_permission('schedule') or public.current_has_permission('schedule.manage')) then
    raise insufficient_privilege using message='schedule-required';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date >= date '2201-01-01'
    or p_half is null or p_half not between 0 and 47 or p_level is null or p_level not between 0 and 5
    or p_variant is null or p_variant not in ('nitro','regular') or p_limit is null
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise invalid_parameter_value using message='invalid-slot-history-target';
  end if;
  select k.id into v_kind from public.schedule_kinds k join public.rooms r on r.id=k.room_id
    where r.slug='winamax' and k.variant_id=p_variant and k.limit_id=p_limit;
  if v_kind is null then raise invalid_parameter_value using message='invalid-slot-history-kind'; end if;
  with events as materialized (
    select e.id,e.at,e.action,e.actor_id,e.member_id,e.tables from public.occupancy_events e
    where e.kind_id=v_kind and e.slot_date=p_date and e.half=p_half and e.level=p_level
      and e.at >= now()-interval '2 months'
      and (p_before_at is null or (e.at,e.id)<(p_before_at,p_before_id))
    order by e.at desc,e.id desc limit 51
  ), ids as (select actor_id as id from events union select member_id from events), people as (
    select m.id,m.mark_tag,m.mark_bg,m.mark_fg,
      coalesce(nullif(d.global_name,''),nullif(i.display_name,''),nullif(d.username,''),nullif(i.username,''),m.public_code) as name
    from ids join public.members m on m.id=ids.id
    left join lateral (select ident.* from public.identities ident where ident.member_id=m.id and ident.provider='discord'
      order by ident.updated_at desc,ident.id desc limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
  ) select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'at',e.at,'action',e.action,'tables',e.tables,
    'actor',jsonb_build_object('id',e.actor_id,'name',a.name),
    'member',jsonb_build_object('id',e.member_id,'name',m.name,'tag',m.mark_tag,'bg',m.mark_bg,'fg',m.mark_fg))
    order by e.at desc,e.id desc),'[]'::jsonb) into v_rows
  from events e left join people a on a.id=e.actor_id left join people m on m.id=e.member_id;
  return jsonb_build_object('rows',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
    from jsonb_array_elements(v_rows) with ordinality where ordinality<=50),'has_more',jsonb_array_length(v_rows)>50);
end $$;
revoke all on function public.slot_history(date,integer,integer,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.slot_history(date,integer,integer,text,text,timestamptz,uuid) to authenticated;
