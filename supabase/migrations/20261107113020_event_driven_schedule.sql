-- Additive v2 contract. Legacy clients/RPCs keep working during Preview rollout.
alter table public.schedule_settings
  add column sync_fallback_enabled boolean not null default false,
  add column sync_fallback_minutes integer not null default 5
    check (sync_fallback_minutes between 1 and 60);
revoke update (sync_fallback_enabled, sync_fallback_minutes) on public.schedule_settings from anon, authenticated;

create function public.save_schedule_sync(p_enabled boolean, p_minutes integer,
  p_expected_enabled boolean, p_expected_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
declare actual public.schedule_settings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.members where id=public.current_member_id() and access_status='active')
    or not public.current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode='42501';
  end if;
  if p_enabled is null or p_expected_enabled is null or p_minutes is null or p_expected_minutes is null
     or p_minutes not between 1 and 60 or p_expected_minutes not between 1 and 60 then
    raise exception 'invalid-sync-settings' using errcode='22023';
  end if;
  select * into strict actual from public.schedule_settings where id for update;
  if actual.sync_fallback_enabled <> p_expected_enabled or actual.sync_fallback_minutes <> p_expected_minutes then
    raise exception 'sync-settings-conflict' using errcode='40001';
  end if;
  update public.schedule_settings set sync_fallback_enabled=p_enabled, sync_fallback_minutes=p_minutes
    where id and (sync_fallback_enabled is distinct from p_enabled or sync_fallback_minutes is distinct from p_minutes);
end;
$$;
revoke all on function public.save_schedule_sync(boolean,integer,boolean,integer) from public,anon;
grant execute on function public.save_schedule_sync(boolean,integer,boolean,integer) to authenticated;

-- Transactional counters, not sequence high-water marks. Last-cell deletion keeps its key.
create table schedule_private.sync_versions (
  key text primary key,
  revision bigint not null default 1 check(revision > 0),
  changed_in bigint not null default txid_current()
);
alter table schedule_private.sync_versions enable row level security;
revoke all on schedule_private.sync_versions from public,anon,authenticated;
insert into schedule_private.sync_versions(key) values('config'),('directory'),('priorities'),('access');

create function schedule_private.bump_version(p_key text, p_event text, p_payload jsonb default '{}')
returns boolean language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
  insert into schedule_private.sync_versions as v(key,revision,changed_in)
    values(p_key,1,txid_current()) on conflict(key) do update
      set revision=v.revision+1, changed_in=excluded.changed_in
      where v.changed_in<>excluded.changed_in returning revision into next_revision;
  if next_revision is null then return false; end if;
  perform realtime.send(p_payload,p_event,'app:changes',true);
  return true;
end;
$$;
revoke all on function schedule_private.bump_version(text,text,jsonb) from public,anon,authenticated;

-- Existing occupancy trigger now coalesces events within a transaction and retains legacy events.
create or replace function schedule_private.notify_slots() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed record;
begin
  if TG_OP='UPDATE' and to_jsonb(old)=to_jsonb(new) then return null; end if;
  for changed in
    select distinct x.slot_date,x.kind_id from jsonb_to_recordset(
      case when TG_OP='INSERT' then jsonb_build_array(to_jsonb(new))
           when TG_OP='DELETE' then jsonb_build_array(to_jsonb(old))
           else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end
    ) x(slot_date date,kind_id uuid) order by x.slot_date,x.kind_id
  loop
    if schedule_private.bump_version('slots:'||changed.slot_date::text||':'||changed.kind_id::text,
       'slots',jsonb_build_object('date',changed.slot_date,'kind_id',changed.kind_id)) then
      perform realtime.send(jsonb_build_object('date',changed.slot_date,'kind_id',changed.kind_id),'slots','schedule:changes',true);
    end if;
  end loop;
  return null;
end;
$$;

-- All private event payloads describe only invalidation domains, never profile/role/request data.
create function schedule_private.notify_domains() returns trigger
language plpgsql security definer set search_path='' as $$
declare domain text; access_fields text[];
begin
  if TG_OP='UPDATE' and
    (to_jsonb(old)-array['updated_at','updated_by','last_seen_at','last_login_at','synced_at','last_sync_id']) =
    (to_jsonb(new)-array['updated_at','updated_by','last_seen_at','last_login_at','synced_at','last_sync_id']) then
    return null;
  end if;
  -- Cosmetic profile edits do not invalidate every viewer's authorization.
  -- INSERT/DELETE remains conservative; UPDATE checks only access-bearing fields.
  if TG_OP='UPDATE' then
    access_fields:=case TG_TABLE_NAME
      when 'members' then array['auth_user_id','access_status']
      when 'identities' then array['member_id','provider','provider_uid','guild_present','discord_roles']
      when 'discord_members' then array['discord_id','present','roles']
      when 'discord_guild_roles' then array['role_id','present']
      when 'club_settings' then array['required_discord_role_id','self_create_card']
      else null end;
  end if;
  for domain in select distinct x from unnest(TG_ARGV) x order by x loop
    if domain='access' and access_fields is not null and not exists(
      select 1 from unnest(access_fields) field
      where case when field in ('roles','discord_roles') then
        (select array_agg(distinct r->>'id' order by r->>'id') from jsonb_array_elements(coalesce(to_jsonb(old)->field,'[]'::jsonb)) r)
        is distinct from
        (select array_agg(distinct r->>'id' order by r->>'id') from jsonb_array_elements(coalesce(to_jsonb(new)->field,'[]'::jsonb)) r)
      else to_jsonb(old)->field is distinct from to_jsonb(new)->field end
    ) then continue; end if;
    if schedule_private.bump_version(domain,domain) and domain='directory' then
      perform realtime.send('{}','directory','schedule:changes',true);
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function schedule_private.notify_domains() from public,anon,authenticated;

-- Replace redundant statement notifications with semantic row notifications.
drop trigger schedule_member_face on public.members;
drop trigger schedule_identity_face on public.identities;
drop trigger schedule_discord_face on public.discord_members;
drop trigger schedule_room_face on public.player_nicks;
do $$ declare t text; begin
  foreach t in array array['schedule_settings','capacity_flags','capacity_rules','schedule_dead_intervals','schedule_kinds'] loop
    execute format('create trigger app_config_changed after insert or update or delete on public.%I for each row execute function schedule_private.notify_domains(''config'')',t);
  end loop;
  foreach t in array array['members','identities','discord_members','players','player_limits'] loop
    execute format('create trigger app_directory_changed after insert or update or delete on public.%I for each row execute function schedule_private.notify_domains(''access'',''directory'',''priorities'')',t);
  end loop;
  foreach t in array array['profiles','player_nicks'] loop
    execute format('create trigger app_directory_changed after insert or update or delete on public.%I for each row execute function schedule_private.notify_domains(''directory'',''priorities'')',t);
  end loop;
  create trigger app_directory_changed after insert or update or delete on public.member_table_presets
    for each row execute function schedule_private.notify_domains('directory');
  foreach t in array array['member_roles','member_schedule_access','discord_guild_roles','discord_role_permissions','discord_role_schedule_limits','club_settings'] loop
    execute format('create trigger app_access_changed after insert or update or delete on public.%I for each row execute function schedule_private.notify_domains(''access'',''directory'',''priorities'')',t);
  end loop;
  foreach t in array array['priority_member_settings','priority_requests','priority_settings','distance_entries','distance_values','member_distance_ids','distance_id_nicks'] loop
    execute format('create trigger app_priorities_changed after insert or update or delete on public.%I for each row execute function schedule_private.notify_domains(''priorities'')',t);
  end loop;
end $$;

create function public.load_schedule_versions(p_year integer,p_month integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date; next_month date;
begin
  if auth.uid() is null or not exists(select 1 from public.members where id=public.current_member_id() and access_status='active')
    or not (public.current_has_permission('schedule') or public.current_has_permission('schedule.manage')) then
    raise exception 'not allowed' using errcode='42501';
  end if;
  if p_year is null or p_year not between 2000 and 2200 or p_month is null or p_month not between 1 and 12 then
    raise exception 'invalid schedule period' using errcode='22023';
  end if;
  first_day:=make_date(p_year,p_month,1); next_month:=(first_day+interval '1 month')::date;
  return jsonb_build_object('version',1,
    'targets',coalesce((select jsonb_agg(jsonb_build_object('date',split_part(key,':',2),
      'kind_id',split_part(key,':',3),'revision',revision::text) order by key)
      from schedule_private.sync_versions where key >= 'slots:'||first_day::text||':' and key < 'slots:'||next_month::text||':'),'[]'::jsonb),
    'config',(select revision::text from schedule_private.sync_versions where key='config'),
    'directory',(select revision::text from schedule_private.sync_versions where key='directory'),
    'priorities',(select revision::text from schedule_private.sync_versions where key='priorities'),
    'access',(select revision::text from schedule_private.sync_versions where key='access'));
end;
$$;
revoke all on function public.load_schedule_versions(integer,integer) from public,anon;
grant execute on function public.load_schedule_versions(integer,integer) to authenticated;

-- STABLE functions share the calling statement's MVCC snapshot, including nested reads.
create function public.load_schedule_snapshot_v2(p_year integer,p_month integer,
  p_targets jsonb default null,p_directory_only boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.load_schedule_snapshot(p_year,p_month,p_targets,p_directory_only)
    || jsonb_build_object('revisions',public.load_schedule_versions(p_year,p_month));
$$;
revoke all on function public.load_schedule_snapshot_v2(integer,integer,jsonb,boolean) from public,anon;
grant execute on function public.load_schedule_snapshot_v2(integer,integer,jsonb,boolean) to authenticated;

-- One authorized initial config read, no polling or repeated per-component queries.
create function public.load_schedule_configuration()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_schedule boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.members where id=public.current_member_id() and access_status='active') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  can_schedule:=public.current_has_permission('schedule') or public.current_has_permission('schedule.manage');
  return jsonb_build_object('settings',(select jsonb_build_object(
    'allow_overwrite_marks',s.allow_overwrite_marks,'allow_act_as',s.allow_act_as,'count_tables',s.count_tables,
    'edit_by_button',s.edit_by_button,'merge_adjacent_slots',s.merge_adjacent_slots,
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
revoke all on function public.load_schedule_configuration() from public,anon;
grant execute on function public.load_schedule_configuration() to authenticated;

create policy app_changes_receive on realtime.messages for select to authenticated using (
  topic='app:changes' and (select realtime.topic())='app:changes' and extension in ('broadcast','presence')
  and exists(select 1 from public.members where id=public.current_member_id() and access_status='active')
);
create policy app_presence_publish on realtime.messages for insert to authenticated with check (
  topic='app:changes' and (select realtime.topic())='app:changes' and extension='presence'
  and exists(select 1 from public.members where id=public.current_member_id() and access_status='active')
);

-- Routine Discord timestamps must not invalidate the priority cache.
create or replace function public.invalidate_priority_directory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='UPDATE' and
    (to_jsonb(old)-array['updated_at','last_seen_at','last_login_at','synced_at','last_sync_id'])=
    (to_jsonb(new)-array['updated_at','last_seen_at','last_login_at','synced_at','last_sync_id']) then return null; end if;
  update public.priority_rating_cache set dirty=true where not dirty;
  return null;
end;
$$;

-- A successful operation can be safely resolved after a lost HTTP response.
-- Receipts are private, contain no schedule copy, and never bypass current access checks.
create table schedule_private.edit_receipts (
  actor_id uuid not null references public.members(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  affected integer,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
alter table schedule_private.edit_receipts enable row level security;
revoke all on schedule_private.edit_receipts from public,anon,authenticated;

create function public.apply_schedule_edit_v2(p_operation_id uuid,p_kind_id uuid,p_member_id uuid,
  p_place jsonb default '[]',p_remove jsonb default '[]',p_foreign jsonb default '[]',p_expected jsonb default '[]')
returns integer language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=public.current_member_id();
  digest text; receipt schedule_private.edit_receipts%rowtype;
  wanted record; occupant public.occupancy%rowtype; result_count integer;
begin
  if auth.uid() is null or actor is null or not exists(select 1 from public.members where id=actor and access_status='active')
    or not (public.current_has_permission('schedule') or public.current_has_permission('schedule.manage')) then
    raise exception 'not allowed' using errcode='42501';
  end if;
  if p_operation_id is null or p_kind_id is null
    or jsonb_typeof(p_place) is distinct from 'array' or jsonb_typeof(p_remove) is distinct from 'array'
    or jsonb_typeof(p_foreign) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' then
    raise exception 'invalid-range' using errcode='22023';
  end if;
  if jsonb_array_length(p_place)>48 or jsonb_array_length(p_remove)>48 or jsonb_array_length(p_foreign)>48
    or jsonb_array_length(p_expected) not between 1 and 48 then
    raise exception 'invalid-range' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_expected) x(date date,half integer,level integer,member_id uuid,tables integer)
    where x.date is null or x.half is null or x.half not between 0 and 47 or x.level is null or x.level not between 0 and 5
      or (x.member_id is null)<>(x.tables is null) or (x.tables is not null and x.tables not between 1 and 30))
    or exists(select 1 from jsonb_to_recordset(p_expected) x(date date,half integer,level integer)
      group by x.date,x.half,x.level having count(*)>1) then
    raise exception 'invalid-range' using errcode='22023';
  end if;
  if exists(
    (select x.date,x.half,x.level from jsonb_to_recordset(p_place||p_remove||p_foreign) x(date date,half integer,level integer)
       except select x.date,x.half,x.level from jsonb_to_recordset(p_expected) x(date date,half integer,level integer))
    union all
    (select x.date,x.half,x.level from jsonb_to_recordset(p_expected) x(date date,half integer,level integer)
       except select x.date,x.half,x.level from jsonb_to_recordset(p_place||p_remove||p_foreign) x(date date,half integer,level integer))
  ) then raise exception 'invalid-range' using errcode='22023'; end if;

  digest:=encode(extensions.digest(jsonb_build_array(p_kind_id,p_member_id,p_place,p_remove,p_foreign,p_expected)::text,'sha256'),'hex');
  insert into schedule_private.edit_receipts(actor_id,operation_id,request_hash) values(actor,p_operation_id,digest)
    on conflict do nothing;
  select * into strict receipt from schedule_private.edit_receipts where actor_id=actor and operation_id=p_operation_id for update;
  if receipt.request_hash<>digest then raise exception 'schedule-conflict' using errcode='40001'; end if;
  if receipt.affected is not null then return receipt.affected; end if;

  for wanted in select * from jsonb_to_recordset(p_expected)
    x(date date,half integer,level integer,member_id uuid,tables integer) order by date,half,level
  loop
    -- Serializes empty cells between v2 writers. Legacy inserts retain unique-index protection.
    perform pg_advisory_xact_lock(hashtextextended(p_kind_id::text||':'||wanted.date::text||':'||wanted.half::text||':'||wanted.level::text,0));
    select * into occupant from public.occupancy where kind_id=p_kind_id and slot_date=wanted.date
      and half=wanted.half and level=wanted.level for update;
    if occupant.member_id is distinct from wanted.member_id or occupant.tables is distinct from wanted.tables then
      raise exception 'schedule-conflict' using errcode='40001';
    end if;
  end loop;
  begin
    result_count:=public.apply_schedule_edit(p_kind_id,p_member_id,p_place,p_remove,p_foreign);
  exception when unique_violation then
    -- A legacy client can insert an initially empty cell without the v2 lock.
    -- Translate its winning unique-index race to the same stale-intent contract.
    raise exception 'schedule-conflict' using errcode='40001';
  end;
  update schedule_private.edit_receipts set affected=result_count where actor_id=actor and operation_id=p_operation_id;
  return result_count;
end;
$$;
revoke all on function public.apply_schedule_edit_v2(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.apply_schedule_edit_v2(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- The original replacement briefly marked every role absent before restoring it.
-- Mark only truly absent roles, preserving final semantics without invalidation storms.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.replace_discord_roster(jsonb,jsonb,jsonb)'::regprocedure);
  if position('where present;' in definition)=0 then
    raise exception 'unexpected Discord roster implementation';
  end if;
  definition:=replace(definition,'where present;',
    'where present and not exists (select 1 from jsonb_array_elements(p_roles) role where role->>''id''=discord_guild_roles.role_id and coalesce(role->>''name'','''')<>''@everyone'');');
  execute definition;
end $$;
