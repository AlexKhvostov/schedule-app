-- Compact read model, not a persisted schedule cache. One statement supplies slots and faces.
create function public.load_schedule_snapshot(
  p_year integer, p_month integer, p_targets jsonb default null, p_directory_only boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  first_day date;
  last_day date;
  answer jsonb;
begin
  if auth.uid() is null or not (public.current_has_permission('schedule') or public.current_has_permission('schedule.manage')) then
    raise exception 'not allowed' using errcode='42501';
  end if;
  if p_year is null or p_year not between 2000 and 2200 or p_month is null or p_month not between 1 and 12 or p_directory_only is null then
    raise exception 'invalid schedule period' using errcode='22023';
  end if;
  first_day := make_date(p_year,p_month,1);
  last_day := (first_day + interval '1 month')::date;
  if p_targets is not null then
    if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) > 500 then
      raise exception 'invalid schedule targets' using errcode='22023';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(p_targets) as t(date date,kind_id uuid)
      where t.date is null or t.date < first_day or t.date >= last_day or not exists (
        select 1 from public.schedule_kinds k join public.rooms r on r.id=k.room_id
        where k.id=t.kind_id and r.slug='winamax' and k.variant_id in ('nitro','regular')
      )
    ) then raise exception 'invalid schedule targets' using errcode='22023'; end if;
  end if;
  with kinds as materialized (
    select k.id,k.variant_id,k.limit_id from public.schedule_kinds k join public.rooms r on r.id=k.room_id
    where r.slug='winamax' and k.variant_id in ('nitro','regular')
  ), seats as materialized (
    select o.kind_id,extract(day from o.slot_date)::integer as day,o.half,o.level,o.member_id,o.tables
    from public.occupancy o join kinds k on k.id=o.kind_id
    where o.slot_date >= first_day and o.slot_date < last_day
      and (p_targets is null or exists(select 1 from jsonb_to_recordset(p_targets) as t(date date,kind_id uuid)
        where t.date=o.slot_date and t.kind_id=o.kind_id))
    limit 100001
  ), owners as (select distinct member_id from seats), faces as (
    select m.id as member_id,m.mark_tag,m.mark_bg,m.mark_fg,m.tables as member_tables,
      coalesce(nullif(d.guild_nick,''),nullif(i.guild_nick,''),nullif(d.username,''),nullif(i.username,''),i.display_name,'') as discord,
      coalesce(room.nick,'') as room_nick,coalesce(nullif(d.avatar_url,''),i.avatar_url,'') as avatar_url,
      coalesce(nullif(d.username,''),i.username,'') as username,coalesce(nullif(d.global_name,''),i.display_name,'') as global_name,
      m.grid_priority,m.vip_nitro,m.vip_regular
    from owners own join public.members m on m.id=own.member_id
    left join lateral (select ident.* from public.identities ident where ident.member_id=m.id and ident.provider='discord'
      order by ident.updated_at desc,ident.id desc limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
    left join lateral (select n.nick from public.players p join public.rooms r on r.id=p.room_id and r.slug='winamax'
      join public.player_nicks n on n.player_id=p.id where p.member_id=m.id order by n.at desc,n.id desc limit 1) room on true
  ) select jsonb_build_object('version',1,'year',p_year,'month',p_month,
    'kinds',coalesce((select jsonb_agg(k order by k.variant_id,k.limit_id) from kinds k),'[]'::jsonb),
    'slots',case when p_directory_only then '[]'::jsonb else coalesce((select jsonb_agg(s order by s.kind_id,s.day,s.half,s.level) from seats s),'[]'::jsonb) end,
    'members',coalesce((select jsonb_agg(f order by f.member_id) from faces f),'[]'::jsonb),
    'slot_count',(select count(*) from seats)) into answer;
  if (answer->>'slot_count')::integer > 100000 or octet_length(answer::text)>16777216 then
    raise exception 'schedule response too large' using errcode='54000';
  end if;
  return answer;
end;
$$;
revoke all on function public.load_schedule_snapshot(integer,integer,jsonb,boolean) from public,anon;
grant execute on function public.load_schedule_snapshot(integer,integer,jsonb,boolean) to authenticated;

-- The old table-returning RPC remains compatible with already deployed clients.
create schema if not exists schedule_private;
revoke all on schema schedule_private from public,anon,authenticated;

create function schedule_private.notify_slots() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op <> 'INSERT' then
    perform realtime.send(jsonb_build_object('date',old.slot_date,'kind_id',old.kind_id),'slots','schedule:changes',true);
  end if;
  if tg_op <> 'DELETE' and (tg_op='INSERT' or new.kind_id is distinct from old.kind_id or new.slot_date is distinct from old.slot_date) then
    perform realtime.send(jsonb_build_object('date',new.slot_date,'kind_id',new.kind_id),'slots','schedule:changes',true);
  end if;
  return null;
end;
$$;
revoke all on function schedule_private.notify_slots() from public,anon,authenticated;
create trigger occupancy_compact_changed after insert or update or delete on public.occupancy
  for each row execute function schedule_private.notify_slots();

create function schedule_private.notify_directory() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send('{}'::jsonb,'directory','schedule:changes',true);
  return null;
end;
$$;
revoke all on function schedule_private.notify_directory() from public,anon,authenticated;
create trigger schedule_member_face after update of mark_tag,mark_bg,mark_fg,tables,grid_priority,vip_nitro,vip_regular on public.members
  for each statement execute function schedule_private.notify_directory();
create trigger schedule_identity_face after insert or delete or update of username,display_name,guild_nick,avatar_url on public.identities
  for each statement execute function schedule_private.notify_directory();
create trigger schedule_discord_face after insert or delete or update of username,global_name,guild_nick,avatar_url on public.discord_members
  for each statement execute function schedule_private.notify_directory();
create trigger schedule_room_face after insert or update or delete on public.player_nicks
  for each statement execute function schedule_private.notify_directory();

-- Receive only: clients cannot forge invalidations. Actual data still requires the RPC permission check.
create policy schedule_changes_receive on realtime.messages for select to authenticated using (
  topic='schedule:changes' and (select realtime.topic())='schedule:changes'
  and (public.current_has_permission('schedule') or public.current_has_permission('schedule.manage'))
);
