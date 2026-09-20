-- History of place/remove. Live occupancy stays small: a delete removes the
-- slot, this table keeps who did it. The schedule query never reads here.

create table occupancy_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  action text not null check (action in ('place', 'remove')),
  occupancy_id uuid,
  member_id uuid references members (id) on delete set null,
  actor_id uuid references members (id) on delete set null,
  kind_id uuid references schedule_kinds (id) on delete set null,
  slot_date date not null,
  half smallint not null check (half between 0 and 47),
  level smallint not null check (level between 0 and 5)
);

comment on table occupancy_events is
  'Place/remove log. Not the grid. Rows older than 2 months are pruned.';

create index occupancy_events_at on occupancy_events (at);
create index occupancy_events_slot on occupancy_events (slot_date, half, kind_id);
create index occupancy_events_member on occupancy_events (member_id, at desc);
create index occupancy_events_actor on occupancy_events (actor_id, at desc);

insert into occupancy_events (at, action, occupancy_id, member_id, actor_id, kind_id, slot_date, half, level)
select created_at, 'place', id, member_id, coalesce(placed_by, member_id), kind_id, slot_date, half, level
from occupancy;

create or replace function occupancy_write_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into occupancy_events (
      occupancy_id, action, member_id, actor_id, kind_id, slot_date, half, level
    ) values (
      new.id, 'place', new.member_id, coalesce(new.placed_by, current_member_id()),
      new.kind_id, new.slot_date, new.half, new.level
    );
    return new;
  end if;
  insert into occupancy_events (
    occupancy_id, action, member_id, actor_id, kind_id, slot_date, half, level
  ) values (
    old.id, 'remove', old.member_id, current_member_id(),
    old.kind_id, old.slot_date, old.half, old.level
  );
  return old;
end;
$$;

create trigger occupancy_write_event
  after insert or delete on occupancy
  for each row execute function occupancy_write_event();

create or replace function occupancy_events_prune()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from occupancy_events where at < now() - interval '2 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function occupancy_events_prune() from public, anon, authenticated;

alter table occupancy_events enable row level security;
revoke insert, update, delete on occupancy_events from anon, authenticated;
grant select on occupancy_events to authenticated;

create policy occupancy_events_read on occupancy_events
  for select to authenticated
  using (
    is_staff()
    or member_id = current_member_id()
    or actor_id = current_member_id()
  );

create extension if not exists pg_cron;

select cron.schedule(
  'occupancy-events-prune',
  '20 3 * * *',
  $$select occupancy_events_prune()$$
);
