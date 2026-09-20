-- Snapshot of the club Discord server. Not schedule members.
-- Refresh is manual (root → Server). Later a daily job can call the same function.

create table discord_guild (
  id text primary key,
  name text not null,
  icon_url text,
  member_count integer,
  online_count integer,
  synced_at timestamptz not null default now()
);

create table discord_members (
  discord_id text primary key,
  username text not null,
  global_name text,
  guild_nick text,
  avatar_url text,
  bot boolean not null default false,
  joined_at timestamptz,
  roles jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);

alter table discord_guild enable row level security;
alter table discord_members enable row level security;

create policy discord_guild_read on discord_guild for select to authenticated using (true);
create policy discord_members_read on discord_members for select to authenticated using (true);

grant select on discord_guild to authenticated;
grant select on discord_members to authenticated;

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
end;
$$;

revoke all on function replace_discord_roster(jsonb, jsonb) from public, anon, authenticated;
grant execute on function replace_discord_roster(jsonb, jsonb) to service_role;
