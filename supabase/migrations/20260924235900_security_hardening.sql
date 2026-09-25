-- Close direct writes to distance facts and make removal notifications
-- one-shot claims backed by the immutable occupancy event log.

revoke insert, update, delete on distances from authenticated;

drop policy if exists distances_insert on distances;
drop policy if exists distances_update on distances;
drop policy if exists distances_delete on distances;

create table occupancy_event_notifications (
  event_id uuid primary key references occupancy_events (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  claimed_by uuid not null references members (id) on delete cascade
);

comment on table occupancy_event_notifications is
  'One-shot claims for bot notifications. Only service_role may claim real removal events.';

alter table occupancy_event_notifications enable row level security;
revoke all on occupancy_event_notifications from public, anon, authenticated;
grant select, insert, delete on occupancy_event_notifications to service_role;

create or replace function claim_recent_removal_notifications(p_actor uuid)
returns table (
  event_id uuid,
  member_id uuid,
  slot_date date,
  half smallint,
  level smallint,
  limit_id text,
  variant_id text
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select e.id
    from occupancy_events e
    where e.action = 'remove'
      and e.actor_id = p_actor
      and e.member_id is not null
      and e.member_id <> p_actor
      and e.at >= now() - interval '5 minutes'
    order by e.at, e.id
    limit 48
  ), claimed as (
    insert into occupancy_event_notifications (event_id, claimed_by)
    select c.id, p_actor
    from candidates c
    on conflict (event_id) do nothing
    returning occupancy_event_notifications.event_id
  )
  select
    e.id,
    e.member_id,
    e.slot_date,
    e.half,
    e.level,
    k.limit_id,
    k.variant_id
  from claimed c
  join occupancy_events e on e.id = c.event_id
  join schedule_kinds k on k.id = e.kind_id
  order by e.slot_date, e.half, e.level;
$$;

revoke all on function claim_recent_removal_notifications(uuid) from public, anon, authenticated;
grant execute on function claim_recent_removal_notifications(uuid) to service_role;

comment on function claim_recent_removal_notifications(uuid) is
  'Service-role only: atomically claims recent real removals for one authenticated actor.';
