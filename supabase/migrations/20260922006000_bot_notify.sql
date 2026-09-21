-- Where a person wants bot notices, and club-wide bot settings (root).

create or replace function is_root()
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
      and r.role_id = 'root'
  );
$$;

revoke all on function is_root() from public, anon;
grant execute on function is_root() to authenticated;

alter table profiles
  add column if not exists notify_channel text not null default 'discord';

alter table profiles
  drop constraint if exists profiles_notify_channel_check;

alter table profiles
  add constraint profiles_notify_channel_check
  check (notify_channel in ('discord', 'telegram', 'email'));

comment on column profiles.notify_channel is
  'Where the club bot should reach this person: discord, telegram or email. Default discord.';

create table if not exists bot_settings (
  id text primary key check (id in ('discord', 'telegram')),
  app_name text not null default '',
  app_id text not null default '',
  bot_username text not null default '',
  guild_id text not null default '',
  notice_chat text not null default '',
  notify_mark_removed boolean not null default false,
  notify_fill_queue boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table bot_settings is
  'One row per club bot. Public config and auto-notice flags. Tokens live in bot_secrets.';

insert into bot_settings (id, app_name, notify_mark_removed, notify_fill_queue)
values
  ('discord', 'Red Party', true, false),
  ('telegram', '', false, false)
on conflict (id) do nothing;

create table if not exists bot_secrets (
  bot_id text primary key references bot_settings (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table bot_secrets is
  'Bot tokens. No client SELECT. Root writes through set_bot_token. Edge Functions read with service role.';

create table if not exists bot_operators (
  bot_id text not null references bot_settings (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  primary key (bot_id, member_id)
);

comment on table bot_operators is
  'People who may send a message as this bot. Root always can.';

alter table bot_settings enable row level security;
alter table bot_secrets enable row level security;
alter table bot_operators enable row level security;

grant select, update on bot_settings to authenticated;
grant select, insert, delete on bot_operators to authenticated;
revoke all on bot_secrets from public, anon, authenticated;
grant select, insert, update on bot_secrets to service_role;

drop policy if exists bot_settings_read on bot_settings;
drop policy if exists bot_settings_update on bot_settings;
drop policy if exists bot_operators_read on bot_operators;
drop policy if exists bot_operators_write on bot_operators;
drop policy if exists bot_operators_delete on bot_operators;

create policy bot_settings_read on bot_settings
  for select to authenticated
  using (true);

create policy bot_settings_update on bot_settings
  for update to authenticated
  using (is_root())
  with check (is_root());

create policy bot_operators_read on bot_operators
  for select to authenticated
  using (is_root() or member_id = current_member_id());

create policy bot_operators_write on bot_operators
  for insert to authenticated
  with check (is_root());

create policy bot_operators_delete on bot_operators
  for delete to authenticated
  using (is_root());

create or replace function bot_settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_root() then
    raise exception 'root-only' using errcode = '42501';
  end if;
  new.id := old.id;
  new.updated_at := now();
  new.updated_by := current_member_id();
  return new;
end;
$$;

drop trigger if exists bot_settings_stamp on bot_settings;
create trigger bot_settings_stamp
  before update on bot_settings
  for each row execute function bot_settings_stamp();

create or replace function set_bot_token(p_bot text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  next_token text;
begin
  if not is_root() then
    raise exception 'root-only' using errcode = '42501';
  end if;
  if p_bot not in ('discord', 'telegram') then
    raise exception 'unknown-bot';
  end if;
  actor := current_member_id();
  next_token := trim(coalesce(p_token, ''));
  if next_token = '' then
    return exists (select 1 from bot_secrets where bot_id = p_bot);
  end if;
  insert into bot_secrets (bot_id, token, updated_at, updated_by)
  values (p_bot, next_token, now(), actor)
  on conflict (bot_id) do update
    set token = excluded.token,
        updated_at = now(),
        updated_by = actor;
  return true;
end;
$$;

create or replace function bot_token_flags()
returns table (bot_id text, has_token boolean)
language sql
security definer
set search_path = public
as $$
  select s.id, exists (select 1 from bot_secrets x where x.bot_id = s.id)
  from bot_settings s
  where is_root();
$$;

revoke all on function set_bot_token(text, text) from public, anon;
revoke all on function bot_token_flags() from public, anon;
grant execute on function set_bot_token(text, text) to authenticated;
grant execute on function bot_token_flags() to authenticated;
