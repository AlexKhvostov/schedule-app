-- Apply a definitive check for one Discord guild member. Errors never call
-- this function; p_present=false is only used for a real Discord 404.

create or replace function apply_discord_member_check(
  p_discord_id text,
  p_present boolean,
  p_member jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz := now();
  required_role text;
begin
  select required_discord_role_id into required_role
  from club_settings where id;

  if not p_present then
    update discord_members
    set present = false,
        left_at = coalesce(left_at, ts)
    where discord_id = p_discord_id;

    update members m
    set access_status = 'blocked',
        block_reason = 'discord_left',
        blocked_at = ts,
        approved_at = null
    from identities i
    where i.member_id = m.id
      and i.provider = 'discord'
      and i.provider_uid = p_discord_id
      and not member_is_root(m.id)
      and m.access_status = 'active';

    update identities
    set guild_present = false,
        guild_left_at = coalesce(guild_left_at, ts)
    where provider = 'discord'
      and provider_uid = p_discord_id;
    return;
  end if;

  if p_member is null or coalesce(p_member ->> 'discord_id', '') <> p_discord_id then
    raise exception 'bad discord member';
  end if;

  insert into discord_members (
    discord_id, username, global_name, guild_nick, avatar_url, bot,
    joined_at, roles, synced_at, present, last_seen_at, left_at
  ) values (
    p_discord_id,
    coalesce(p_member ->> 'username', ''),
    nullif(p_member ->> 'global_name', ''),
    nullif(p_member ->> 'guild_nick', ''),
    nullif(p_member ->> 'avatar_url', ''),
    coalesce((p_member ->> 'bot')::boolean, false),
    nullif(p_member ->> 'joined_at', '')::timestamptz,
    coalesce(p_member -> 'roles', '[]'::jsonb),
    ts,
    true,
    ts,
    null
  )
  on conflict (discord_id) do update set
    username = excluded.username,
    global_name = excluded.global_name,
    guild_nick = excluded.guild_nick,
    avatar_url = excluded.avatar_url,
    bot = excluded.bot,
    joined_at = excluded.joined_at,
    roles = excluded.roles,
    synced_at = excluded.synced_at,
    present = true,
    last_seen_at = excluded.last_seen_at,
    left_at = null;

  update identities i
  set username = d.username,
      display_name = d.global_name,
      guild_nick = d.guild_nick,
      avatar_url = d.avatar_url,
      discord_roles = d.roles,
      guild_present = true,
      guild_left_at = null,
      updated_at = ts
  from discord_members d
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id
    and d.discord_id = p_discord_id;

  update members m
  set access_status = 'blocked',
      block_reason = 'missing_redparty',
      blocked_at = ts,
      approved_at = null
  from identities i
  where i.member_id = m.id
    and i.provider = 'discord'
    and i.provider_uid = p_discord_id
    and not member_is_root(m.id)
    and m.access_status = 'active'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_member -> 'roles', '[]'::jsonb)) r
      where r ->> 'id' = required_role
    );
end;
$$;

revoke all on function apply_discord_member_check(text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function apply_discord_member_check(text, boolean, jsonb)
  to service_role;

create or replace function submit_join_request()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  uid text;
  req_kind text;
  rid uuid;
  snap discord_members%rowtype;
  required_role text;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;

  select id into mid from members where auth_user_id = auth.uid();
  select required_discord_role_id into required_role from club_settings where id;

  if mid is not null then
    select i.provider_uid into uid
    from identities i
    where i.member_id = mid and i.provider = 'discord'
    limit 1;
    if not exists (
      select 1 from members m
      where m.id = mid
        and m.access_status = 'blocked'
        and m.block_reason in ('discord_left', 'missing_redparty')
    ) then
      raise exception 'already-member';
    end if;
    req_kind := 'restore';
  else
    uid := coalesce(
      auth.jwt() -> 'user_metadata' ->> 'provider_id',
      auth.jwt() -> 'user_metadata' ->> 'sub',
      auth.jwt() -> 'identities' -> 0 ->> 'id'
    );
    req_kind := 'join';
  end if;

  select * into snap
  from discord_members
  where discord_id = uid and present;

  if snap.discord_id is null or not exists (
    select 1 from jsonb_array_elements(snap.roles) r
    where r ->> 'id' = required_role
  ) then
    raise exception 'redparty-required' using errcode = '42501';
  end if;

  select id into rid
  from club_join_requests
  where discord_id = uid
    and kind = req_kind
    and status in ('open', 'dismissed')
  order by created_at desc
  limit 1;
  if rid is not null then
    return rid;
  end if;

  uname := coalesce(snap.guild_nick, snap.global_name, snap.username);
  insert into club_join_requests (
    kind, discord_id, member_id, auth_user_id, username, display_name, avatar_url
  ) values (
    req_kind, uid, mid, auth.uid(), snap.username, uname, snap.avatar_url
  )
  returning id into rid;
  return rid;
end;
$$;

create or replace function reopen_join_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  update club_join_requests
  set status = 'open',
      resolved_at = null,
      resolved_by = null
  where id = p_id and status = 'dismissed';
end;
$$;

revoke all on function reopen_join_request(uuid) from public;
grant execute on function reopen_join_request(uuid) to authenticated;
