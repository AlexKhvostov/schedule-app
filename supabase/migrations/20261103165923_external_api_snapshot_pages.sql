-- Immutable, short-lived exports; no copy of the live schedule is maintained.
create table external_api_private.snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references external_api_private.clients(id) on delete cascade,
  query jsonb not null,
  generated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  total_slots integer not null default 0,
  total_pages integer not null default 1,
  stored_bytes bigint not null default 0
);
create index external_api_snapshots_client_expiry on external_api_private.snapshots(client_id,expires_at);
create index external_api_snapshots_expiry on external_api_private.snapshots(expires_at);
create table external_api_private.snapshot_pages (
  cursor uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references external_api_private.snapshots(id) on delete cascade,
  page_number integer not null check(page_number >= 1),
  rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=1000),
  unique(snapshot_id,page_number)
);
alter table external_api_private.snapshots enable row level security;
alter table external_api_private.snapshot_pages enable row level security;
revoke all on external_api_private.snapshots,external_api_private.snapshot_pages from public,anon,authenticated;
grant select,insert,update,delete on external_api_private.snapshots to service_role;
grant select,insert,delete on external_api_private.snapshot_pages to service_role;

create function external_api_private.prune_snapshots()
returns void language sql security invoker set search_path = '' as $$
  delete from external_api_private.snapshots where expires_at <= clock_timestamp();
$$;
revoke all on function external_api_private.prune_snapshots() from public,anon,authenticated;
grant execute on function external_api_private.prune_snapshots() to service_role;
select cron.schedule('external-api-snapshots-prune','*/5 * * * *',
  $$select external_api_private.prune_snapshots()$$);

-- Replace the unreleased first version, avoiding ambiguous RPC overloads.
drop function public.external_api_schedule(text,text,integer,text,text);
create function public.external_api_schedule(
  p_key_hash text,
  p_date text default null,
  p_days integer default null,
  p_limit text default null,
  p_variant text default null,
  p_cursor text default null
)
returns jsonb language plpgsql security invoker set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_error jsonb;
  v_date date;
  v_client uuid;
  v_id uuid;
  v_cursor uuid;
  v_page external_api_private.snapshot_pages%rowtype;
  v_snapshot external_api_private.snapshots%rowtype;
  v_next uuid;
  v_count integer;
  v_bytes bigint;
  v_live_count integer;
  v_live_bytes bigint;
  v_retry integer;
begin
  -- Authentication is repeated even for a stored page, including revocation and quota.
  -- authorize locks the client row, also serializing concurrent snapshot creation.
  v_error := external_api_private.authorize(p_key_hash,'schedule:read');
  if v_error is not null then return jsonb_build_object('error',v_error); end if;
  select id into v_client from external_api_private.clients where key_hash=p_key_hash;

  if p_cursor is not null then
    if p_date is not null or p_days is not null or p_limit is not null or p_variant is not null
      or p_cursor !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','cursor'));
    end if;
    v_cursor := p_cursor::uuid;
    -- Same response for foreign, expired and unknown cursors: no ownership oracle.
    select p.* into v_page from external_api_private.snapshot_pages p
    join external_api_private.snapshots s on s.id=p.snapshot_id
    where p.cursor=v_cursor and s.client_id=v_client and s.expires_at>clock_timestamp();
    if not found then
      return jsonb_build_object('error',jsonb_build_object('code','snapshot_unavailable'));
    end if;
    -- Protect the metadata/page read from concurrent expiry cleanup.
    select * into v_snapshot from external_api_private.snapshots
    where id=v_page.snapshot_id and client_id=v_client and expires_at>clock_timestamp() for share;
    if not found then
      return jsonb_build_object('error',jsonb_build_object('code','snapshot_unavailable'));
    end if;
  else
    if p_date is null or p_date !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','date'));
    end if;
    begin
      v_date := p_date::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','date'));
    end;
    if p_days is null or p_days not between 1 and 31 then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','days'));
    end if;
    if v_date + p_days > date '9999-12-31' then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','date'));
    end if;
    if p_variant is not null and p_variant not in ('nitro','regular') then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','variant'));
    end if;
    if p_limit is not null and not exists(select 1 from public.limits where id=p_limit) then
      return jsonb_build_object('error',jsonb_build_object('code','validation_error','field','limit'));
    end if;

    delete from external_api_private.snapshots where client_id=v_client and expires_at<=clock_timestamp();
    select count(*),coalesce(sum(stored_bytes),0),
      greatest(1,ceil(extract(epoch from min(expires_at)-clock_timestamp()))::integer)
    into v_live_count,v_live_bytes,v_retry
    from external_api_private.snapshots where client_id=v_client;
    if v_live_count>=30 or v_live_bytes>=268435456 then
      return jsonb_build_object('error',jsonb_build_object('code','snapshot_limit','retry_after',coalesce(v_retry,60)));
    end if;

    -- Subtransaction: a rejected oversized export leaves no partial snapshot.
    -- The auth/quota debit above still commits on a returned error.
    begin
      insert into external_api_private.snapshots(client_id,query)
      values(v_client,jsonb_build_object('date',p_date,'days',p_days,'limit',p_limit,'variant',p_variant))
      returning id into v_id;

      -- THIS SINGLE INSERT/SELECT freezes occupancy AND all current metadata in one
      -- MVCC read snapshot. No per-day/per-owner queries with different snapshots.
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
    limit 250001

      ), frozen as (
        select row_number() over(order by o.slot_date,o.variant_id,o.limit_sort,o.kind_id,o.level,o.half,o.id) as ordinal,
          jsonb_build_object(
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
) as payload
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

      )
      insert into external_api_private.snapshot_pages(snapshot_id,page_number,rows)
      select v_id,((ordinal-1)/1000+1)::integer,jsonb_agg(payload order by ordinal)
      from frozen group by ((ordinal-1)/1000+1)::integer;

      select coalesce(sum(jsonb_array_length(rows)),0),coalesce(sum(octet_length(rows::text)),0)
      into v_count,v_bytes from external_api_private.snapshot_pages where snapshot_id=v_id;
      if v_count>250000 or v_bytes>134217728 or exists(
        select 1 from external_api_private.snapshot_pages where snapshot_id=v_id and octet_length(rows::text)>4194304
      ) then raise exception 'snapshot too large' using errcode='54000'; end if;
      if v_live_bytes+v_bytes>268435456 then
        raise exception 'snapshot quota' using errcode='54001';
      end if;
      if v_count=0 then
        insert into external_api_private.snapshot_pages(snapshot_id,page_number,rows) values(v_id,1,'[]');
      end if;
      update external_api_private.snapshots set total_slots=v_count,
        total_pages=greatest(1,(v_count+999)/1000),stored_bytes=v_bytes
      where id=v_id returning * into v_snapshot;
      select * into v_page from external_api_private.snapshot_pages where snapshot_id=v_id and page_number=1;
    exception
      when sqlstate '54000' then
        return jsonb_build_object('error',jsonb_build_object('code','response_too_large'));
      when sqlstate '54001' then
        return jsonb_build_object('error',jsonb_build_object('code','snapshot_limit','retry_after',coalesce(v_retry,60)));
    end;
  end if;

  select cursor into v_next from external_api_private.snapshot_pages
  where snapshot_id=v_snapshot.id and page_number=v_page.page_number+1;
  return jsonb_build_object(
    'generated_at',v_snapshot.generated_at,'query',v_snapshot.query,'rows',v_page.rows,
    'pagination',jsonb_build_object(
      'snapshot_id',v_snapshot.id,'expires_at',v_snapshot.expires_at,'page_size',1000,
      'page_number',v_page.page_number,'total_pages',v_snapshot.total_pages,'total_slots',v_snapshot.total_slots,
      'cursor',v_page.cursor,'has_more',v_next is not null,'next_cursor',v_next
    )
  );
end;
$$;
revoke all on function public.external_api_schedule(text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.external_api_schedule(text,text,integer,text,text,text) to service_role;
comment on function public.external_api_schedule(text,text,integer,text,text,text) is
  '1000-mark pages from an immutable 15-minute export, bound to a reauthenticated integration key; service-role only.';
