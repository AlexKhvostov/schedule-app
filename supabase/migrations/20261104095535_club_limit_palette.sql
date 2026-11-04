-- One club palette, independent of playable limits. No new game or access grants.
create or replace function public.valid_schedule_limit_palette(p_palette jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  entry record;
begin
  if jsonb_typeof(p_palette) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_palette)) <> 6 then return false; end if;
  for entry in select key, value from jsonb_each(p_palette) loop
    if entry.key not in ('5', '25', '50', '100', '250', '500')
       or jsonb_typeof(entry.value) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(entry.value)) <> 2
       or jsonb_typeof(entry.value->'light') is distinct from 'string'
       or jsonb_typeof(entry.value->'dark') is distinct from 'string'
       or (entry.value->>'light') !~ '^#[0-9a-fA-F]{6}$'
       or (entry.value->>'dark') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_schedule_limit_palette(jsonb) from public, anon;
grant execute on function public.valid_schedule_limit_palette(jsonb) to authenticated;

alter table public.schedule_settings add column limit_palette jsonb not null default '{
  "5":{"light":"#c62828","dark":"#ff7070"},
  "25":{"light":"#177446","dark":"#4bd694"},
  "50":{"light":"#2563c4","dark":"#5ba8ff"},
  "100":{"light":"#343b46","dark":"#d8dee9"},
  "250":{"light":"#b52a74","dark":"#f58bc5"},
  "500":{"light":"#793eb5","dark":"#b79afa"}
}'::jsonb
  constraint schedule_limit_palette_valid check (public.valid_schedule_limit_palette(limit_palette));

comment on column public.schedule_settings.limit_palette is
  'Shared limit colors for light/dark themes. Includes 5 without changing playable limits. Only saved via guarded RPC.';

-- Match the existing narrow settings RPCs: column UPDATE is not granted.
-- The definer is necessary to write this protected column; auth and permission
-- are explicitly checked before reading/locking it. No dynamic SQL.
create or replace function public.save_schedule_limit_palette(p_palette jsonb, p_expected jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_palette jsonb;
begin
  if auth.uid() is null or not public.current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  if not public.valid_schedule_limit_palette(p_palette)
     or not public.valid_schedule_limit_palette(p_expected) then
    raise exception 'invalid-palette' using errcode = '22023';
  end if;
  select limit_palette into current_palette from public.schedule_settings where id for update;
  if not found then raise exception 'schedule-settings-missing' using errcode = 'P0002'; end if;
  if current_palette is distinct from lower(p_expected::text)::jsonb then
    raise exception 'palette-conflict' using errcode = '40001';
  end if;
  update public.schedule_settings set limit_palette = lower(p_palette::text)::jsonb where id;
end;
$$;
revoke all on function public.save_schedule_limit_palette(jsonb, jsonb) from public, anon;
grant execute on function public.save_schedule_limit_palette(jsonb, jsonb) to authenticated;
revoke update (limit_palette) on public.schedule_settings from anon, authenticated;
