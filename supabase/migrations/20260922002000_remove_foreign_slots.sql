-- Club flag now means: painters may delete someone else's mark (after a warning).
-- They do not place their own mark in the same gesture. Drop the replace RPC.

comment on table schedule_settings is
  'One row. Club rules for the grid. allow_overwrite_marks lets painters delete another mark after the client warns.';

comment on column schedule_settings.allow_overwrite_marks is
  'When true, remove_foreign_slots may delete another member on the same kind/date/half/level. Placing still needs an empty seat.';

drop function if exists replace_occupancy_slots(uuid, uuid, jsonb);

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
  if not coalesce(allow_it, false) then
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
  'Delete another member''s occupancy on the given seats. Requires schedule_settings.allow_overwrite_marks. Does not insert a new mark.';

revoke all on function remove_foreign_slots(uuid, jsonb) from public, anon;
grant execute on function remove_foreign_slots(uuid, jsonb) to authenticated;
