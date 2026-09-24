create or replace function current_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(member_has_permission(current_member_id(), p_permission), false);
$$;

drop policy if exists profiles_read_private on profiles;
create policy profiles_read_private on profiles
  for select to authenticated
  using (
    (member_id = current_member_id() and current_has_permission('profile'))
    or current_has_permission('admin.people')
  );

drop policy if exists profiles_self_write on profiles;
create policy profiles_self_write on profiles
  for update to authenticated
  using (member_id = current_member_id() and current_has_permission('profile'))
  with check (member_id = current_member_id() and current_has_permission('profile'));

drop policy if exists catalog_read_kinds on schedule_kinds;
create policy catalog_read_kinds on schedule_kinds
  for select to authenticated
  using (current_has_permission('schedule') or current_has_permission('schedule.manage'));

drop policy if exists catalog_read_flags on capacity_flags;
create policy catalog_read_flags on capacity_flags
  for select to authenticated
  using (current_has_permission('schedule') or current_has_permission('schedule.manage'));

drop policy if exists catalog_read_rules on capacity_rules;
create policy catalog_read_rules on capacity_rules
  for select to authenticated
  using (current_has_permission('schedule') or current_has_permission('schedule.manage'));

drop policy if exists capacity_staff_flags on capacity_flags;
create policy capacity_staff_flags on capacity_flags
  for all to authenticated
  using (current_has_permission('schedule.manage'))
  with check (current_has_permission('schedule.manage'));

drop policy if exists capacity_staff_rules on capacity_rules;
create policy capacity_staff_rules on capacity_rules
  for all to authenticated
  using (current_has_permission('schedule.manage'))
  with check (current_has_permission('schedule.manage'));

drop policy if exists occupancy_read on occupancy;
create policy occupancy_read on occupancy
  for select to authenticated
  using (current_has_permission('schedule') or current_has_permission('schedule.manage'));

drop policy if exists occupancy_insert_own on occupancy;
create policy occupancy_insert_own on occupancy
  for insert to authenticated
  with check (
    member_id = current_member_id()
    and current_has_permission('schedule')
  );

drop policy if exists occupancy_delete_own on occupancy;
create policy occupancy_delete_own on occupancy
  for delete to authenticated
  using (
    (member_id = current_member_id() and current_has_permission('schedule'))
    or current_has_permission('schedule.manage')
  );

drop policy if exists distance_entry_kinds_read on distance_entry_kinds;
create policy distance_entry_kinds_read on distance_entry_kinds
  for select to authenticated
  using (current_has_permission('distances'));

drop policy if exists distance_entry_kinds_staff on distance_entry_kinds;
create policy distance_entry_kinds_staff on distance_entry_kinds
  for all to authenticated
  using (current_has_permission('distances'))
  with check (current_has_permission('distances'));

drop policy if exists distances_read on distances;
create policy distances_read on distances
  for select to authenticated
  using (current_has_permission('distances'));

drop policy if exists distances_insert on distances;
create policy distances_insert on distances
  for insert to authenticated
  with check (current_has_permission('distances'));

drop policy if exists distances_update on distances;
create policy distances_update on distances
  for update to authenticated
  using (current_has_permission('distances'))
  with check (current_has_permission('distances'));

drop policy if exists distances_delete on distances;
create policy distances_delete on distances
  for delete to authenticated
  using (current_has_permission('distances'));
