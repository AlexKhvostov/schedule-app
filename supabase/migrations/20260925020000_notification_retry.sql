-- Retry only deliveries that failed before reaching any recipient. Partial
-- deliveries stay terminal to avoid sending duplicate Discord messages.

alter table occupancy_event_notifications
  add column attempt_count smallint not null default 1,
  add column last_attempt_at timestamptz not null default now();

alter table occupancy_event_notifications
  add constraint occupancy_event_notifications_attempt_count_check
  check (attempt_count between 1 and 3);

create index occupancy_event_notifications_retry_idx
  on occupancy_event_notifications (completed_at, last_attempt_at)
  where delivery_status = 'failed' and channel_sent = false and dm_sent = 0 and attempt_count < 3;

grant update (
  delivery_status,
  channel_sent,
  dm_sent,
  dm_failed,
  completed_at,
  last_error,
  attempt_count,
  last_attempt_at
) on occupancy_event_notifications to service_role;

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
    left join occupancy_event_notifications n on n.event_id = e.id
    where e.action = 'remove'
      and e.actor_id = p_actor
      and e.member_id is not null
      and e.member_id <> p_actor
      and e.at >= now() - interval '30 minutes'
      and (
        n.event_id is null
        or (
          n.delivery_status = 'failed'
          and n.channel_sent = false
          and n.dm_sent = 0
          and n.attempt_count < 3
          and n.last_attempt_at <= now() - interval '2 minutes' * power(2, n.attempt_count - 1)
        )
      )
    order by e.at, e.id
    limit 48
  ), claimed as (
    insert into occupancy_event_notifications as n (
      event_id,
      claimed_by,
      delivery_status,
      attempt_count,
      last_attempt_at,
      completed_at,
      channel_sent,
      dm_sent,
      dm_failed,
      last_error
    )
    select c.id, p_actor, 'claimed', 1, now(), null, false, 0, 0, null
    from candidates c
    on conflict (event_id) do update
    set claimed_by = excluded.claimed_by,
        delivery_status = 'claimed',
        attempt_count = n.attempt_count + 1,
        last_attempt_at = now(),
        completed_at = null,
        dm_failed = 0,
        last_error = null
    where n.delivery_status = 'failed'
      and n.channel_sent = false
      and n.dm_sent = 0
      and n.attempt_count < 3
      and n.last_attempt_at <= now() - interval '2 minutes' * power(2, n.attempt_count - 1)
    returning n.event_id
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

comment on column occupancy_event_notifications.attempt_count is
  'At most three claims. Only fully failed deliveries may be reclaimed.';
