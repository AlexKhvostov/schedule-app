-- Spine of the MVP: member, login, schedule kind, capacity, occupancy.
-- No distances, payments, or scraper tables.

create table app_roles (
  id text primary key,
  title text not null
);

insert into app_roles (id, title) values
  ('member', 'Member'),
  ('admin', 'Administrator'),
  ('root', 'Root');

create table members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  public_code text unique not null,
  access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'blocked')),
  community_status text check (community_status in ('school', 'club')),
  mark_tag text not null,
  mark_bg text not null default '#76a5af',
  mark_fg text not null default '#1a2118',
  tables smallint not null default 1 check (tables between 1 and 30),
  grid_priority integer not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create unique index members_mark_tag_lower on members (lower(mark_tag));

create table profiles (
  member_id uuid primary key references members (id) on delete cascade,
  display_name text,
  email text,
  phone text,
  birthday date,
  city text,
  country text,
  show_extra_tz boolean not null default false,
  extra_utc smallint not null default 3
);

create table identities (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  provider text not null check (provider in ('discord', 'google', 'email')),
  provider_uid text not null,
  username text,
  display_name text,
  guild_nick text,
  avatar_url text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

create table member_roles (
  member_id uuid not null references members (id) on delete cascade,
  role_id text not null references app_roles (id),
  primary key (member_id, role_id)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null
);

create table limits (
  id text primary key,
  sort smallint not null
);

create table formats (
  id text primary key
);

create table variants (
  id text primary key
);

create table schedule_kinds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  limit_id text not null references limits (id),
  format_id text not null references formats (id),
  variant_id text references variants (id),
  unique (room_id, limit_id, format_id, variant_id)
);

create table capacity_flags (
  kind_id uuid primary key references schedule_kinds (id) on delete cascade,
  equalize boolean not null default false,
  week_on boolean not null default true,
  month_on boolean not null default true
);

create table capacity_rules (
  id uuid primary key default gen_random_uuid(),
  kind_id uuid not null references schedule_kinds (id) on delete cascade,
  layer text not null check (layer in ('base', 'month', 'week')),
  day_of_month smallint check (day_of_month between 1 and 31),
  weekday smallint check (weekday between 0 and 6),
  hours smallint[24] not null,
  check (array_length(hours, 1) = 24),
  check (hours <@ array[1, 2, 3, 4, 5, 6]::smallint[])
);

create unique index capacity_rules_base on capacity_rules (kind_id) where layer = 'base';
create unique index capacity_rules_month on capacity_rules (kind_id, day_of_month) where layer = 'month';
create unique index capacity_rules_week on capacity_rules (kind_id, weekday) where layer = 'week';

create table occupancy (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  kind_id uuid not null references schedule_kinds (id) on delete cascade,
  slot_date date not null,
  half smallint not null check (half between 0 and 47),
  level smallint not null check (level between 0 and 5),
  created_at timestamptz not null default now(),
  unique (member_id, slot_date, half),
  unique (kind_id, slot_date, half, level)
);

create index occupancy_month on occupancy (kind_id, slot_date);

create or replace function default_hour_caps()
returns smallint[]
language sql
immutable
as $$
  select array[
    2, 2, 2, 2, 2, 2,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    2, 2
  ]::smallint[];
$$;

create or replace function hours_of(p_kind uuid, p_date date)
returns smallint[]
language plpgsql
stable
as $$
declare
  flags capacity_flags%rowtype;
  base smallint[];
  by_day smallint[];
  by_week smallint[];
  wd integer;
  i integer;
  out_hours smallint[] := '{}'::smallint[];
begin
  select * into flags from capacity_flags where kind_id = p_kind;
  select hours into base from capacity_rules where kind_id = p_kind and layer = 'base';
  base := coalesce(base, default_hour_caps());
  wd := extract(dow from p_date)::integer;
  if coalesce(flags.month_on, true) then
    select hours into by_day
    from capacity_rules
    where kind_id = p_kind and layer = 'month' and day_of_month = extract(day from p_date)::integer;
  end if;
  if coalesce(flags.week_on, true) then
    select hours into by_week
    from capacity_rules
    where kind_id = p_kind and layer = 'week' and weekday = wd;
  end if;
  if by_day is not null and by_week is not null then
    for i in 1..24 loop
      out_hours := out_hours || least(by_day[i], by_week[i]);
    end loop;
    return out_hours;
  end if;
  return coalesce(by_day, by_week, base);
end;
$$;

create or replace function occupancy_guard()
returns trigger
language plpgsql
as $$
declare
  caps smallint[];
  open_levels integer;
begin
  if exists (
    select 1 from members
    where id = new.member_id and access_status <> 'active'
  ) then
    raise exception 'member is not active';
  end if;
  caps := hours_of(new.kind_id, new.slot_date);
  open_levels := caps[(new.half / 2) + 1];
  if new.level >= open_levels then
    raise exception 'level is locked';
  end if;
  return new;
end;
$$;

create trigger occupancy_guard
  before insert or update on occupancy
  for each row execute function occupancy_guard();

create or replace function current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where auth_user_id = auth.uid();
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from member_roles r
    join members m on m.id = r.member_id
    where m.auth_user_id = auth.uid()
      and r.role_id in ('admin', 'root')
  );
$$;

create or replace function on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  tag text;
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
  tag := upper(substr(regexp_replace(coalesce(uname, 'XX'), '[^a-zA-Zа-яА-Я0-9]', '', 'g') || 'XX', 1, 2));
  while exists (select 1 from members where lower(mark_tag) = lower(tag)) loop
    tag := upper(substr(md5(new.id::text || clock_timestamp()::text), 1, 2));
  end loop;

  insert into members (auth_user_id, public_code, access_status, mark_tag, community_status)
  values (
    new.id,
    'RP-' || substr(replace(new.id::text, '-', ''), 1, 6),
    'pending',
    tag,
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function on_auth_user_created();

alter table members enable row level security;
alter table profiles enable row level security;
alter table identities enable row level security;
alter table member_roles enable row level security;
alter table rooms enable row level security;
alter table limits enable row level security;
alter table formats enable row level security;
alter table variants enable row level security;
alter table schedule_kinds enable row level security;
alter table capacity_flags enable row level security;
alter table capacity_rules enable row level security;
alter table occupancy enable row level security;

create policy members_read on members for select to authenticated using (true);
create policy members_self_update on members
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
create policy members_staff_update on members
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_self_write on profiles
  for update to authenticated
  using (member_id = current_member_id())
  with check (member_id = current_member_id());

create policy identities_read on identities for select to authenticated using (true);
create policy identities_self_update on identities
  for update to authenticated
  using (member_id = current_member_id())
  with check (member_id = current_member_id());

create policy member_roles_read on member_roles for select to authenticated using (true);
create policy member_roles_staff on member_roles
  for all to authenticated
  using (is_staff())
  with check (is_staff());

create policy catalog_read_rooms on rooms for select to authenticated using (true);
create policy catalog_read_limits on limits for select to authenticated using (true);
create policy catalog_read_formats on formats for select to authenticated using (true);
create policy catalog_read_variants on variants for select to authenticated using (true);
create policy catalog_read_kinds on schedule_kinds for select to authenticated using (true);
create policy catalog_read_flags on capacity_flags for select to authenticated using (true);
create policy catalog_read_rules on capacity_rules for select to authenticated using (true);

create policy capacity_staff_flags on capacity_flags
  for all to authenticated
  using (is_staff())
  with check (is_staff());
create policy capacity_staff_rules on capacity_rules
  for all to authenticated
  using (is_staff())
  with check (is_staff());

create policy occupancy_read on occupancy for select to authenticated using (true);
create policy occupancy_insert_own on occupancy
  for insert to authenticated
  with check (
    member_id = current_member_id()
    and exists (select 1 from members where id = current_member_id() and access_status = 'active')
  );
create policy occupancy_delete_own on occupancy
  for delete to authenticated
  using (member_id = current_member_id() or is_staff());

alter publication supabase_realtime add table occupancy;
alter publication supabase_realtime add table members;
