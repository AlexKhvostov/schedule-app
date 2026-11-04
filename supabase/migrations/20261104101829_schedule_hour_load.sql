-- One shared club map. Each key is a tournament kind + limit, each row is 24 CET hours.
create function public.valid_hour_load_row(p_row jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_row) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_row) <> 24 then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_row) v
    where v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string' or v #>> '{}' not in
      ('rose','peach','lemon','lime','mint','aqua','sky','iris','lilac','pink'))
  );
end;
$$;
create function public.valid_hour_load(p_map jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_map) is distinct from 'object' then return false; end if;
  return not exists (
    select 1 from jsonb_each(p_map) e where e.key !~ '^(nitro|regular):(0[.]25|0[.]50|1|2|5|10|25|50|100|250|500)$'
      or not public.valid_hour_load_row(e.value)
  );
end;
$$;
revoke all on function public.valid_hour_load_row(jsonb), public.valid_hour_load(jsonb) from public, anon;
grant execute on function public.valid_hour_load_row(jsonb), public.valid_hour_load(jsonb) to authenticated;

alter table public.schedule_settings add column hour_load jsonb not null default '{}'::jsonb
  constraint schedule_hour_load_valid check (public.valid_hour_load(hour_load));
comment on column public.schedule_settings.hour_load is
  'Club load colors by variant:limit, 24 CET hours; missing pair means clear. Local browser legacy data is imported explicitly.';

-- Protected column follows existing settings RPCs. Definer permits only this
-- write after auth + schedule.manage checks; clients have no direct column UPDATE.
create function public.save_schedule_hour_load(p_key text, p_row jsonb, p_expected jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  existing jsonb;
  empty_row jsonb := (select jsonb_agg(null::text) from generate_series(1,24));
begin
  if auth.uid() is null or not public.current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^(nitro|regular):(0[.]25|0[.]50|1|2|5|10|25|50|100|250|500)$'
     or not public.valid_hour_load_row(p_row) or not public.valid_hour_load_row(p_expected) then
    raise exception 'invalid-hour-load' using errcode = '22023';
  end if;
  select hour_load into existing from public.schedule_settings where id for update;
  if not found then raise exception 'schedule-settings-missing' using errcode = 'P0002'; end if;
  if coalesce(existing -> p_key, empty_row) is distinct from p_expected then
    raise exception 'hour-load-conflict' using errcode = '40001';
  end if;
  update public.schedule_settings set hour_load = jsonb_set(existing, array[p_key], p_row) where id;
end;
$$;
revoke all on function public.save_schedule_hour_load(text,jsonb,jsonb) from public, anon;
grant execute on function public.save_schedule_hour_load(text,jsonb,jsonb) to authenticated;
revoke update (hour_load) on public.schedule_settings from anon, authenticated;
