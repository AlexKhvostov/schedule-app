-- Telegram + backup contact on the profile. Full card is self/staff only.
-- Everyone may still read the public name.

alter table profiles
  add column if not exists telegram text;

alter table profiles
  add column if not exists contact_alt text;

comment on column profiles.telegram is
  'Telegram handle or t.me link. Visible to self and staff only.';

comment on column profiles.contact_alt is
  'Backup way to reach the person. Visible to self and staff only.';

comment on column profiles.display_name is
  'Given name. The public part of the profile; the rest of the card is private.';

drop policy if exists profiles_read on profiles;

create policy profiles_read_private on profiles
  for select to authenticated
  using (member_id = current_member_id() or is_staff());

create or replace view profiles_public as
  select member_id, display_name
  from profiles;

comment on view profiles_public is
  'Public name only. Phone, Telegram, city and the rest stay on profiles.';

grant select on profiles_public to authenticated;
revoke insert, update, delete on profiles_public from anon, authenticated;
