-- First Discord login for a person the admin already opened was dying with:
-- 500 Database error saving new user / column reference "provider" is ambiguous
-- The trigger variable `provider` clashed with identities.provider.

create or replace function on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  uname text;
  auth_provider text;
  uid text;
begin
  uname := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'custom_claims',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'user'
  );
  auth_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'discord');
  if auth_provider not in ('discord', 'google', 'email') then
    auth_provider := 'discord';
  end if;
  uid := coalesce(
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'sub',
    new.id::text
  );

  select i.member_id into mid
  from identities i
  where i.provider = auth_provider
    and i.provider_uid = uid;

  if mid is not null then
    update members
    set auth_user_id = new.id
    where id = mid
      and auth_user_id is null;
    update identities
    set username = coalesce(
          new.raw_user_meta_data ->> 'user_name',
          new.raw_user_meta_data ->> 'preferred_username',
          username
        ),
        display_name = coalesce(uname, display_name),
        avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url),
        raw = coalesce(new.raw_user_meta_data, raw),
        updated_at = now()
    where member_id = mid
      and identities.provider = auth_provider;
    update profiles
    set email = coalesce(email, new.email)
    where member_id = mid;
    return new;
  end if;

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
    auth_provider,
    uid,
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
