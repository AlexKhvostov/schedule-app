-- Range replace: delete another mark, then place the painter on those seats.
-- Click-to-clear still uses allow_overwrite_marks + remove_foreign_slots.

alter table schedule_settings
  add column if not exists allow_replace_marks boolean not null default false;

comment on column schedule_settings.allow_replace_marks is
  'When true, replace_foreign_slots may delete another occupant on a range and insert the painter.';

comment on table schedule_settings is
  'One row. Club rules for the grid: delete foreign marks, replace on a range, count tables.';

create or replace function replace_foreign_slots(
  p_kind_id uuid,
  p_member_id uuid,
  p_slots jsonb,
  p_tables integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  painter uuid;
  allow_it boolean;
  cet_now timestamp;
  cet_date date;
  cet_half integer;
  slot jsonb;
  d date;
  h integer;
  lv integer;
  placed integer := 0;
  n integer := 0;
  occ occupancy%rowtype;
  ok boolean;
  tbl integer;
begin
  actor := current_member_id();
  if actor is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select s.allow_replace_marks into allow_it from schedule_settings s where s.id;
  if not coalesce(allow_it, false) then
    raise exception 'replace-off';
  end if;

  painter := coalesce(p_member_id, actor);
  if painter is distinct from actor and not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from members where id = actor and access_status = 'active'
  ) then
    raise exception 'member is not active';
  end if;
  if not exists (
    select 1 from members where id = painter and access_status = 'active'
  ) then
    raise exception 'member is not active';
  end if;

  if jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception 'empty-range';
  end if;

  tbl := least(30, greatest(1, coalesce(p_tables, 1)));
  cet_now := timezone('Europe/Madrid', now());
  cet_date := cet_now::date;
  cet_half := (extract(hour from cet_now)::integer) * 2
    + case when extract(minute from cet_now) >= 30 then 1 else 0 end;

  for slot in select value from jsonb_array_elements(p_slots)
  loop
    n := n + 1;
    if n > 48 then
      exit;
    end if;

    ok := true;
    begin
      d := (slot ->> 'date')::date;
      h := (slot ->> 'half')::integer;
      lv := (slot ->> 'level')::integer;
    exception
      when others then
        ok := false;
    end;
    if not ok then
      continue;
    end if;
    if d is null or h not between 0 and 47 or lv not between 0 and 5 then
      continue;
    end if;
    if d < cet_date or (d = cet_date and h < cet_half) then
      continue;
    end if;

    select * into occ
    from occupancy
    where occupancy.kind_id = p_kind_id
      and occupancy.slot_date = d
      and occupancy.half = h
      and occupancy.level = lv
    limit 1;

    if found then
      if occ.member_id = painter then
        continue;
      end if;
      delete from occupancy where occupancy.id = occ.id;
    end if;

    insert into occupancy (member_id, kind_id, slot_date, half, level, tables)
    values (painter, p_kind_id, d, h, lv, tbl);
    placed := placed + 1;
  end loop;

  return placed;
end;
$$;

comment on function replace_foreign_slots(uuid, uuid, jsonb, integer) is
  'Delete another occupant on the given seats, then insert the painter. Requires schedule_settings.allow_replace_marks.';

revoke all on function replace_foreign_slots(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function replace_foreign_slots(uuid, uuid, jsonb, integer) to authenticated;

-- Click-to-clear is allowed when either delete or replace is on.
create or replace function remove_foreign_slots(p_kind_id uuid, p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  allow_del boolean;
  allow_rep boolean;
  cet_now timestamp;
  cet_date date;
  cet_half integer;
  slot jsonb;
  d date;
  h integer;
  lv integer;
  removed integer := 0;
  n integer := 0;
  occ occupancy%rowtype;
  ok boolean;
begin
  actor := current_member_id();
  if actor is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select s.allow_overwrite_marks, s.allow_replace_marks
    into allow_del, allow_rep
  from schedule_settings s
  where s.id;
  if not coalesce(allow_del, false) and not coalesce(allow_rep, false) then
    raise exception 'overwrite-off';
  end if;

  if not exists (
    select 1 from members where id = actor and access_status = 'active'
  ) then
    raise exception 'member is not active';
  end if;

  if jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception 'empty-range';
  end if;

  cet_now := timezone('Europe/Madrid', now());
  cet_date := cet_now::date;
  cet_half := (extract(hour from cet_now)::integer) * 2
    + case when extract(minute from cet_now) >= 30 then 1 else 0 end;

  for slot in select value from jsonb_array_elements(p_slots)
  loop
    n := n + 1;
    if n > 48 then
      exit;
    end if;

    ok := true;
    begin
      d := (slot ->> 'date')::date;
      h := (slot ->> 'half')::integer;
      lv := (slot ->> 'level')::integer;
    exception
      when others then
        ok := false;
    end;
    if not ok then
      continue;
    end if;

    if d is null or h not between 0 and 47 or lv not between 0 and 5 then
      continue;
    end if;
    if d < cet_date or (d = cet_date and h < cet_half) then
      continue;
    end if;

    select * into occ
    from occupancy
    where occupancy.kind_id = p_kind_id
      and occupancy.slot_date = d
      and occupancy.half = h
      and occupancy.level = lv
    limit 1;

    if not found then
      continue;
    end if;
    if occ.member_id = actor then
      continue;
    end if;

    delete from occupancy where occupancy.id = occ.id;
    removed := removed + 1;
  end loop;

  return removed;
end;
$$;

comment on function remove_foreign_slots(uuid, jsonb) is
  'Delete another member''s occupancy on the given seats. Requires allow_overwrite_marks or allow_replace_marks. Does not insert a new mark.';
