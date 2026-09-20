-- Who vouched for this member. Staff picks another club member. Not shown in the cabinet.

alter table members
  add column if not exists guarantor_id uuid references members (id) on delete set null;

alter table members
  drop constraint if exists members_guarantor_not_self;

alter table members
  add constraint members_guarantor_not_self
  check (guarantor_id is null or guarantor_id <> id);

create index if not exists members_guarantor_id_idx
  on members (guarantor_id)
  where guarantor_id is not null;

create or replace function members_guard_guarantor()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.guarantor_id is distinct from old.guarantor_id
     and not is_staff() then
    raise exception 'guarantor-staff';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard_guarantor on members;
create trigger members_guard_guarantor
  before update on members
  for each row execute function members_guard_guarantor();
