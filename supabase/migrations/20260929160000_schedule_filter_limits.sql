-- Admin-controlled limits available in the schedule filter.
-- This is presentation/planning availability only: catalog kinds, access grants,
-- occupancy and history stay intact.

alter table schedule_settings
  add column if not exists filter_limits_nitro text[],
  add column if not exists filter_limits_regular text[];

-- Backfill is a migration-owned write, not a user action. The existing stamp
-- trigger rejects SQL Editor / migration sessions because they have no auth UID.
-- Disable only this trigger for the backfill; a failed migration transaction
-- restores its previous state automatically.
alter table schedule_settings disable trigger schedule_settings_stamp;

update schedule_settings s
set
  filter_limits_nitro = coalesce(
    s.filter_limits_nitro,
    (
      select array_agg(x.limit_id order by x.sort, x.limit_id)
      from (
        select distinct k.limit_id, l.sort
        from schedule_kinds k
        join limits l on l.id = k.limit_id
        where k.variant_id = 'nitro'
      ) x
    ),
    array['50']::text[]
  ),
  filter_limits_regular = coalesce(
    s.filter_limits_regular,
    (
      select array_agg(x.limit_id order by x.sort, x.limit_id)
      from (
        select distinct k.limit_id, l.sort
        from schedule_kinds k
        join limits l on l.id = k.limit_id
        where k.variant_id = 'regular'
      ) x
    ),
    array['50']::text[]
  )
where s.id;

alter table schedule_settings enable trigger schedule_settings_stamp;

alter table schedule_settings
  alter column filter_limits_nitro set default array['50']::text[],
  alter column filter_limits_nitro set not null,
  alter column filter_limits_regular set default array['50']::text[],
  alter column filter_limits_regular set not null,
  add constraint schedule_settings_filter_limits_nitro_nonempty
    check (cardinality(filter_limits_nitro) > 0),
  add constraint schedule_settings_filter_limits_regular_nonempty
    check (cardinality(filter_limits_regular) > 0);

comment on column schedule_settings.filter_limits_nitro is
  'Nitro limits offered by the schedule filter. Does not remove kinds, permissions, occupancy or history.';
comment on column schedule_settings.filter_limits_regular is
  'Regular limits offered by the schedule filter. Does not remove kinds, permissions, occupancy or history.';

-- schedule_settings predates granular permissions. Keep existing flag writes,
-- but align their server guard with the schedule-management permission.
drop policy if exists schedule_settings_update on schedule_settings;
create policy schedule_settings_update on schedule_settings
  for update to authenticated
  using (current_has_permission('schedule.manage'))
  with check (current_has_permission('schedule.manage'));

create or replace function schedule_settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  new.id := true;
  new.updated_at := now();
  new.updated_by := current_member_id();
  return new;
end;
$$;

-- Filter-limit arrays are writable only through the atomic RPC below. Existing
-- boolean switches keep their direct-update API for backward compatibility.
revoke update on schedule_settings from authenticated;
grant update (
  allow_overwrite_marks,
  allow_replace_marks,
  count_tables,
  edit_by_button,
  allow_act_as
) on schedule_settings to authenticated;

create or replace function save_schedule_filter_limits(
  p_nitro text[],
  p_regular text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nitro text[];
  v_regular text[];
begin
  if not current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;

  select array_agg(x.limit_id order by l.sort, x.limit_id)
  into v_nitro
  from (
    select distinct nullif(btrim(value), '') as limit_id
    from unnest(coalesce(p_nitro, array[]::text[])) value
  ) x
  join limits l on l.id = x.limit_id
  where exists (
    select 1 from schedule_kinds k
    where k.variant_id = 'nitro' and k.limit_id = x.limit_id
  );

  select array_agg(x.limit_id order by l.sort, x.limit_id)
  into v_regular
  from (
    select distinct nullif(btrim(value), '') as limit_id
    from unnest(coalesce(p_regular, array[]::text[])) value
  ) x
  join limits l on l.id = x.limit_id
  where exists (
    select 1 from schedule_kinds k
    where k.variant_id = 'regular' and k.limit_id = x.limit_id
  );

  if coalesce(cardinality(v_nitro), 0) = 0
     or coalesce(cardinality(v_regular), 0) = 0 then
    raise exception 'schedule-filter-limits-empty' using errcode = '22023';
  end if;

  if cardinality(v_nitro) <> cardinality(array(select distinct nullif(btrim(value), '') from unnest(coalesce(p_nitro, array[]::text[])) value where nullif(btrim(value), '') is not null))
     or cardinality(v_regular) <> cardinality(array(select distinct nullif(btrim(value), '') from unnest(coalesce(p_regular, array[]::text[])) value where nullif(btrim(value), '') is not null)) then
    raise exception 'schedule-filter-limit-unknown' using errcode = '22023';
  end if;

  update schedule_settings
  set
    filter_limits_nitro = v_nitro,
    filter_limits_regular = v_regular
  where id;

  if not found then
    raise exception 'schedule-settings-missing' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function save_schedule_filter_limits(text[], text[]) from public, anon;
grant execute on function save_schedule_filter_limits(text[], text[]) to authenticated;

comment on function save_schedule_filter_limits(text[], text[]) is
  'Atomically replace non-empty Nitro and Regular schedule-filter limits. Requires schedule.manage.';
