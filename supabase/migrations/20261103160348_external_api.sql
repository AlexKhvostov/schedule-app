-- Machine API: isolated credentials and bounded read-only schedule projection.
-- Public wrappers use INVOKER and are callable only by the internal service_role.
create schema if not exists external_api_private;
revoke all on schema external_api_private from public, anon, authenticated;
grant usage on schema external_api_private to service_role;

create table external_api_private.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  key_hash text unique not null check (key_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] not null default array['schedule:read']::text[],
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  requests_per_minute integer not null default 60 check (requests_per_minute between 1 and 600),
  window_start timestamptz not null default '-infinity',
  request_count integer not null default 0 check (request_count >= 0)
);
alter table external_api_private.clients enable row level security;
revoke all on external_api_private.clients from public, anon, authenticated;
grant select, insert, update on external_api_private.clients to service_role;

-- A single bounded bucket for well-formed unknown keys. No attacker-created rows.
create table external_api_private.failed_auth (
  singleton boolean primary key default true check (singleton),
  window_start timestamptz not null default '-infinity',
  request_count integer not null default 0
);
insert into external_api_private.failed_auth(singleton) values(true);
alter table external_api_private.failed_auth enable row level security;
revoke all on external_api_private.failed_auth from public, anon, authenticated;
grant select, update on external_api_private.failed_auth to service_role;

create function external_api_private.authorize(p_key_hash text, p_scope text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c external_api_private.clients%rowtype;
  v_now timestamptz := clock_timestamp();
  v_window timestamptz := date_trunc('minute', v_now);
  v_count integer;
  v_retry integer := greatest(1, ceil(extract(epoch from v_window + interval '1 minute' - v_now))::integer);
begin
  -- Serializes per-client quota and revocation with the read in the same transaction.
  select * into c from external_api_private.clients where key_hash = p_key_hash for update;
  if not found or c.revoked_at is not null or (c.expires_at is not null and c.expires_at <= v_now) then
    update external_api_private.failed_auth set
      request_count = case when window_start = v_window then least(request_count + 1, 301) else 1 end,
      window_start = v_window
    where singleton returning request_count into v_count;
    if v_count > 300 then
      return jsonb_build_object('code', 'rate_limited', 'retry_after', v_retry);
    end if;
    return jsonb_build_object('code', 'invalid_api_key');
  end if;
  if not (p_scope = any(c.scopes)) then
    return jsonb_build_object('code', 'insufficient_scope');
  end if;
  if c.window_start = v_window and c.request_count >= c.requests_per_minute then
    return jsonb_build_object('code', 'rate_limited', 'retry_after', v_retry);
  end if;
  update external_api_private.clients set
    window_start = v_window,
    request_count = case when c.window_start = v_window then c.request_count + 1 else 1 end
  where id = c.id;
  return null;
end;
$$;
revoke all on function external_api_private.authorize(text,text) from public, anon, authenticated;
grant execute on function external_api_private.authorize(text,text) to service_role;

create function public.external_api_schedule(
  p_key_hash text,
  p_date text,
  p_days integer,
  p_limit text default null,
  p_variant text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_error jsonb;
  v_date date;
  v_result jsonb;
begin
  v_error := external_api_private.authorize(p_key_hash, 'schedule:read');
  if v_error is not null then return jsonb_build_object('error', v_error); end if;

  if p_date is null or p_date !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','date'));
  end if;
  begin
    v_date := p_date::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','date'));
  end;
  if p_days is null or p_days not between 1 and 31 then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','days'));
  end if;
  if v_date + p_days > date '9999-12-31' then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','date'));
  end if;
  if p_variant is not null and p_variant not in ('nitro','regular') then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','variant'));
  end if;
  if p_limit is not null and not exists(select 1 from public.limits where id = p_limit) then
    return jsonb_build_object('error', jsonb_build_object('code','validation_error','field','limit'));
  end if;

  -- One statement = one consistent snapshot of marks, names and club settings.
  -- A scalar JSON return avoids PostgREST's max_rows=1000 truncation.
  with source as materialized (
    select o.*, k.variant_id, k.limit_id, k.room_id, l.sort as limit_sort
    from public.occupancy o
    join public.schedule_kinds k on k.id = o.kind_id
    join public.rooms r on r.id = k.room_id and r.slug = 'winamax'
    join public.limits l on l.id = k.limit_id
    where o.slot_date >= v_date and o.slot_date < v_date + p_days
      and k.variant_id in ('nitro','regular')
      and (p_variant is null or k.variant_id = p_variant)
      and (p_limit is null or k.limit_id = p_limit)
    order by o.slot_date, k.variant_id, l.sort, o.level, o.half, o.id
    limit 10001
  )
  select case when (select count(*) from source) > 10000 then
    jsonb_build_object('error', jsonb_build_object('code','response_too_large'))
  else jsonb_build_object(
    'generated_at', statement_timestamp(),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'date', o.slot_date, 'half', o.half, 'level', o.level,
        'kind_id', o.kind_id, 'variant', o.variant_id, 'limit', o.limit_id,
        'limit_sort', o.limit_sort, 'room', 'winamax',
        'tables', case when coalesce((select count_tables from public.schedule_settings limit 1), false) then o.tables else null end,
        'mark', jsonb_build_object('text', m.mark_tag, 'background', m.mark_bg, 'foreground', m.mark_fg),
        'owner', jsonb_build_object(
          'member_id', o.member_id,
          'display_name', coalesce(nullif(d.guild_nick,''), nullif(i.guild_nick,''), nullif(d.username,''), nullif(i.username,''), nullif(d.global_name,''), nullif(i.display_name,''), m.public_code),
          'profile_name', nullif(p.display_name,''),
          'discord_id', i.provider_uid,
          'discord_username', coalesce(nullif(d.username,''), nullif(i.username,'')),
          'discord_global_name', coalesce(nullif(d.global_name,''), nullif(i.display_name,'')),
          'discord_guild_nick', coalesce(nullif(d.guild_nick,''), nullif(i.guild_nick,'')),
          'game_nick', nullif(n.nick,'')
        )
      ) order by o.slot_date, o.variant_id, o.limit_sort, o.level, o.half, o.id)
      from source o
      join public.members m on m.id = o.member_id
      left join public.profiles p on p.member_id = m.id
      left join lateral (
        select ident.* from public.identities ident
        where ident.member_id = m.id and ident.provider = 'discord'
        order by ident.updated_at desc, ident.id desc limit 1
      ) i on true
      left join public.discord_members d on d.discord_id = i.provider_uid
      left join lateral (
        select nick.nick from public.players player
        join public.player_nicks nick on nick.player_id = player.id
        where player.member_id = m.id and player.room_id = o.room_id
        order by nick.at desc, nick.id desc limit 1
      ) n on true
    ), '[]'::jsonb)
  ) end into v_result;
  return v_result;
end;
$$;
revoke all on function public.external_api_schedule(text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.external_api_schedule(text,text,integer,text,text) to service_role;
comment on function public.external_api_schedule(text,text,integer,text,text) is
  'Internal machine API read: separate hashed integration key, scope, quota and bounded consistent snapshot; not a user RPC.';
