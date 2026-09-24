-- Club rules: anyone may delete a foreign mark (after the client warns),
-- and anyone may place another member's mark into an empty seat.
-- Staff always may both. Replace-as-overwrite uses allow_overwrite_marks.

alter table schedule_settings
  add column if not exists allow_act_as boolean not null default false;

comment on column schedule_settings.allow_overwrite_marks is
  'When true, every active member may delete another mark. Staff always may. The client always warns first.';

comment on column schedule_settings.allow_act_as is
  'When true, every active member may place another member''s mark into empty seats. Staff always may.';

comment on table schedule_settings is
  'One row. Club rules for the grid: delete foreign marks, act-as place, count tables, edit-by-button.';

create or replace function apply_own_slots(
  p_kind_id uuid,
  p_member_id uuid,
  p_place jsonb default '[]'::jsonb,
  p_remove jsonb default '[]'::jsonb
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
  tbl integer;
  n integer := 0;
  done integer := 0;
  occ occupancy%rowtype;
  ok boolean;
  place_n integer;
  remove_n integer;
begin
  actor := current_member_id();
  if actor is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  painter := coalesce(p_member_id, actor);
  if painter is distinct from actor and not is_staff() then
    select s.allow_act_as into allow_it from schedule_settings s where s.id;
    if not coalesce(allow_it, false) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
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

  if p_place is null or jsonb_typeof(p_place) is distinct from 'array' then
    p_place := '[]'::jsonb;
  end if;
  if p_remove is null or jsonb_typeof(p_remove) is distinct from 'array' then
    p_remove := '[]'::jsonb;
  end if;

  place_n := jsonb_array_length(p_place);
  remove_n := jsonb_array_length(p_remove);
  if place_n + remove_n = 0 then
    raise exception 'empty-range';
  end if;
  if place_n + remove_n > 48 then
    raise exception 'too-many';
  end if;

  cet_now := timezone('Europe/Madrid', now());
  cet_date := cet_now::date;
  cet_half := (extract(hour from cet_now)::integer) * 2
    + case when extract(minute from cet_now) >= 30 then 1 else 0 end;

  for slot in select value from jsonb_array_elements(p_remove)
  loop
    n := n + 1;
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

    delete from occupancy
    where occupancy.kind_id = p_kind_id
      and occupancy.slot_date = d
      and occupancy.half = h
      and occupancy.level = lv
      and occupancy.member_id = painter;
    if found then
      done := done + 1;
    end if;
  end loop;

  for slot in select value from jsonb_array_elements(p_place)
  loop
    n := n + 1;
    ok := true;
    begin
      d := (slot ->> 'date')::date;
      h := (slot ->> 'half')::integer;
      lv := (slot ->> 'level')::integer;
      tbl := least(30, greatest(1, coalesce((slot ->> 'tables')::integer, 1)));
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
      raise exception 'seat taken';
    end if;

    insert into occupancy (member_id, kind_id, slot_date, half, level, tables)
    values (painter, p_kind_id, d, h, lv, tbl);
    done := done + 1;
  end loop;

  return done;
end;
$$;

comment on function apply_own_slots(uuid, uuid, jsonb, jsonb) is
  'Place or remove the painter''s occupancy. Painter may differ from the actor when is_staff() or allow_act_as.';

create or replace function remove_foreign_slots(p_kind_id uuid, p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  allow_it boolean;
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

  select s.allow_overwrite_marks into allow_it from schedule_settings s where s.id;
  if not coalesce(allow_it, false) and not is_staff() then
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
  'Delete another member''s occupancy on the given seats. Requires allow_overwrite_marks or is_staff(). Does not insert a new mark.';

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

  select s.allow_overwrite_marks into allow_it from schedule_settings s where s.id;
  if not coalesce(allow_it, false) and not is_staff() then
    raise exception 'overwrite-off';
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
  'Delete another occupant on the given seats, then insert the painter. Requires allow_overwrite_marks or is_staff(). Own brush only for non-staff.';

drop policy if exists occupancy_insert_own on occupancy;
create policy occupancy_insert_own on occupancy
  for insert to authenticated
  with check (
    exists (
      select 1 from members actor
      where actor.id = current_member_id()
        and actor.access_status = 'active'
    )
    and exists (
      select 1 from members target
      where target.id = member_id
        and target.access_status = 'active'
    )
    and (
      member_id = current_member_id()
      or is_staff()
      or exists (
        select 1 from schedule_settings s
        where s.id and s.allow_act_as
      )
    )
  );
