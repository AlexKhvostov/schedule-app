-- Given name is the public part of the profile. Other profile columns stay self/staff.

create or replace function public_display_names(p_ids uuid[])
returns table (member_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.member_id, p.display_name
  from profiles p
  where p.member_id = any (p_ids)
    and p.display_name is not null
    and length(trim(p.display_name)) > 0;
$$;

comment on function public_display_names(uuid[]) is
  'Public given names only. Phone, Telegram and the rest stay on profiles.';

revoke all on function public_display_names(uuid[]) from public, anon;
grant execute on function public_display_names(uuid[]) to authenticated;
