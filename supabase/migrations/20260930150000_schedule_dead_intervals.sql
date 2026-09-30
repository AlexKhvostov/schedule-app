-- Daily low-traffic intervals for each tournament variant and limit.
-- Half-hour indexes are CET/Europe/Madrid wall-clock positions: [start_half, end_half).

create table schedule_dead_intervals (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references variants (id),
  limit_id text not null references limits (id),
  start_half smallint not null check (start_half between 0 and 47),
  end_half smallint not null check (end_half between 1 and 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references members (id) on delete set null,
  check (start_half < end_half),
  unique (variant_id, limit_id, start_half, end_half)
);

comment on table schedule_dead_intervals is
  'Daily low-traffic schedule intervals in CET/Europe/Madrid, stored as half-hour [start,end) ranges per variant and limit.';

alter table schedule_dead_intervals enable row level security;

create policy schedule_dead_intervals_read on schedule_dead_intervals
  for select to authenticated
  using (current_has_permission('schedule') or current_has_permission('schedule.manage'));

grant select on schedule_dead_intervals to authenticated;
revoke insert, update, delete on schedule_dead_intervals from authenticated;

create or replace function schedule_dead_interval_no_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from schedule_dead_intervals existing
    where existing.variant_id = new.variant_id
      and existing.limit_id = new.limit_id
      and existing.id <> new.id
      and existing.start_half < new.end_half
      and new.start_half < existing.end_half
  ) then
    raise exception 'schedule-dead-interval-overlap' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger schedule_dead_interval_overlap
  before insert or update on schedule_dead_intervals
  for each row execute function schedule_dead_interval_no_overlap();

create or replace function save_schedule_dead_intervals(p_intervals jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_variant text;
  v_limit text;
  v_start smallint;
  v_end smallint;
begin
  if not current_has_permission('schedule.manage') then
    raise exception 'schedule-manage-only' using errcode = '42501';
  end if;
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' then
    raise exception 'schedule-dead-intervals-array-required' using errcode = '22023';
  end if;

  -- Serialize whole-set replacement so two admins cannot interleave delete/insert.
  perform pg_advisory_xact_lock(hashtext('schedule_dead_intervals'));
  delete from schedule_dead_intervals where id is not null;

  for item in select value from jsonb_array_elements(p_intervals) loop
    if jsonb_typeof(item) <> 'object'
       or not (item ?& array['variant', 'limit', 'startHalf', 'endHalf']) then
      raise exception 'schedule-dead-interval-invalid' using errcode = '22023';
    end if;

    v_variant := nullif(btrim(item ->> 'variant'), '');
    v_limit := nullif(btrim(item ->> 'limit'), '');
    begin
      v_start := (item ->> 'startHalf')::smallint;
      v_end := (item ->> 'endHalf')::smallint;
    exception when others then
      raise exception 'schedule-dead-interval-invalid' using errcode = '22023';
    end;

    if v_variant not in ('nitro', 'regular')
       or v_start not between 0 and 47
       or v_end not between 1 and 48
       or v_start >= v_end
       or not exists (
         select 1 from schedule_kinds k
         where k.variant_id = v_variant and k.limit_id = v_limit
       ) then
      raise exception 'schedule-dead-interval-invalid' using errcode = '22023';
    end if;

    insert into schedule_dead_intervals (
      variant_id, limit_id, start_half, end_half, updated_by
    ) values (
      v_variant, v_limit, v_start, v_end, current_member_id()
    );
  end loop;
end;
$$;

revoke all on function save_schedule_dead_intervals(jsonb) from public, anon;
grant execute on function save_schedule_dead_intervals(jsonb) to authenticated;

comment on function save_schedule_dead_intervals(jsonb) is
  'Atomically replace all daily dead-time intervals. Requires schedule.manage; validates kinds, bounds and overlap.';

alter publication supabase_realtime add table schedule_dead_intervals;
