-- Linking an approved card is not self-registration. Resolve ownership from
-- Auth identities, never from editable JWT user_metadata.
create or replace function public.self_create_profile()
returns uuid
language plpgsql
security definer
-- Existing member triggers call public helpers without qualification.
-- Keep public before pg_temp while qualifying this function's relations.
set search_path = public, pg_temp
as $$
declare
  mid uuid;
  linked_auth uuid;
  uid text;
  identity_count integer;
  snap public.discord_members%rowtype;
  required_role text;
  allow_self boolean;
  code text;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  -- Serialize concurrent first-load attempts for the same verified account.
  perform 1 from auth.users where id = auth.uid() for update;
  if not found then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  select id into mid from public.members where auth_user_id = auth.uid();
  if mid is not null then return mid; end if;

  select count(*), min(provider_id) into identity_count, uid
  from auth.identities where user_id = auth.uid() and provider = 'discord';
  if identity_count <> 1 or nullif(uid, '') is null then
    raise exception 'discord-identity-required' using errcode = '42501';
  end if;

  select self_create_card, required_discord_role_id
  into allow_self, required_role from public.club_settings where id;
  select * into snap from public.discord_members where discord_id = uid and present;

  select m.id, m.auth_user_id into mid, linked_auth
  from public.identities i join public.members m on m.id = i.member_id
  where i.provider = 'discord' and i.provider_uid = uid
  for update of m;
  if mid is not null then
    if linked_auth is not null and linked_auth <> auth.uid() then
      raise exception 'profile-already-linked' using errcode = '42501';
    end if;
    -- Preserve active/blocked/pending and every role. Ownership alone never
    -- restores a blocked card; the normal access gate handles its status.
    update public.members set auth_user_id = auth.uid() where id = mid;
    return mid;
  end if;

  if not coalesce(allow_self, false) then
    raise exception 'self-create-disabled' using errcode = '42501';
  end if;
  if snap.discord_id is null or not exists (
    select 1 from jsonb_array_elements(snap.roles) r
    where r ->> 'id' = required_role
  ) then
    raise exception 'redparty-required' using errcode = '42501';
  end if;

  loop
    code := 'RP-' || substr(md5(auth.uid()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.members where public_code = code);
  end loop;
  uname := coalesce(snap.guild_nick, snap.global_name, snap.username);
  insert into public.members (
    auth_user_id, public_code, access_status, approved_at,
    mark_tag, community_status, block_reason, blocked_at
  ) values (auth.uid(), code, 'active', now(), null, 'club', null, null)
  returning id into mid;
  insert into public.profiles (member_id, display_name) values (mid, uname);
  insert into public.identities (
    member_id, provider, provider_uid, username, display_name, guild_nick,
    avatar_url, raw, guild_present, guild_left_at, discord_roles
  ) values (
    mid, 'discord', uid, snap.username, snap.global_name, snap.guild_nick,
    snap.avatar_url, jsonb_build_object('source', 'self-create'), true, null, snap.roles
  );
  perform public.ensure_default_winamax_play(mid);
  return mid;
end;
$$;
revoke all on function public.self_create_profile() from public, anon;
grant execute on function public.self_create_profile() to authenticated;
