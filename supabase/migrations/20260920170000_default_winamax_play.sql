-- Fill list is cabinet limits, not occupancy.
-- New active members get the same default as an empty cabinet: Winamax Nitro 50.
-- If the person already chose limits, we do not add 50.

create or replace function ensure_default_winamax_play(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  pid uuid;
begin
  if p_member is null then
    return;
  end if;

  select id into rid from rooms where slug = 'winamax';
  if rid is null then
    return;
  end if;

  select id into pid from players where member_id = p_member and room_id = rid;
  if pid is null then
    insert into players (member_id, room_id)
    values (p_member, rid)
    returning id into pid;
  end if;

  if exists (select 1 from player_limits where player_id = pid) then
    return;
  end if;

  insert into player_limits (player_id, variant_id, limit_id)
  values (pid, 'nitro', '50')
  on conflict do nothing;
end;
$$;

revoke all on function ensure_default_winamax_play(uuid) from public;

create or replace function members_default_play()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access_status = 'active' then
    perform ensure_default_winamax_play(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists members_default_play on members;
create trigger members_default_play
  after insert or update of access_status on members
  for each row execute function members_default_play();

select ensure_default_winamax_play(id)
from members
where access_status = 'active';
