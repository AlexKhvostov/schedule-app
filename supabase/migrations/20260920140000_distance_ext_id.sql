-- External id in the hands/distance service. Admin fills it so monthly dumps
-- match our member cards. Not Discord id and not public_code.

alter table members
  add column if not exists distance_ext_id text;

alter table members
  drop constraint if exists members_distance_ext_id_shape;

alter table members
  add constraint members_distance_ext_id_shape
  check (distance_ext_id is null or distance_ext_id ~ '^[0-9]{1,12}$');

create unique index if not exists members_distance_ext_id_uidx
  on members (distance_ext_id)
  where distance_ext_id is not null;

create or replace function members_guard_distance_ext_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.distance_ext_id is distinct from old.distance_ext_id
     and not is_staff() then
    raise exception 'distance-ext-id-staff';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard_distance_ext_id on members;
create trigger members_guard_distance_ext_id
  before update on members
  for each row execute function members_guard_distance_ext_id();
