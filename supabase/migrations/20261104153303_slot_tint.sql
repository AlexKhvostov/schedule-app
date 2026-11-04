-- Additive schema: older clients may still save only the palette with its old RPC.
create or replace function public.valid_schedule_slot_tint(p_tint jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_tint) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_tint)) <> 2
     or jsonb_typeof(p_tint->'enabled') is distinct from 'boolean'
     or jsonb_typeof(p_tint->'strength') is distinct from 'number' then return false; end if;
  return (p_tint->>'strength')::numeric between 0 and 30
    and (p_tint->>'strength')::numeric = trunc((p_tint->>'strength')::numeric);
end;
$$;
revoke all on function public.valid_schedule_slot_tint(jsonb) from public, anon;
grant execute on function public.valid_schedule_slot_tint(jsonb) to authenticated;

alter table public.schedule_settings add column slot_tint jsonb not null
  default '{"enabled":true,"strength":8}'::jsonb
  constraint schedule_slot_tint_valid check (public.valid_schedule_slot_tint(slot_tint));
comment on column public.schedule_settings.slot_tint is
  'Club-wide future empty-slot tint. Shared enabled flag and intensity percent 0..30; color follows each limit palette.';
revoke update (slot_tint) on public.schedule_settings from anon, authenticated;

-- Definer writes protected settings columns; explicit identity/permission checks precede the lock.
create or replace function public.save_schedule_appearance(
  p_palette jsonb, p_expected_palette jsonb, p_tint jsonb, p_expected_tint jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_palette jsonb;
  current_tint jsonb;
begin
  if auth.uid() is null or not public.current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  if not public.valid_schedule_limit_palette(p_palette)
     or not public.valid_schedule_limit_palette(p_expected_palette)
     or not public.valid_schedule_slot_tint(p_tint)
     or not public.valid_schedule_slot_tint(p_expected_tint) then
    raise exception 'invalid-schedule-appearance' using errcode = '22023';
  end if;
  select limit_palette, slot_tint into current_palette, current_tint
    from public.schedule_settings where id for update;
  if not found then raise exception 'schedule-settings-missing' using errcode = 'P0002'; end if;
  if current_palette is distinct from lower(p_expected_palette::text)::jsonb
     or current_tint is distinct from p_expected_tint then
    raise exception 'palette-conflict' using errcode = '40001';
  end if;
  update public.schedule_settings
    set limit_palette = lower(p_palette::text)::jsonb, slot_tint = p_tint where id;
end;
$$;
revoke all on function public.save_schedule_appearance(jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_schedule_appearance(jsonb,jsonb,jsonb,jsonb) to authenticated;
