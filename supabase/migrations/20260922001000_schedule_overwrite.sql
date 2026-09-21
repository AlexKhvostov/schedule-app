-- Club flag: players may place over someone else's mark on the same level row.
-- Default off. Overwrite goes through replace_occupancy_slots, not a blanket DELETE policy.

create table schedule_settings (
  id boolean primary key default true check (id),
  allow_overwrite_marks boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references members (id) on delete set null
);

comment on table schedule_settings is
  'One row. Club rules for the grid. allow_overwrite_marks lets painters replace another mark after the client warns.';

comment on column schedule_settings.allow_overwrite_marks is
  'When true, replace_occupancy_slots may delete another member on the same kind/date/half/level and insert the painter.';

insert into schedule_settings (id, allow_overwrite_marks) values (true, false);

alter table schedule_settings enable row level security;
grant select on schedule_settings to authenticated;
grant update on schedule_settings to authenticated;
revoke insert, delete on schedule_settings from anon, authenticated;

create policy schedule_settings_read on schedule_settings
  for select to authenticated
  using (true);

create policy schedule_settings_update on schedule_settings
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create or replace function schedule_settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  new.id := true;
  new.updated_at := now();
  new.updated_by := current_member_id();
  return new;
end;
$$;

create trigger schedule_settings_stamp
  before update on schedule_settings
  for each row execute function schedule_settings_stamp();

create or replace function replace_occupancy_slots(
  p_member_id uuid,
  p_kind_id uuid,
  p_slots jsonb
)
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
  tbl integer;
  placed integer := 0;
  n integer := 0;
  occ occupancy%rowtype;
  mine occupancy%rowtype;
  caps smallint[];
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

  if p_member_id is distinct from actor and not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;

  if not exists (
    select 1 from members where id = p_member_id and access_status = 'active'
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

    caps := hours_of(p_kind_id, d);
    if caps is null or coalesce(array_length(caps, 1), 0) < (h / 2) + 1 then
      continue;
    end if;
    if lv >= caps[(h / 2) + 1] then
      continue;
    end if;

    select * into mine
    from occupancy
    where occupancy.member_id = p_member_id
      and occupancy.slot_date = d
      and occupancy.half = h
    limit 1;

    if found then
      continue;
    end if;

    select * into occ
    from occupancy
    where occupancy.kind_id = p_kind_id
      and occupancy.slot_date = d
      and occupancy.half = h
      and occupancy.level = lv
    limit 1;

    if found and occ.member_id is distinct from p_member_id then
      delete from occupancy where occupancy.id = occ.id;
    elsif found then
      continue;
    end if;

    insert into occupancy (member_id, kind_id, slot_date, half, level, tables)
    values (p_member_id, p_kind_id, d, h, lv, tbl);
    placed := placed + 1;
  end loop;

  return placed;
end;
$$;

comment on function replace_occupancy_slots(uuid, uuid, jsonb) is
  'Place the painter on a level row, deleting another occupant on those seats. Requires schedule_settings.allow_overwrite_marks.';

revoke all on function replace_occupancy_slots(uuid, uuid, jsonb) from public, anon;
grant execute on function replace_occupancy_slots(uuid, uuid, jsonb) to authenticated;
