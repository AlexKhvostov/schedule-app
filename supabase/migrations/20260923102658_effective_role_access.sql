insert into app_permissions (code, title, section, sort)
values ('schedule.manage', 'Управление расписанием', 'admin', 45)
on conflict (code) do update set title = excluded.title, section = excluded.section, sort = excluded.sort;

insert into discord_role_permissions (role_id, permission_code)
values ('1208019567251820604', 'schedule.manage')
on conflict do nothing;

create or replace function member_access_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, access_status, block_reason
    from members
    where auth_user_id = auth.uid()
  ),
  perms as (
    select coalesce(jsonb_agg(p.code order by p.code), '[]'::jsonb) value
    from app_permissions p, me
    where member_has_permission(me.id, p.code)
  )
  select jsonb_build_object(
    'memberId', me.id,
    'isRoot', member_is_root(me.id),
    'accessStatus', me.access_status,
    'blockReason', me.block_reason,
    'hasRequiredRole', member_has_required_discord_role(me.id),
    'permissions', perms.value
  )
  from me, perms;
$$;

revoke all on function member_access_context() from public, anon;
grant execute on function member_access_context() to authenticated;

create or replace function effective_schedule_access(p_member_ids uuid[])
returns table (member_id uuid, variant_id text, limit_id text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, v.id, l.id
  from members m
  cross join variants v
  cross join limits l
  where m.id = any(p_member_ids)
    and (
      m.id = current_member_id()
      or member_has_permission(current_member_id(), 'admin.people')
    )
    and member_has_schedule_limit(m.id, v.id, l.id);
$$;

revoke all on function effective_schedule_access(uuid[]) from public, anon;
grant execute on function effective_schedule_access(uuid[]) to authenticated;

create or replace function self_create_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  uid text;
  snap discord_members%rowtype;
  required_role text;
  allow_self boolean;
  code text;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  select id into mid from members where auth_user_id = auth.uid();
  if mid is not null then return mid; end if;

  select self_create_card, required_discord_role_id
  into allow_self, required_role from club_settings where id;
  if not coalesce(allow_self, false) then
    raise exception 'self-create-disabled' using errcode = '42501';
  end if;

  uid := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub',
    auth.jwt() -> 'identities' -> 0 ->> 'id'
  );
  select * into snap from discord_members where discord_id = uid and present;
  if snap.discord_id is null or not exists (
    select 1 from jsonb_array_elements(snap.roles) r
    where r ->> 'id' = required_role
  ) then
    raise exception 'redparty-required' using errcode = '42501';
  end if;

  select i.member_id into mid
  from identities i where i.provider = 'discord' and i.provider_uid = uid;
  if mid is not null then
    update members set auth_user_id = auth.uid()
    where id = mid and auth_user_id is null;
    return mid;
  end if;

  loop
    code := 'RP-' || substr(md5(auth.uid()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from members where public_code = code);
  end loop;
  uname := coalesce(snap.guild_nick, snap.global_name, snap.username);

  insert into members (
    auth_user_id, public_code, access_status, approved_at,
    mark_tag, community_status, block_reason, blocked_at
  ) values (
    auth.uid(), code, 'active', now(), null, 'club', null, null
  ) returning id into mid;

  insert into profiles (member_id, display_name)
  values (mid, uname);

  insert into identities (
    member_id, provider, provider_uid, username, display_name, guild_nick,
    avatar_url, raw, guild_present, guild_left_at, discord_roles
  ) values (
    mid, 'discord', uid, snap.username, snap.global_name, snap.guild_nick,
    snap.avatar_url, jsonb_build_object('source', 'self-create'),
    true, null, snap.roles
  );

  update members m set distance_ext_id = d.distance_ext_id
  from discord_distance_ids d
  where m.id = mid and d.discord_id = uid and m.distance_ext_id is null;
  perform ensure_default_winamax_play(mid);
  return mid;
end;
$$;

revoke all on function self_create_profile() from public, anon;
grant execute on function self_create_profile() to authenticated;

create or replace function restore_club_card(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  required_role text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if member_is_root(p_member_id) then
    return p_member_id;
  end if;
  select required_discord_role_id into required_role from club_settings where id;
  if not exists (
    select 1
    from identities i
    join discord_members d on d.discord_id = i.provider_uid and d.present
    where i.member_id = p_member_id
      and i.provider = 'discord'
      and exists (
        select 1 from jsonb_array_elements(d.roles) r
        where r ->> 'id' = required_role
      )
  ) then
    raise exception 'redparty-required' using errcode = '42501';
  end if;

  update members
  set access_status = 'active',
      approved_at = coalesce(approved_at, now()),
      block_reason = null,
      blocked_at = null,
      access_before_leave = null
  where id = p_member_id;

  update club_join_requests
  set status = 'done', resolved_at = now(), resolved_by = current_member_id()
  where member_id = p_member_id and kind = 'restore' and status = 'open';
  return p_member_id;
end;
$$;

create or replace function block_club_profile(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if member_is_root(p_member_id) or p_member_id = current_member_id() then
    raise exception 'cannot-block';
  end if;
  update members
  set access_status = 'blocked',
      approved_at = null,
      block_reason = 'manual',
      blocked_at = now()
  where id = p_member_id;
end;
$$;

revoke all on function block_club_profile(uuid) from public;
grant execute on function block_club_profile(uuid) to authenticated;

create or replace function approve_club_profile(p_discord_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  select member_id into mid
  from identities where provider = 'discord' and provider_uid = p_discord_id;
  if mid is null then
    mid := create_club_card(p_discord_id);
  end if;
  if member_has_required_discord_role(mid) then
    perform restore_club_card(mid);
  end if;
  return mid;
end;
$$;

revoke all on function approve_club_profile(text) from public;
grant execute on function approve_club_profile(text) to authenticated;

create or replace function create_redparty_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row record;
  required_role text;
  made integer := 0;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  select required_discord_role_id into required_role from club_settings where id;
  for row in
    select d.discord_id
    from discord_members d
    where d.present and not d.bot
      and exists (
        select 1 from jsonb_array_elements(d.roles) r
        where r ->> 'id' = required_role
      )
      and not exists (
        select 1 from identities i
        where i.provider = 'discord' and i.provider_uid = d.discord_id
      )
  loop
    perform approve_club_profile(row.discord_id);
    made := made + 1;
  end loop;
  return made;
end;
$$;

revoke all on function create_redparty_profiles() from public;
grant execute on function create_redparty_profiles() to authenticated;

create or replace function occupancy_guard()
returns trigger
language plpgsql
as $$
declare
  caps smallint[];
  open_levels integer;
  kind_row schedule_kinds%rowtype;
begin
  if exists (
    select 1 from members
    where id = new.member_id and access_status <> 'active'
  ) then
    raise exception 'member is not active';
  end if;
  select * into kind_row from schedule_kinds where id = new.kind_id;
  if kind_row.id is null or not member_has_schedule_limit(
    new.member_id, kind_row.variant_id, kind_row.limit_id
  ) then
    raise exception 'no schedule access';
  end if;
  if new.tables is null then
    select tables into new.tables from members where id = new.member_id;
  end if;
  new.tables := least(30, greatest(1, coalesce(new.tables, 1)));
  caps := hours_of(new.kind_id, new.slot_date);
  open_levels := caps[(new.half / 2) + 1];
  if new.level >= open_levels then
    raise exception 'level is locked';
  end if;
  return new;
end;
$$;

create or replace function is_root()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(member_is_root(current_member_id()), false);
$$;

-- Auth only links an existing profile. Profile creation happens after a
-- successful targeted Discord check, never inside the auth trigger.
create or replace function on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  auth_provider text;
  uid text;
begin
  auth_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'discord');
  uid := coalesce(
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'sub',
    new.id::text
  );
  select i.member_id into mid
  from identities i
  where i.provider = auth_provider and i.provider_uid = uid;
  if mid is not null then
    update members set auth_user_id = new.id
    where id = mid and auth_user_id is null;
    update identities
    set raw = coalesce(new.raw_user_meta_data, raw),
        updated_at = now()
    where member_id = mid and provider = auth_provider;
    update profiles set email = coalesce(email, new.email) where member_id = mid;
  end if;
  return new;
end;
$$;
