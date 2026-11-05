create or replace function public.valid_schedule_locked_appearance(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_value)) <> 5
     or jsonb_typeof(p_value->'merge') is distinct from 'boolean'
     or jsonb_typeof(p_value->'light') is distinct from 'string'
     or jsonb_typeof(p_value->'dark') is distinct from 'string'
     or jsonb_typeof(p_value->'short') is distinct from 'string'
     or jsonb_typeof(p_value->'long') is distinct from 'string' then return false; end if;
  return p_value->>'light' ~ '^#[0-9a-fA-F]{6}$' and p_value->>'dark' ~ '^#[0-9a-fA-F]{6}$'
    and char_length(p_value->>'short') <= 12 and char_length(p_value->>'long') <= 120;
end;
$$;
revoke all on function public.valid_schedule_locked_appearance(jsonb) from public, anon;
grant execute on function public.valid_schedule_locked_appearance(jsonb) to authenticated;

alter table public.schedule_settings add column locked_slot_appearance jsonb not null
  default '{"light":"#d5dbe4","dark":"#343e50","short":"","long":"","merge":true}'::jsonb
  constraint schedule_locked_appearance_valid check (public.valid_schedule_locked_appearance(locked_slot_appearance));
comment on column public.schedule_settings.locked_slot_appearance is
  'Club-wide capacity-closed slot band: light/dark colors, optional short (12) and long (120) text, adjacent-half-hour merging. No occupancy changes.';
revoke update (locked_slot_appearance) on public.schedule_settings from anon, authenticated;

-- Protected settings column, matching the other schedule appearance RPCs.
-- Identity and current database permission are checked before taking the row lock.
create or replace function public.save_schedule_locked_appearance(p_appearance jsonb, p_expected jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare current_value jsonb;
begin
  if auth.uid() is null or not public.current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  if not public.valid_schedule_locked_appearance(p_appearance) or not public.valid_schedule_locked_appearance(p_expected) then
    raise exception 'invalid-locked-appearance' using errcode = '22023';
  end if;
  select locked_slot_appearance into current_value from public.schedule_settings where id for update;
  if not found then raise exception 'schedule-settings-missing' using errcode = 'P0002'; end if;
  if current_value is distinct from p_expected then
    raise exception 'locked-appearance-conflict' using errcode = '40001';
  end if;
  update public.schedule_settings set locked_slot_appearance =
    jsonb_set(jsonb_set(p_appearance, '{light}', to_jsonb(lower(p_appearance->>'light'))), '{dark}', to_jsonb(lower(p_appearance->>'dark')))
    where id;
end;
$$;
revoke all on function public.save_schedule_locked_appearance(jsonb,jsonb) from public, anon;
grant execute on function public.save_schedule_locked_appearance(jsonb,jsonb) to authenticated;
