-- Snapshot tables on the slot. members.tables is only the last brush default.

alter table occupancy
  add column if not exists tables smallint;

update occupancy o
set tables = coalesce(m.tables, 1)
from members m
where m.id = o.member_id
  and o.tables is null;

update occupancy
set tables = 1
where tables is null;

alter table occupancy
  alter column tables set default 1;

alter table occupancy
  alter column tables set not null;

alter table occupancy
  drop constraint if exists occupancy_tables_range;

alter table occupancy
  add constraint occupancy_tables_range check (tables between 1 and 30);

comment on column occupancy.tables is
  'Tables promised in this slot. Frozen at place time. members.tables is the last brush default, not the chip on already placed slots.';

comment on column members.tables is
  'Last table count used in the edit dock. Already placed occupancy rows keep their own tables.';

alter table occupancy_events
  add column if not exists tables smallint;

alter table occupancy_events
  drop constraint if exists occupancy_events_tables_range;

alter table occupancy_events
  add constraint occupancy_events_tables_range
  check (tables is null or tables between 1 and 30);

comment on column occupancy_events.tables is
  'Tables on the slot at place or remove time.';

update occupancy_events e
set tables = o.tables
from occupancy o
where o.id = e.occupancy_id
  and e.tables is null;

update occupancy_events e
set tables = m.tables
from members m
where m.id = e.member_id
  and e.tables is null;

create or replace function occupancy_guard()
returns trigger
language plpgsql
as $$
declare
  caps smallint[];
  open_levels integer;
begin
  if exists (
    select 1 from members
    where id = new.member_id and access_status <> 'active'
  ) then
    raise exception 'member is not active';
  end if;
  if new.tables is null then
    select tables into new.tables from members where id = new.member_id;
  end if;
  new.tables := least(30, greatest(1, coalesce(new.tables, 1)));
  caps := hours_of(new.kind_id, new.slot_date);
  open_levels := caps[(new.half / 2) + 1];
  if new.level >= open_levels then
    raise exception 'level is locked';
  end if;
  return new;
end;
$$;

create or replace function occupancy_write_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into occupancy_events (
      occupancy_id, action, member_id, actor_id, kind_id, slot_date, half, level, tables
    ) values (
      new.id, 'place', new.member_id, coalesce(new.placed_by, current_member_id()),
      new.kind_id, new.slot_date, new.half, new.level, new.tables
    );
    return new;
  end if;
  insert into occupancy_events (
    occupancy_id, action, member_id, actor_id, kind_id, slot_date, half, level, tables
  ) values (
    old.id, 'remove', old.member_id, current_member_id(),
    old.kind_id, old.slot_date, old.half, old.level, old.tables
  );
  return old;
end;
$$;
