-- Wallets for payout. Owner and staff only. Several per member, one primary.

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  title text not null default '',
  details text not null default '',
  comment text not null default '',
  is_primary boolean not null default false,
  sort_n integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_methods_member_idx on payment_methods (member_id, sort_n);

comment on table payment_methods is
  'Payout wallets. Several per member, one primary. Owner and staff only.';

alter table payment_methods enable row level security;

grant select, insert, update, delete on payment_methods to authenticated;
revoke all on payment_methods from anon;

create policy payment_methods_select on payment_methods
  for select to authenticated
  using (member_id = current_member_id() or is_staff());

create policy payment_methods_insert on payment_methods
  for insert to authenticated
  with check (member_id = current_member_id() or is_staff());

create policy payment_methods_update on payment_methods
  for update to authenticated
  using (member_id = current_member_id() or is_staff())
  with check (member_id = current_member_id() or is_staff());

create policy payment_methods_delete on payment_methods
  for delete to authenticated
  using (member_id = current_member_id() or is_staff());

create or replace function payment_methods_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.is_primary then
    update payment_methods
      set is_primary = false
      where member_id = new.member_id
        and id is distinct from new.id
        and is_primary;
  end if;
  return new;
end;
$$;

create trigger payment_methods_touch
  before insert or update on payment_methods
  for each row execute function payment_methods_touch();
