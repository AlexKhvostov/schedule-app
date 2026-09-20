-- Admin grants club access from the Discord snapshot.
-- Do not create a schedule card for everyone on the server — only on grant.
-- If the person later signs in, attach the auth user to that card.

drop policy if exists profiles_staff_update on profiles;
create policy profiles_staff_update on profiles
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create or replace function set_discord_access(p_discord_id text, p_access text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  actor uuid;
  snap discord_members%rowtype;
  uname text;
  code text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if p_access not in ('closed', 'member', 'admin') then
    raise exception 'bad-access';
  end if;

  actor := current_member_id();

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;

  if mid is not null and exists (
    select 1 from member_roles where member_id = mid and role_id = 'root'
  ) then
    raise exception 'cannot-change-root';
  end if;

  if p_access = 'closed' and mid is not null and mid = actor then
    raise exception 'cannot-close-self';
  end if;

  if p_access = 'closed' then
    if mid is null then
      return null;
    end if;
    update members
    set access_status = 'blocked',
        approved_at = null
    where id = mid;
    delete from member_roles
    where member_id = mid
      and role_id = 'admin';
    return mid;
  end if;

  if mid is null then
    select * into snap from discord_members where discord_id = p_discord_id;
    if not found or snap.bot then
      raise exception 'unknown-discord';
    end if;
    uname := coalesce(nullif(btrim(snap.guild_nick), ''), nullif(btrim(snap.global_name), ''), snap.username);
    loop
      code := 'RP-' || substr(md5(p_discord_id || clock_timestamp()::text), 1, 6);
      exit when not exists (select 1 from members where public_code = code);
    end loop;

    insert into members (auth_user_id, public_code, access_status, mark_tag, community_status, approved_at)
    values (null, code, 'active', null, 'club', now())
    returning id into mid;

    insert into profiles (member_id, display_name)
    values (mid, uname);

    insert into identities (
      member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw
    ) values (
      mid,
      'discord',
      p_discord_id,
      snap.username,
      snap.global_name,
      snap.guild_nick,
      snap.avatar_url,
      jsonb_build_object('source', 'admin-grant')
    );

    insert into member_roles (member_id, role_id) values (mid, 'member');
  else
    update members
    set access_status = 'active',
        approved_at = coalesce(approved_at, now()),
        community_status = coalesce(community_status, 'club')
    where id = mid;
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
  end if;

  if p_access = 'admin' then
    insert into member_roles (member_id, role_id)
    values (mid, 'admin')
    on conflict do nothing;
  else
    delete from member_roles
    where member_id = mid
      and role_id = 'admin';
  end if;

  return mid;
end;
$$;

revoke all on function set_discord_access(text, text) from public;
grant execute on function set_discord_access(text, text) to authenticated;

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
  uid text;
begin
  uname := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'custom_claims',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'user'
  );
  provider := coalesce(new.raw_app_meta_data ->> 'provider', 'discord');
  if provider not in ('discord', 'google', 'email') then
    provider := 'discord';
  end if;
  uid := coalesce(
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'sub',
    new.id::text
  );

  select i.member_id into mid
  from identities i
  where i.provider = provider
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
      and provider = provider;
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
    provider,
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
