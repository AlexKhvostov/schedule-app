-- Own brush: one round-trip for a range. DELETE realtime needs full row.
alter table occupancy replica identity full;

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
  'Place and/or remove the painter''s own seats in one transaction. Max 48. Occupied by another member aborts the whole batch.';

revoke all on function apply_own_slots(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function apply_own_slots(uuid, uuid, jsonb, jsonb) to authenticated;
