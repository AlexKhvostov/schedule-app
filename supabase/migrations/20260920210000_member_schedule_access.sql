-- Admin grants which schedule kinds a member may mark.
-- Separate from player_limits (what they say they play in the cabinet).
-- Existing players keep painting: copy current cabinet limits into access.

create table member_schedule_access (
  member_id uuid not null references members (id) on delete cascade,
  variant_id text not null references variants (id),
  limit_id text not null references limits (id),
  primary key (member_id, variant_id, limit_id)
);

comment on table member_schedule_access is
  'Staff-granted mark access per variant and buy-in. Cabinet limits are a different table.';

create index member_schedule_access_member on member_schedule_access (member_id);

alter table member_schedule_access enable row level security;
grant select, insert, update, delete on member_schedule_access to authenticated;
revoke all on member_schedule_access from anon;

create policy member_schedule_access_read on member_schedule_access
  for select to authenticated
  using (member_id = current_member_id() or is_staff());

create policy member_schedule_access_insert on member_schedule_access
  for insert to authenticated
  with check (is_staff());

create policy member_schedule_access_update on member_schedule_access
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create policy member_schedule_access_delete on member_schedule_access
  for delete to authenticated
  using (is_staff());

insert into member_schedule_access (member_id, variant_id, limit_id)
select p.member_id, pl.variant_id, pl.limit_id
from player_limits pl
join players p on p.id = pl.player_id
on conflict do nothing;

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
  if not exists (
    select 1
    from schedule_kinds k
    join member_schedule_access a
      on a.member_id = new.member_id
     and a.variant_id = k.variant_id
     and a.limit_id = k.limit_id
    where k.id = new.kind_id
  ) then
    raise exception 'no schedule access';
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

-- New members get a Winamax player row, not a default 50 buy-in.
create or replace function ensure_default_winamax_play(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  if p_member is null then
    return;
  end if;

  select id into rid from rooms where slug = 'winamax';
  if rid is null then
    return;
  end if;

  insert into players (member_id, room_id)
  values (p_member, rid)
  on conflict (member_id, room_id) do nothing;
end;
$$;
