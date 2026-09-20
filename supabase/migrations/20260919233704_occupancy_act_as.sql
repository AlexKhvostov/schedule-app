-- Staff may place a slot for another active member. placed_by is who clicked,
-- member_id is whose mark it is. The client cannot spoof the actor.

alter table occupancy
  add column if not exists placed_by uuid references members (id) on delete set null;

comment on column occupancy.placed_by is
  'Member who wrote the row (admin acting as someone else). Distinct from member_id, the person on the grid.';

update occupancy
set placed_by = member_id
where placed_by is null;

create or replace function occupancy_stamp_actor()
returns trigger
language plpgsql
as $$
begin
  new.placed_by := current_member_id();
  return new;
end;
$$;

drop trigger if exists occupancy_stamp_actor on occupancy;
create trigger occupancy_stamp_actor
  before insert on occupancy
  for each row execute function occupancy_stamp_actor();

drop policy if exists occupancy_insert_own on occupancy;
create policy occupancy_insert_own on occupancy
  for insert to authenticated
  with check (
    exists (
      select 1 from members actor
      where actor.id = current_member_id()
        and actor.access_status = 'active'
    )
    and exists (
      select 1 from members target
      where target.id = member_id
        and target.access_status = 'active'
    )
    and (
      member_id = current_member_id()
      or is_staff()
    )
  );
