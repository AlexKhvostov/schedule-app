-- A player's cabinet selection is required for new schedule marks.
-- Existing occupancy remains readable and removable after the selection is disabled.

create or replace function enforce_player_limit_on_occupancy_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from schedule_kinds sk
    join players p
      on p.member_id = new.member_id
     and p.room_id = sk.room_id
    join player_limits pl
      on pl.player_id = p.id
     and pl.variant_id = sk.variant_id
     and pl.limit_id = sk.limit_id
    where sk.id = new.kind_id
  ) then
    raise exception 'schedule-player-limit-not-selected' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function enforce_player_limit_on_occupancy_insert() from public, anon, authenticated;

drop trigger if exists occupancy_player_limit_insert on occupancy;
create trigger occupancy_player_limit_insert
before insert on occupancy
for each row execute function enforce_player_limit_on_occupancy_insert();

comment on function enforce_player_limit_on_occupancy_insert() is
  'Reject new occupancy unless the target player selected the schedule room, variant and limit in the cabinet. Deletes remain allowed.';
