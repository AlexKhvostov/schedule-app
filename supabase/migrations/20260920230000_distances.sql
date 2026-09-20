-- Monthly hand slices. Import comes later. Independent from cabinet player_limits.

create table distance_entry_kinds (
  id text primary key,
  title text not null,
  sort smallint not null default 0
);

insert into distance_entry_kinds (id, title, sort) values
  ('primary', 'Primary', 0),
  ('correction', 'Correction', 1);

create table distances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  room_id uuid not null references rooms (id),
  month_start date not null,
  variant_id text not null references variants (id),
  limit_id text not null references limits (id),
  format_id text not null default 'mtt' references formats (id),
  entry_kind text not null default 'primary' references distance_entry_kinds (id),
  part smallint not null default 1,
  hands integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date),
  check (part >= 1),
  check (entry_kind <> 'primary' or hands >= 0),
  unique (member_id, room_id, month_start, variant_id, limit_id, format_id, entry_kind, part)
);

create index distances_member_month_idx on distances (member_id, month_start);
create index distances_room_slice_idx on distances (room_id, variant_id, limit_id, month_start);

comment on table distance_entry_kinds is
  'How a distance row was entered. primary is the default dump. More kinds can be added as rows.';

comment on table distances is
  'Hands per member, room, month, nitro/regular, limit. entry_kind and part default to primary / 1. Not cabinet limits.';

comment on column distances.month_start is
  'First day of the calendar month from the dump. Not the CET slot month.';

comment on column distances.entry_kind is
  'primary is the main dump. correction is an overlay. Totals sum every kind.';

comment on column distances.part is
  'Month section. 1 is the whole month. 2+ if accounting rules change mid-month.';

create or replace function distances_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger distances_touch
  before update on distances
  for each row execute function distances_touch();

alter table distance_entry_kinds enable row level security;
alter table distances enable row level security;

grant select, insert, update, delete on distance_entry_kinds to authenticated;
grant select, insert, update, delete on distances to authenticated;
revoke all on distance_entry_kinds from anon;
revoke all on distances from anon;

create policy distance_entry_kinds_read on distance_entry_kinds
  for select to authenticated
  using (true);

create policy distance_entry_kinds_staff on distance_entry_kinds
  for all to authenticated
  using (is_staff())
  with check (is_staff());

create policy distances_read on distances
  for select to authenticated
  using (true);

create policy distances_insert on distances
  for insert to authenticated
  with check (is_staff());

create policy distances_update on distances
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create policy distances_delete on distances
  for delete to authenticated
  using (is_staff());
