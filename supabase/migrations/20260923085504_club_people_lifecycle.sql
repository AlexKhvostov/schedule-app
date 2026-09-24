-- Club people live on members cards. Discord snapshot is a volatile cache.
-- Refresh may update Discord nicks/roles on a card, never delete the card.

create table club_settings (
  id boolean primary key default true check (id),
  self_create_card boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references members (id) on delete set null
);

comment on table club_settings is
  'One row. Club-wide people rules, not the schedule grid.';
comment on column club_settings.self_create_card is
  'When true, a Discord login without a card creates a pending card (own profile only). When false, the person sends a join request.';

insert into club_settings (id, self_create_card) values (true, false);

alter table club_settings enable row level security;
grant select on club_settings to authenticated;
grant update on club_settings to authenticated;
revoke insert, delete on club_settings from anon, authenticated;

create policy club_settings_read on club_settings
  for select to authenticated using (true);
create policy club_settings_update on club_settings
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create or replace function club_settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := current_member_id();
  return new;
end;
$$;

create trigger club_settings_stamp
  before update on club_settings
  for each row execute function club_settings_stamp();

alter table identities
  add column if not exists guild_present boolean not null default true,
  add column if not exists guild_left_at timestamptz,
  add column if not exists discord_roles jsonb not null default '[]'::jsonb;

comment on column identities.guild_present is
  'True while this Discord id is in the latest server snapshot. Last nick/roles stay even when false.';

alter table members
  add column if not exists access_before_leave text
  check (access_before_leave is null or access_before_leave in ('member', 'admin', 'staff'));

create table club_join_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('join', 'restore')),
  discord_id text not null,
  member_id uuid references members (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  username text,
  display_name text,
  avatar_url text,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members (id) on delete set null
);

create unique index club_join_requests_open_join
  on club_join_requests (discord_id)
  where status = 'open' and kind = 'join';
create unique index club_join_requests_open_restore
  on club_join_requests (member_id)
  where status = 'open' and kind = 'restore' and member_id is not null;

alter table club_join_requests enable row level security;
grant select, insert, update on club_join_requests to authenticated;
revoke insert, update, delete on club_join_requests from anon;

create policy club_join_requests_read on club_join_requests
  for select to authenticated
  using (is_staff() or auth_user_id = auth.uid());

create policy club_join_requests_staff on club_join_requests
  for all to authenticated
  using (is_staff())
  with check (is_staff());

alter publication supabase_realtime add table club_settings;
alter publication supabase_realtime add table club_join_requests;

update identities i
set
  username = coalesce(nullif(d.username, ''), i.username),
  display_name = coalesce(d.global_name, i.display_name),
  guild_nick = coalesce(d.guild_nick, i.guild_nick),
  avatar_url = coalesce(d.avatar_url, i.avatar_url),
  discord_roles = coalesce(d.roles, i.discord_roles),
  guild_present = true,
  guild_left_at = null
from discord_members d
where i.provider = 'discord'
  and i.provider_uid = d.discord_id;

update identities i
set
  guild_present = false,
  guild_left_at = coalesce(i.guild_left_at, now())
where i.provider = 'discord'
  and not exists (
    select 1 from discord_members d where d.discord_id = i.provider_uid
  );

create or replace function club_access_of(p_member uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when exists (select 1 from member_roles r where r.member_id = p_member and r.role_id = 'admin') then 'admin'
    when exists (select 1 from member_roles r where r.member_id = p_member and r.role_id = 'member') then 'member'
    when exists (select 1 from member_roles r where r.member_id = p_member and r.role_id = 'staff') then 'staff'
    else 'closed'
  end;
$$;

create or replace function replace_discord_roster(p_guild jsonb, p_members jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz := now();
begin
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'empty discord roster';
  end if;

  insert into discord_guild (id, name, icon_url, member_count, online_count, synced_at)
  values (
    p_guild ->> 'id',
    coalesce(p_guild ->> 'name', 'Discord'),
    nullif(p_guild ->> 'icon_url', ''),
    nullif(p_guild ->> 'member_count', '')::integer,
    nullif(p_guild ->> 'online_count', '')::integer,
    ts
  )
  on conflict (id) do update set
    name = excluded.name,
    icon_url = excluded.icon_url,
    member_count = excluded.member_count,
    online_count = excluded.online_count,
    synced_at = excluded.synced_at;

  insert into discord_members (
    discord_id, username, global_name, guild_nick, avatar_url, bot, joined_at, roles, synced_at
  )
  select
    m ->> 'discord_id',
    coalesce(m ->> 'username', ''),
    nullif(m ->> 'global_name', ''),
    nullif(m ->> 'guild_nick', ''),
    nullif(m ->> 'avatar_url', ''),
    coalesce((m ->> 'bot')::boolean, false),
    nullif(m ->> 'joined_at', '')::timestamptz,
    coalesce(m -> 'roles', '[]'::jsonb),
    ts
  from jsonb_array_elements(p_members) as m
  where coalesce(m ->> 'discord_id', '') <> ''
  on conflict (discord_id) do update set
    username = excluded.username,
    global_name = excluded.global_name,
    guild_nick = excluded.guild_nick,
    avatar_url = excluded.avatar_url,
    bot = excluded.bot,
    joined_at = excluded.joined_at,
    roles = excluded.roles,
    synced_at = excluded.synced_at;

  delete from discord_members where synced_at < ts;

  insert into club_join_requests (kind, discord_id, member_id, username, display_name, avatar_url)
  select
    'restore',
    i.provider_uid,
    i.member_id,
    i.username,
    coalesce(i.guild_nick, i.display_name, i.username),
    i.avatar_url
  from identities i
  where i.provider = 'discord'
    and i.guild_present = false
    and exists (select 1 from discord_members d where d.discord_id = i.provider_uid)
  on conflict do nothing;

  update identities i
  set
    username = coalesce(nullif(d.username, ''), i.username),
    display_name = coalesce(d.global_name, i.display_name),
    guild_nick = coalesce(d.guild_nick, i.guild_nick),
    avatar_url = coalesce(d.avatar_url, i.avatar_url),
    discord_roles = coalesce(d.roles, i.discord_roles),
    guild_present = true,
    guild_left_at = null
  from discord_members d
  where i.provider = 'discord'
    and i.provider_uid = d.discord_id;

  update members m
  set
    access_before_leave = coalesce(m.access_before_leave, nullif(club_access_of(m.id), 'closed')),
    access_status = 'blocked'
  from identities i
  where i.member_id = m.id
    and i.provider = 'discord'
    and i.guild_present = true
    and not exists (select 1 from discord_members d where d.discord_id = i.provider_uid)
    and m.access_status = 'active'
    and not exists (
      select 1 from member_roles r where r.member_id = m.id and r.role_id = 'root'
    );

  update identities i
  set
    guild_present = false,
    guild_left_at = coalesce(i.guild_left_at, ts)
  where i.provider = 'discord'
    and not exists (select 1 from discord_members d where d.discord_id = i.provider_uid);
end;
$$;

revoke all on function replace_discord_roster(jsonb, jsonb) from public, anon, authenticated;
grant execute on function replace_discord_roster(jsonb, jsonb) to service_role;

create or replace function create_club_card(p_discord_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  snap discord_members%rowtype;
  req club_join_requests%rowtype;
  uname text;
  code text;
  dist text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;
  if mid is not null then
    return mid;
  end if;

  select * into snap from discord_members where discord_id = p_discord_id;
  select * into req
  from club_join_requests
  where discord_id = p_discord_id
    and kind = 'join'
  order by created_at desc
  limit 1;

  if snap.discord_id is not null and snap.bot then
    raise exception 'unknown-discord';
  end if;
  if snap.discord_id is null and req.id is null then
    raise exception 'unknown-discord';
  end if;

  uname := coalesce(
    nullif(btrim(snap.guild_nick), ''),
    nullif(btrim(snap.global_name), ''),
    nullif(btrim(req.display_name), ''),
    nullif(btrim(snap.username), ''),
    nullif(btrim(req.username), ''),
    'user'
  );
  loop
    code := 'RP-' || substr(md5(p_discord_id || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from members where public_code = code);
  end loop;

  insert into members (auth_user_id, public_code, access_status, mark_tag, community_status, approved_at)
  values (req.auth_user_id, code, 'blocked', null, 'club', null)
  returning id into mid;

  insert into profiles (member_id, display_name)
  values (mid, uname);

  insert into identities (
    member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw,
    guild_present, guild_left_at, discord_roles
  ) values (
    mid,
    'discord',
    p_discord_id,
    coalesce(snap.username, req.username),
    coalesce(snap.global_name, req.display_name),
    snap.guild_nick,
    coalesce(snap.avatar_url, req.avatar_url),
    jsonb_build_object('source', 'admin-card'),
    snap.discord_id is not null,
    case when snap.discord_id is null then now() else null end,
    coalesce(snap.roles, '[]'::jsonb)
  );

  select d.distance_ext_id into dist
  from discord_distance_ids d
  where d.discord_id = p_discord_id;
  if dist is not null then
    update members set distance_ext_id = dist where id = mid and distance_ext_id is null;
  end if;

  update club_join_requests
  set status = 'done', resolved_at = now(), resolved_by = current_member_id(), member_id = mid
  where discord_id = p_discord_id
    and status = 'open';

  return mid;
end;
$$;

revoke all on function create_club_card(text) from public;
grant execute on function create_club_card(text) to authenticated;

create or replace function restore_club_card(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prev text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'unknown-member';
  end if;
  if exists (select 1 from member_roles where member_id = p_member_id and role_id = 'root') then
    raise exception 'cannot-change-root';
  end if;

  select access_before_leave into prev from members where id = p_member_id;
  prev := coalesce(prev, club_access_of(p_member_id));
  if prev is null or prev = 'closed' then
    prev := 'member';
  end if;

  perform set_discord_access(
    (select provider_uid from identities where member_id = p_member_id and provider = 'discord' limit 1),
    prev
  );

  update members
  set access_before_leave = null
  where id = p_member_id;

  update club_join_requests
  set status = 'done', resolved_at = now(), resolved_by = current_member_id()
  where member_id = p_member_id
    and kind = 'restore'
    and status = 'open';

  return p_member_id;
end;
$$;

revoke all on function restore_club_card(uuid) from public;
grant execute on function restore_club_card(uuid) to authenticated;

create or replace function submit_join_request()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  uname text;
  dname text;
  avatar text;
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  if current_member_id() is not null then
    raise exception 'already-member';
  end if;

  uid := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub',
    (select (auth.jwt() -> 'identities' -> 0 ->> 'id'))
  );
  if uid is null or uid = '' then
    uid := auth.uid()::text;
  end if;
  uname := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() -> 'user_metadata' ->> 'preferred_username',
    auth.jwt() -> 'user_metadata' ->> 'name',
    'user'
  );
  dname := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'custom_claims', uname);
  avatar := auth.jwt() -> 'user_metadata' ->> 'avatar_url';

  insert into club_join_requests (kind, discord_id, auth_user_id, username, display_name, avatar_url)
  values ('join', uid, auth.uid(), uname, dname, avatar)
  on conflict do nothing
  returning id into rid;

  if rid is null then
    select id into rid
    from club_join_requests
    where kind = 'join' and status = 'open' and (discord_id = uid or auth_user_id = auth.uid())
    limit 1;
  end if;
  return rid;
end;
$$;

revoke all on function submit_join_request() from public;
grant execute on function submit_join_request() to authenticated;

create or replace function dismiss_join_request(p_id uuid)
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
  set status = 'dismissed', resolved_at = now(), resolved_by = current_member_id()
  where id = p_id
    and status = 'open';
end;
$$;

revoke all on function dismiss_join_request(uuid) from public;
grant execute on function dismiss_join_request(uuid) to authenticated;

create or replace function set_discord_access(p_discord_id text, p_access text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  actor uuid;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if p_access not in ('closed', 'member', 'admin', 'staff') then
    raise exception 'bad-access';
  end if;

  actor := current_member_id();

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;

  if mid is null then
    raise exception 'no-card';
  end if;

  if p_access = 'closed' and exists (
    select 1 from member_roles where member_id = mid and role_id = 'root'
  ) then
    raise exception 'cannot-close-root';
  end if;

  if p_access = 'closed' and mid = actor then
    raise exception 'cannot-close-self';
  end if;

  if p_access = 'closed' then
    update members
    set access_status = 'blocked',
        approved_at = null
    where id = mid;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
    return mid;
  end if;

  update members
  set access_status = 'active',
      approved_at = coalesce(approved_at, now()),
      community_status = coalesce(community_status, 'club'),
      access_before_leave = null
  where id = mid;

  update members m
  set distance_ext_id = d.distance_ext_id
  from discord_distance_ids d
  where m.id = mid
    and d.discord_id = p_discord_id
    and m.distance_ext_id is null;

  if p_access = 'staff' then
    insert into member_roles (member_id, role_id)
    values (mid, 'staff')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('member', 'admin');
  elsif p_access = 'admin' then
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    insert into member_roles (member_id, role_id)
    values (mid, 'admin')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id = 'staff';
  else
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
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
  auth_provider text;
  uid text;
  allow_self boolean;
  snap discord_members%rowtype;
  code text;
  dist text;
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

  select s.self_create_card into allow_self from club_settings s where s.id;
  if not coalesce(allow_self, false) then
    insert into club_join_requests (kind, discord_id, auth_user_id, username, display_name, avatar_url)
    values (
      'join',
      uid,
      new.id,
      coalesce(
        new.raw_user_meta_data ->> 'user_name',
        new.raw_user_meta_data ->> 'preferred_username',
        uname
      ),
      uname,
      new.raw_user_meta_data ->> 'avatar_url'
    )
    on conflict do nothing;
    return new;
  end if;

  select * into snap from discord_members where discord_id = uid;
  loop
    code := 'RP-' || substr(md5(new.id::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from members where public_code = code);
  end loop;

  insert into members (auth_user_id, public_code, access_status, mark_tag, community_status)
  values (new.id, code, 'pending', null, 'school')
  returning id into mid;

  insert into profiles (member_id, display_name, email)
  values (mid, uname, new.email);

  insert into identities (
    member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw,
    guild_present, discord_roles
  ) values (
    mid,
    auth_provider,
    uid,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      uname
    ),
    uname,
    snap.guild_nick,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', snap.avatar_url),
    coalesce(new.raw_user_meta_data, '{}'::jsonb),
    snap.discord_id is not null,
    coalesce(snap.roles, '[]'::jsonb)
  );

  select d.distance_ext_id into dist from discord_distance_ids d where d.discord_id = uid;
  if dist is not null then
    update members set distance_ext_id = dist where id = mid;
  end if;

  return new;
end;
$$;
