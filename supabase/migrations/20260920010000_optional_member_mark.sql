-- Grid mark is optional. Do not invent letters on signup.

alter table members
  alter column mark_tag drop not null;

drop index if exists members_mark_tag_lower;

create unique index members_mark_tag_lower
  on members (lower(mark_tag))
  where mark_tag is not null;

create or replace function normalize_mark_tag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mark_tag is not null then
    new.mark_tag := nullif(btrim(new.mark_tag), '');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_mark_tag on members;
create trigger normalize_mark_tag
  before insert or update on members
  for each row execute function normalize_mark_tag();

create or replace function on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  uname text;
  provider text;
begin
  uname := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'custom_claims',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'user'
  );
  provider := coalesce(new.raw_app_meta_data ->> 'provider', 'discord');

  insert into members (auth_user_id, public_code, access_status, mark_tag, community_status)
  values (
    new.id,
    'RP-' || substr(replace(new.id::text, '-', ''), 1, 6),
    'pending',
    null,
    'school'
  )
  returning id into mid;

  insert into profiles (member_id, display_name, email)
  values (mid, uname, new.email);

  insert into identities (member_id, provider, provider_uid, username, display_name, avatar_url, raw)
  values (
    mid,
    case when provider in ('discord', 'google', 'email') then provider else 'discord' end,
    coalesce(
      new.raw_user_meta_data ->> 'provider_id',
      new.raw_user_meta_data ->> 'sub',
      new.id::text
    ),
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      uname
    ),
    uname,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );

  insert into member_roles (member_id, role_id) values (mid, 'member');
  return new;
end;
$$;
