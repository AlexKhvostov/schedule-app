-- Make delivery outcomes queryable without exposing them to browser clients.

alter table app_roles enable row level security;
revoke insert, update, delete on app_roles from public, anon, authenticated;
grant select on app_roles to authenticated;

drop policy if exists app_roles_read on app_roles;
create policy app_roles_read on app_roles
for select to authenticated using (true);

alter table occupancy_event_notifications
  add column delivery_status text not null default 'claimed',
  add column channel_sent boolean not null default false,
  add column dm_sent integer not null default 0,
  add column dm_failed integer not null default 0,
  add column completed_at timestamptz,
  add column last_error jsonb;

alter table occupancy_event_notifications
  add constraint occupancy_event_notifications_delivery_status_check
  check (delivery_status in ('claimed', 'delivered', 'partial', 'failed', 'skipped')),
  add constraint occupancy_event_notifications_delivery_counts_check
  check (dm_sent >= 0 and dm_failed >= 0);

create index occupancy_event_notifications_status_claimed_idx
  on occupancy_event_notifications (delivery_status, claimed_at desc);

grant update (
  delivery_status,
  channel_sent,
  dm_sent,
  dm_failed,
  completed_at,
  last_error
) on occupancy_event_notifications to service_role;

comment on column occupancy_event_notifications.delivery_status is
  'Final delivery outcome written by notify-mark-removed: delivered, partial, failed or skipped.';
comment on column occupancy_event_notifications.last_error is
  'Sanitized delivery error codes; never stores message contents or bot tokens.';
