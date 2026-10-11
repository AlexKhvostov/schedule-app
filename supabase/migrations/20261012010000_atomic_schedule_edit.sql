-- A confirmed gesture is one transaction, including its own and foreign seats.
-- Existing RPCs remain available to compatible clients; new clients fail closed
-- when this migration has not yet been applied.
create or replace function public.apply_schedule_edit(
  p_kind_id uuid,
  p_member_id uuid,
  p_place jsonb default '[]'::jsonb,
  p_remove jsonb default '[]'::jsonb,
  p_foreign jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := current_member_id();
  painter uuid := coalesce(p_member_id, actor);
  wanted record;
  occupant uuid;
  removed integer := 0;
  affected integer := 0;
  changed integer := 0;
  cet_now timestamp := timezone('Europe/Madrid', now());
begin
  if actor is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_place) is distinct from 'array'
     or jsonb_typeof(p_remove) is distinct from 'array'
     or jsonb_typeof(p_foreign) is distinct from 'array' then
    raise exception 'invalid-range' using errcode = '22023';
  end if;
  if jsonb_array_length(p_place) + jsonb_array_length(p_remove) + jsonb_array_length(p_foreign) = 0 then
    raise exception 'empty-range' using errcode = '22023';
  end if;
  if jsonb_array_length(p_place) > 48 or jsonb_array_length(p_remove) > 48 or jsonb_array_length(p_foreign) > 48 then
    raise exception 'too-many' using errcode = '22023';
  end if;

  -- Reject expired/malformed seats instead of silently committing part of a gesture.
  for wanted in
    select * from jsonb_to_recordset(p_place || p_remove || p_foreign)
      as x(date date, half integer, level integer)
  loop
    if wanted.date is null or wanted.half is null or wanted.level is null
       or wanted.half not between 0 and 47 or wanted.level not between 0 and 5 then
      raise exception 'invalid-range' using errcode = '22023';
    end if;
    if wanted.date < cet_now::date or (wanted.date = cet_now::date and
       wanted.half < extract(hour from cet_now)::integer * 2 + floor(extract(minute from cet_now) / 30)::integer) then
      raise exception 'schedule-conflict' using errcode = '40001';
    end if;
  end loop;

  if exists (select 1 from jsonb_to_recordset(p_place) as x(tables integer)
    where x.tables is not null and x.tables not between 1 and 30) then
    raise exception 'invalid-range' using errcode = '22023';
  end if;

  if (select count(*) from (
      select distinct x.date, x.half, x.level
      from jsonb_to_recordset(p_place || p_remove || p_foreign) as x(date date, half integer, level integer)
    ) seats) > 48 then
    raise exception 'too-many' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_foreign) as x(date date, half integer, level integer)
    group by x.date, x.half, x.level having count(*) > 1
  ) then
    raise exception 'invalid-range' using errcode = '22023';
  end if;

  -- Lock the confirmed owners in deterministic order. A stale confirmation must
  -- not remove a different player's new shift at the same coordinates.
  for wanted in
    select * from jsonb_to_recordset(p_foreign)
      as x(date date, half integer, level integer, member_id uuid)
    order by date, half, level
  loop
    if wanted.member_id is null or wanted.member_id = actor then
      raise exception 'invalid-range' using errcode = '22023';
    end if;
    select o.member_id into occupant from occupancy o
    where o.kind_id = p_kind_id and o.slot_date = wanted.date
      and o.half = wanted.half and o.level = wanted.level
    for update;
    if not found or occupant is distinct from wanted.member_id then
      raise exception 'schedule-conflict' using errcode = '40001';
    end if;
  end loop;

  if jsonb_array_length(p_foreign) > 0 then
    removed := remove_foreign_slots(p_kind_id, p_foreign);
    if removed <> jsonb_array_length(p_foreign) then
      raise exception 'schedule-conflict' using errcode = '40001';
    end if;
    changed := changed + removed;
  end if;
  if jsonb_array_length(p_remove) > 0 then
    affected := apply_own_slots(p_kind_id, actor, '[]'::jsonb, p_remove);
    if affected <> jsonb_array_length(p_remove) then
      raise exception 'schedule-conflict' using errcode = '40001';
    end if;
    changed := changed + affected;
  end if;
  if jsonb_array_length(p_place) > 0 then
    affected := apply_own_slots(p_kind_id, painter, p_place, '[]'::jsonb);
    if affected <> jsonb_array_length(p_place) then
      raise exception 'schedule-conflict' using errcode = '40001';
    end if;
    changed := changed + affected;
  end if;
  return changed;
end;
$$;

comment on function public.apply_schedule_edit(uuid,uuid,jsonb,jsonb,jsonb) is
  'Atomically apply a confirmed range, checking and locking the expected foreign owners. Delegates permissions and insert guards to the existing protected RPCs.';
revoke all on function public.apply_schedule_edit(uuid,uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.apply_schedule_edit(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

-- A profile may have no tag, but it is not a schedule brush until letters exist.
create or replace function public.enforce_schedule_mark_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from members m where m.id = new.member_id and nullif(btrim(m.mark_tag), '') is not null) then
    raise exception 'schedule-mark-required' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_schedule_mark_on_insert() from public, anon, authenticated;
create trigger occupancy_mark_insert before insert on public.occupancy
for each row execute function public.enforce_schedule_mark_on_insert();
