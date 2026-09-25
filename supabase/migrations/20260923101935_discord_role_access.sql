-- Durable Discord roster and role-driven application permissions.
-- A completed snapshot may mark missing people as left; failed/incomplete
-- fetches never call this transaction and therefore cannot block anyone.

alter table discord_members
  add column if not exists present boolean not null default true,
  add column if not exists last_seen_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists last_sync_id uuid;

update discord_members
set last_seen_at = coalesce(last_seen_at, synced_at)
where last_seen_at is null;

create table if not exists discord_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  fetched_count integer not null default 0,
  expected_count integer,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed'))
);

alter table discord_members
  drop constraint if exists discord_members_last_sync_id_fkey;
alter table discord_members
  add constraint discord_members_last_sync_id_fkey
  foreign key (last_sync_id) references discord_sync_runs (id) on delete set null;

create table if not exists discord_guild_roles (
  role_id text primary key,
  name text not null,
  color text,
  position integer not null default 0,
  managed boolean not null default false,
  present boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists app_permissions (
  code text primary key,
  title text not null,
  section text not null,
  sort integer not null default 0
);

insert into app_permissions (code, title, section, sort) values
  ('profile', 'Профиль', 'module', 10),
  ('schedule', 'Расписание', 'module', 20),
  ('priorities', 'Приоритеты', 'module', 30),
  ('admin.people', 'Управление пользователями', 'admin', 40),
  ('distances', 'Дистанции', 'module', 50)
on conflict (code) do update set
  title = excluded.title,
  section = excluded.section,
  sort = excluded.sort;

create table if not exists discord_role_permissions (
  role_id text not null references discord_guild_roles (role_id) on delete cascade,
  permission_code text not null references app_permissions (code) on delete cascade,
  primary key (role_id, permission_code)
);

create table if not exists discord_role_schedule_limits (
  role_id text not null references discord_guild_roles (role_id) on delete cascade,
  variant_id text not null references variants (id) on delete cascade,
  limit_id text not null references limits (id) on delete cascade,
  primary key (role_id, variant_id, limit_id)
);

alter table club_settings
  add column if not exists required_discord_role_id text;

alter table club_settings disable trigger club_settings_stamp;
update club_settings
set required_discord_role_id = coalesce(required_discord_role_id, '1208022351652986891')
where id;
alter table club_settings enable trigger club_settings_stamp;

alter table members
  add column if not exists block_reason text,
  add column if not exists blocked_at timestamptz;

alter table members
  drop constraint if exists members_block_reason_shape;
alter table members
  add constraint members_block_reason_shape
  check (block_reason is null or block_reason in ('manual', 'discord_left', 'missing_redparty'));

create unique index if not exists member_roles_one_root
  on member_roles ((role_id))
  where role_id = 'root';

-- Seed the currently known catalog before role grants receive foreign keys.
insert into discord_guild_roles (role_id, name, color, position, managed, present, synced_at)
select
  role ->> 'id',
  max(role ->> 'name'),
  max(nullif(role ->> 'color', '')),
  0,
  false,
  true,
  now()
from discord_members dm
cross join lateral jsonb_array_elements(dm.roles) role
where coalesce(role ->> 'id', '') <> ''
group by role ->> 'id'
on conflict (role_id) do update set
  name = excluded.name,
  color = excluded.color,
  present = true,
  synced_at = excluded.synced_at;

insert into discord_role_permissions (role_id, permission_code)
select seed.role_id, seed.permission_code
from (values
  ('1208022351652986891', 'profile'),
  ('1208019567251820604', 'profile'),
  ('1208019567251820604', 'admin.people'),
  ('1208019567251820604', 'priorities'),
  ('1208019567251820604', 'distances'),
  ('1208022278088949770', 'schedule')
) as seed(role_id, permission_code)
join discord_guild_roles role on role.role_id = seed.role_id
on conflict do nothing;

insert into discord_role_schedule_limits (role_id, variant_id, limit_id)
select '1208022278088949770', v.id, l.id
from variants v
cross join limits l
where v.id in ('nitro', 'regular')
  and l.id in ('50', '100')
  and exists (
    select 1 from discord_guild_roles role
    where role.role_id = '1208022278088949770'
  )
on conflict do nothing;

alter table discord_sync_runs enable row level security;
alter table discord_guild_roles enable row level security;
alter table app_permissions enable row level security;
alter table discord_role_permissions enable row level security;
alter table discord_role_schedule_limits enable row level security;

grant select on discord_sync_runs, discord_guild_roles, app_permissions,
  discord_role_permissions, discord_role_schedule_limits to authenticated;
grant insert, update, delete on discord_role_permissions,
  discord_role_schedule_limits to authenticated;
revoke all on discord_sync_runs, discord_guild_roles, app_permissions,
  discord_role_permissions, discord_role_schedule_limits from anon;

create policy discord_sync_runs_read on discord_sync_runs
  for select to authenticated using (true);
create policy discord_guild_roles_read on discord_guild_roles
  for select to authenticated using (true);
create policy app_permissions_read on app_permissions
  for select to authenticated using (true);
create policy discord_role_permissions_read on discord_role_permissions
  for select to authenticated using (true);
create policy discord_role_schedule_limits_read on discord_role_schedule_limits
  for select to authenticated using (true);

create or replace function member_is_root(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from member_roles
    where member_id = p_member_id and role_id = 'root'
  );
$$;

create or replace function member_has_required_discord_role(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select member_is_root(p_member_id) or exists (
    select 1
    from identities i
    join club_settings s on s.id
    where i.member_id = p_member_id
      and i.provider = 'discord'
      and i.guild_present
      and exists (
        select 1
        from jsonb_array_elements(i.discord_roles) r
        where r ->> 'id' = s.required_discord_role_id
      )
  );
$$;

create or replace function member_has_permission(p_member_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select member_is_root(p_member_id) or exists (
    select 1
    from members m
    join identities i on i.member_id = m.id and i.provider = 'discord'
    join discord_role_permissions rp on rp.permission_code = p_permission
    where m.id = p_member_id
      and m.access_status = 'active'
      and i.guild_present
      and member_has_required_discord_role(m.id)
      and exists (
        select 1
        from jsonb_array_elements(i.discord_roles) r
        where r ->> 'id' = rp.role_id
      )
  );
$$;

create or replace function member_has_schedule_limit(
  p_member_id uuid,
  p_variant_id text,
  p_limit_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select member_is_root(p_member_id) or exists (
    select 1
    from members m
    join identities i on i.member_id = m.id and i.provider = 'discord'
    join discord_role_schedule_limits rl
      on rl.variant_id = p_variant_id and rl.limit_id = p_limit_id
    where m.id = p_member_id
      and m.access_status = 'active'
      and i.guild_present
      and member_has_required_discord_role(m.id)
      and member_has_permission(m.id, 'schedule')
      and exists (
        select 1
        from jsonb_array_elements(i.discord_roles) r
        where r ->> 'id' = rl.role_id
      )
  );
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    member_has_permission(
      (select id from members where auth_user_id = auth.uid()),
      'admin.people'
    ),
    false
  );
$$;

create policy discord_role_permissions_write on discord_role_permissions
  for all to authenticated
  using (is_staff())
  with check (is_staff());
create policy discord_role_schedule_limits_write on discord_role_schedule_limits
  for all to authenticated
  using (is_staff())
  with check (is_staff());

create or replace function replace_discord_roster(
  p_guild jsonb,
  p_members jsonb,
  p_roles jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz := now();
  sync_id uuid := gen_random_uuid();
  fetched integer;
  expected integer;
  required_role text;
begin
  if jsonb_typeof(p_members) is distinct from 'array'
     or jsonb_array_length(p_members) = 0
     or jsonb_typeof(p_roles) is distinct from 'array' then
    raise exception 'incomplete discord roster';
  end if;

  fetched := jsonb_array_length(p_members);
  expected := nullif(p_guild ->> 'member_count', '')::integer;
  select required_discord_role_id into required_role from club_settings where id;

  insert into discord_sync_runs (id, started_at, fetched_count, expected_count, status)
  values (sync_id, ts, fetched, expected, 'running');

  insert into discord_guild (id, name, icon_url, member_count, online_count, synced_at)
  values (
    p_guild ->> 'id',
    coalesce(p_guild ->> 'name', 'Discord'),
    nullif(p_guild ->> 'icon_url', ''),
    expected,
    nullif(p_guild ->> 'online_count', '')::integer,
    ts
  )
  on conflict (id) do update set
    name = excluded.name,
    icon_url = excluded.icon_url,
    member_count = excluded.member_count,
    online_count = excluded.online_count,
    synced_at = excluded.synced_at;

  update discord_guild_roles
  set present = false, synced_at = ts
  where present;

  insert into discord_guild_roles (role_id, name, color, position, managed, present, synced_at)
  select
    r ->> 'id',
    coalesce(r ->> 'name', ''),
    nullif(r ->> 'color', ''),
    coalesce(nullif(r ->> 'position', '')::integer, 0),
    coalesce((r ->> 'managed')::boolean, false),
    true,
    ts
  from jsonb_array_elements(p_roles) r
  where coalesce(r ->> 'id', '') <> ''
    and coalesce(r ->> 'name', '') <> '@everyone'
  on conflict (role_id) do update set
    name = excluded.name,
    color = excluded.color,
    position = excluded.position,
    managed = excluded.managed,
    present = true,
    synced_at = excluded.synced_at;

  insert into discord_members (
    discord_id, username, global_name, guild_nick, avatar_url, bot,
    joined_at, roles, synced_at, present, last_seen_at, left_at, last_sync_id
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
    ts,
    true,
    ts,
    null,
    sync_id
  from jsonb_array_elements(p_members) m
  where coalesce(m ->> 'discord_id', '') <> ''
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
    left_at = null,
    last_sync_id = excluded.last_sync_id;

  -- Mirror every Discord-owned field for people present in this complete run.
  update identities i
  set
    username = d.username,
    display_name = d.global_name,
    guild_nick = d.guild_nick,
    avatar_url = d.avatar_url,
    discord_roles = d.roles,
    guild_present = true,
    guild_left_at = null,
    updated_at = ts
  from discord_members d
  where i.provider = 'discord'
    and i.provider_uid = d.discord_id
    and d.last_sync_id = sync_id;

  -- Missing from a complete run: preserve every stored field, only mark left.
  update discord_members
  set
    present = false,
    left_at = coalesce(left_at, ts)
  where last_sync_id is distinct from sync_id
    and present;

  update members m
  set
    access_status = 'blocked',
    block_reason = 'discord_left',
    blocked_at = ts,
    approved_at = null
  from identities i
  where i.member_id = m.id
    and i.provider = 'discord'
    and not member_is_root(m.id)
    and m.access_status = 'active'
    and not exists (
      select 1 from discord_members d
      where d.discord_id = i.provider_uid and d.present
    );

  update identities i
  set
    guild_present = false,
    guild_left_at = coalesce(guild_left_at, ts)
  where i.provider = 'discord'
    and not exists (
      select 1 from discord_members d
      where d.discord_id = i.provider_uid and d.present
    );

  update members m
  set
    access_status = 'blocked',
    block_reason = 'missing_redparty',
    blocked_at = ts,
    approved_at = null
  from identities i
  where i.member_id = m.id
    and i.provider = 'discord'
    and i.guild_present
    and not member_is_root(m.id)
    and m.access_status = 'active'
    and not exists (
      select 1 from jsonb_array_elements(i.discord_roles) r
      where r ->> 'id' = required_role
    );

  update discord_sync_runs
  set completed_at = now(), status = 'completed'
  where id = sync_id;
end;
$$;

-- Compatibility for an older deployed function during rolling deployment.
create or replace function replace_discord_roster(p_guild jsonb, p_members jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  role_list jsonb;
begin
  select coalesce(jsonb_agg(distinct role), '[]'::jsonb)
  into role_list
  from jsonb_array_elements(p_members) member,
       jsonb_array_elements(coalesce(member -> 'roles', '[]'::jsonb)) role;
  perform replace_discord_roster(p_guild, p_members, role_list);
end;
$$;

revoke all on function replace_discord_roster(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function replace_discord_roster(jsonb, jsonb, jsonb) to service_role;

revoke all on function replace_discord_roster(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function replace_discord_roster(jsonb, jsonb) to service_role;

alter publication supabase_realtime add table discord_guild_roles;
alter publication supabase_realtime add table discord_role_permissions;
alter publication supabase_realtime add table discord_role_schedule_limits;
