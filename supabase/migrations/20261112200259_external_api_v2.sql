-- API v2 uses the existing commit-ordered partition revisions. No audit scan,
-- no sequence watermark and no second writable copy of the schedule.
create table external_api_private.cell_changes (
  kind_id uuid not null, slot_date date not null,
  half smallint not null check(half between 0 and 47),
  level smallint not null check(level between 0 and 5), revision bigint not null,
  changed_at timestamptz not null default clock_timestamp(),
  primary key(kind_id,slot_date,half,level)
);
create index cell_changes_expiry on external_api_private.cell_changes(changed_at);
alter table external_api_private.cell_changes enable row level security;
revoke all on external_api_private.cell_changes from public,anon,authenticated;
grant select on external_api_private.cell_changes to service_role;
insert into schedule_private.sync_versions(key) values('external-api-epoch');

create or replace function schedule_private.notify_slots() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed record; cell record; v_revision bigint; v_rows jsonb;
begin
  if TG_OP='UPDATE' and to_jsonb(old)=to_jsonb(new) then return null; end if;
  v_rows:=case when TG_OP='INSERT' then jsonb_build_array(to_jsonb(new))
    when TG_OP='DELETE' then jsonb_build_array(to_jsonb(old))
    else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end;
  for changed in select distinct x.slot_date,x.kind_id
    from jsonb_to_recordset(v_rows) x(slot_date date,kind_id uuid) order by x.slot_date,x.kind_id
  loop
    if schedule_private.bump_version('slots:'||changed.slot_date::text||':'||changed.kind_id::text,
      'slots',jsonb_build_object('date',changed.slot_date,'kind_id',changed.kind_id)) then
      perform realtime.send(jsonb_build_object('date',changed.slot_date,'kind_id',changed.kind_id),
        'slots','schedule:changes',true);
    end if;
    select revision into strict v_revision from schedule_private.sync_versions
      where key='slots:'||changed.slot_date::text||':'||changed.kind_id::text;
    for cell in select distinct x.half,x.level from jsonb_to_recordset(v_rows)
      x(slot_date date,kind_id uuid,half smallint,level smallint)
      where x.slot_date=changed.slot_date and x.kind_id=changed.kind_id
    loop
      insert into external_api_private.cell_changes(kind_id,slot_date,half,level,revision)
        values(changed.kind_id,changed.slot_date,cell.half,cell.level,v_revision)
      on conflict(kind_id,slot_date,half,level) do update
        set revision=excluded.revision,changed_at=clock_timestamp();
    end loop;
  end loop;
  return null;
end;
$$;

-- These catalogs were not dependencies of the browser's original config counter.
create trigger external_api_limits_version after insert or update or delete on public.limits
for each row execute function schedule_private.notify_domains('config');
create trigger external_api_rooms_version after insert or update or delete on public.rooms
for each row execute function schedule_private.notify_domains('config');

create table external_api_private.sync_states (
  id uuid primary key default gen_random_uuid(), client_id uuid not null
    references external_api_private.clients(id) on delete cascade,
  query jsonb not null, versions jsonb not null, people jsonb not null,
  stored_bytes bigint not null,
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours'
);
create index sync_states_expiry on external_api_private.sync_states(client_id,expires_at);
create table external_api_private.sync_batches (
  id uuid primary key default gen_random_uuid(), client_id uuid not null
    references external_api_private.clients(id) on delete cascade,
  state_id uuid not null references external_api_private.sync_states(id) on delete cascade,
  source_id uuid references external_api_private.sync_states(id) on delete cascade,
  metadata jsonb not null, stored_bytes bigint not null default 0,
  expires_at timestamptz not null default clock_timestamp()+interval '15 minutes'
);
create unique index sync_batches_source on external_api_private.sync_batches(source_id)
where source_id is not null;
create index sync_batches_expiry on external_api_private.sync_batches(expires_at);
create table external_api_private.sync_pages (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null
    references external_api_private.sync_batches(id) on delete cascade,
  number integer not null, items jsonb not null, unique(batch_id,number)
);
alter table external_api_private.sync_states enable row level security;
alter table external_api_private.sync_batches enable row level security;
alter table external_api_private.sync_pages enable row level security;
revoke all on external_api_private.sync_states,external_api_private.sync_batches,
  external_api_private.sync_pages from public,anon,authenticated;
grant select,insert,update,delete on external_api_private.sync_states,
  external_api_private.sync_batches,external_api_private.sync_pages to service_role;
grant usage on schema schedule_private to service_role;
grant select on schedule_private.sync_versions to service_role;

-- STABLE makes ALL nested reads use the calling statement's single MVCC snapshot.
-- Versions, live state, cleared cells and metadata can never straddle two commits.
create function external_api_private.read_sync(p_query jsonb,p_versions jsonb,p_people jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_date date:=(p_query->>'date')::date; v_days integer:=(p_query->>'days')::integer;
  v_versions jsonb; v_items jsonb; v_people jsonb; v_lines jsonb; v_full boolean:=p_versions is null;
begin
  select coalesce(jsonb_object_agg(v.key,v.revision),'{}') into v_versions
  from schedule_private.sync_versions v where v.key in ('config','directory','external-api-epoch') or
    (v.key>='slots:'||v_date::text||':' and v.key<'slots:'||(v_date+v_days)::text||':' and
      exists(select 1 from public.schedule_kinds k join public.rooms r on r.id=k.room_id
        where r.slug='winamax' and k.variant_id in ('nitro','regular')
          and (p_query->>'variant' is null or k.variant_id=p_query->>'variant')
          and (p_query->>'limit' is null or k.limit_id=p_query->>'limit')
          and k.id::text=split_part(v.key,':',3)));
  if not v_full and (v_versions->'config' is distinct from p_versions->'config' or
    v_versions->'external-api-epoch' is distinct from p_versions->'external-api-epoch') then
    return jsonb_build_object('error',jsonb_build_object('code','resync_required'));
  end if;
  if v_versions=p_versions then
    return jsonb_build_object('unchanged',true);
  end if;
  with kinds as materialized (
    select k.* from public.schedule_kinds k join public.rooms r on r.id=k.room_id
    where r.slug='winamax' and k.variant_id in ('nitro','regular')
      and (p_query->>'variant' is null or k.variant_id=p_query->>'variant')
      and (p_query->>'limit' is null or k.limit_id=p_query->>'limit')
  ), changed_partitions as materialized (
    select split_part(v.key,':',2)::date as slot_date,split_part(v.key,':',3)::uuid as kind_id,
      coalesce((p_versions->>v.key)::bigint,0) as from_revision
    from jsonb_each_text(v_versions) v where not v_full and v.key like 'slots:%'
      and v.value::bigint>coalesce((p_versions->>v.key)::bigint,0)
  ), addresses as materialized (
    select o.kind_id,o.slot_date,o.half,o.level from public.occupancy o join kinds k on k.id=o.kind_id
    where v_full and o.slot_date>=v_date and o.slot_date<v_date+v_days
    union all
    select c.kind_id,c.slot_date,c.half,c.level from changed_partitions changed
      join external_api_private.cell_changes c using(kind_id,slot_date)
      where c.revision>changed.from_revision
  ), cells as materialized (
    select a.*,o.member_id,o.tables from addresses a
    left join public.occupancy o using(kind_id,slot_date,half,level)
    order by a.slot_date,a.kind_id,a.level,a.half limit 250001
  ), referenced as materialized (
    select distinct o.member_id from public.occupancy o join kinds k on k.id=o.kind_id
    where o.slot_date>=v_date and o.slot_date<v_date+v_days limit 250001
  ), people as materialized (
    select m.id::text as id,jsonb_build_object('name',
      coalesce(nullif(d.guild_nick,''),nullif(i.guild_nick,''),nullif(d.global_name,''),
        nullif(i.display_name,''),nullif(d.username,''),nullif(i.username,''),m.public_code),
      'discord_id',i.provider_uid,'mark',jsonb_build_object(
        'text',m.mark_tag,'background',m.mark_bg,'foreground',m.mark_fg)) as value
    from referenced r join public.members m on m.id=r.member_id
    left join lateral (select ident.* from public.identities ident
      where ident.member_id=m.id and ident.provider='discord'
      order by ident.updated_at desc,ident.id desc limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
  ), items as (
    select '0:'||id as sort,jsonb_build_object('type','person','id',id,'state',value) as value
      from people where v_full or p_people->id is distinct from to_jsonb(md5(value::text))
    union all
    select '0:'||id,jsonb_build_object('type','person','id',id,'state',null)
      from jsonb_object_keys(coalesce(p_people,'{}')) previous(id)
      where not exists(select 1 from people p where p.id=previous.id)
    union all
    select '1:'||slot_date::text||':'||kind_id::text||':'||level||':'||half,
      jsonb_build_object('type','cell','date',slot_date,'line_id',kind_id::text||':'||level,'half',half,
        'state',case when member_id is null then null else jsonb_build_object('person_id',member_id,
          'tables',case when coalesce((select count_tables from public.schedule_settings limit 1),false)
            then tables else null end) end) from cells
  )
  select coalesce((select jsonb_object_agg(id,to_jsonb(md5(value::text))) from people),'{}'),
    coalesce((select jsonb_agg(value order by sort) from items),'[]'),
    coalesce((select jsonb_agg(jsonb_build_object('id',k.id::text||':'||n,'number',n+1,
      'variant',k.variant_id,'limit',k.limit_id) order by k.id,n)
      from kinds k cross join generate_series(0,5) n where v_full),'[]')
  into v_people,v_items,v_lines;
  return jsonb_build_object('versions',v_versions,'people',v_people,'items',v_items,'lines',v_lines);
end;
$$;
revoke all on function external_api_private.read_sync(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function external_api_private.read_sync(jsonb,jsonb,jsonb) to service_role;

create function public.external_api_sync(p_key_hash text,p_date text default null,
  p_days integer default null,p_limit text default null,p_variant text default null,
  p_cursor uuid default null,p_page uuid default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare v_error jsonb; v_client uuid; v_old external_api_private.sync_states%rowtype;
  v_batch external_api_private.sync_batches%rowtype; v_page external_api_private.sync_pages%rowtype;
  v_query jsonb; v_date date; v_read jsonb; v_items jsonb; v_state uuid; v_next uuid;
begin
  v_error:=external_api_private.authorize(p_key_hash,'schedule:read');
  if v_error is not null then return jsonb_build_object('error',v_error); end if;
  select id into strict v_client from external_api_private.clients where key_hash=p_key_hash;
  if (p_cursor is not null and p_page is not null) or
    ((p_cursor is not null or p_page is not null) and
      (p_date is not null or p_days is not null or p_limit is not null or p_variant is not null)) then
    return jsonb_build_object('error',jsonb_build_object('code','validation_error'));
  end if;
  delete from external_api_private.sync_batches where client_id=v_client and expires_at<=clock_timestamp();
  delete from external_api_private.sync_states where client_id=v_client and expires_at<=clock_timestamp();
  if p_page is not null then
    select p.* into v_page from external_api_private.sync_pages p
      join external_api_private.sync_batches b on b.id=p.batch_id
      where p.id=p_page and b.client_id=v_client and b.expires_at>clock_timestamp();
    if not found then return jsonb_build_object('error',jsonb_build_object('code','resync_required')); end if;
    select * into v_batch from external_api_private.sync_batches where id=v_page.batch_id for share;
    if not found then return jsonb_build_object('error',jsonb_build_object('code','resync_required')); end if;
  else
    if p_cursor is not null then
      select * into v_old from external_api_private.sync_states
        where id=p_cursor and client_id=v_client and expires_at>clock_timestamp() for share;
      if not found then return jsonb_build_object('error',jsonb_build_object('code','resync_required')); end if;
      v_query:=v_old.query;
      select * into v_batch from external_api_private.sync_batches
        where source_id=p_cursor and expires_at>clock_timestamp() for share;
      if found then select * into strict v_page from external_api_private.sync_pages where batch_id=v_batch.id and number=1; end if;
    else
      begin
        v_date:=p_date::date;
        if p_date is null or p_date!~'^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or p_date<>v_date::text
          or p_days is null or p_days not between 1 and 31 or v_date+p_days>date '9999-12-31'
          or (p_variant is not null and p_variant not in ('nitro','regular'))
          or (p_limit is not null and not exists(select 1 from public.limits where id=p_limit)) then
          raise exception 'invalid query' using errcode='22023';
        end if;
      exception when data_exception then
        return jsonb_build_object('error',jsonb_build_object('code','validation_error'));
      end;
      v_query:=jsonb_build_object('date',p_date,'days',p_days,'limit',p_limit,'variant',p_variant);
    end if;
    if v_page.id is null then
      v_read:=external_api_private.read_sync(v_query,v_old.versions,v_old.people);
      if v_read?'error' then return v_read; end if;
      if v_read->>'unchanged'='true' then
        update external_api_private.sync_states set expires_at=clock_timestamp()+interval '24 hours' where id=p_cursor;
        return jsonb_build_object('api_version','2','mode','unchanged','cursor',p_cursor,
          'has_more',false,'next_page',null,'items','[]'::jsonb);
      end if;
      v_items:=v_read->'items';
      if jsonb_array_length(v_items)>250000 or octet_length(v_items::text)>33554432 then
        return jsonb_build_object('error',jsonb_build_object('code','response_too_large'));
      end if;
      if (select count(*) from external_api_private.sync_states where client_id=v_client)>=600 or
        (select coalesce(sum(stored_bytes),0) from external_api_private.sync_states where client_id=v_client)
          +octet_length((v_read->'versions')::text)+octet_length((v_read->'people')::text)>67108864 or
        (select coalesce(sum(stored_bytes),0) from external_api_private.sync_batches where client_id=v_client)
          +octet_length(v_items::text)+octet_length((v_read->'lines')::text)>67108864 then
        return jsonb_build_object('error',jsonb_build_object('code','snapshot_limit','retry_after',900));
      end if;
      -- Rejection must roll back all batch/state rows but keep the auth/quota debit.
      begin
        insert into external_api_private.sync_states(client_id,query,versions,people,stored_bytes)
          values(v_client,v_query,v_read->'versions',v_read->'people',
            octet_length((v_read->'versions')::text)+octet_length((v_read->'people')::text)) returning id into v_state;
        insert into external_api_private.sync_batches(client_id,state_id,source_id,metadata)
          values(v_client,v_state,p_cursor,jsonb_build_object('api_version','2',
            'mode',case when p_cursor is null then 'full' when v_items='[]' then 'unchanged' else 'delta' end,
            'generated_at',clock_timestamp(),'query',v_query,'timezone','Europe/Madrid','slot_minutes',30,
            'lines',v_read->'lines')) returning * into v_batch;
        insert into external_api_private.sync_pages(batch_id,number,items)
          select v_batch.id,((ordinality-1)/1000+1)::integer,jsonb_agg(value order by ordinality)
          from jsonb_array_elements(v_items) with ordinality group by (ordinality-1)/1000;
        if v_items='[]' then insert into external_api_private.sync_pages(batch_id,number,items)
          values(v_batch.id,1,'[]'); end if;
        update external_api_private.sync_batches set stored_bytes=octet_length(v_items::text)
          +octet_length(metadata::text)*(select count(*) from external_api_private.sync_pages where batch_id=v_batch.id)
          where id=v_batch.id returning * into v_batch;
        if (select coalesce(sum(stored_bytes),0) from external_api_private.sync_batches where client_id=v_client)>67108864 then
          raise exception 'batch quota' using errcode='54001'; end if;
        if exists(select 1 from external_api_private.sync_pages where batch_id=v_batch.id
          and octet_length(items::text)+octet_length(v_batch.metadata::text)>4194304) then
          raise exception 'page too large' using errcode='54000';
        end if;
        select * into strict v_page from external_api_private.sync_pages where batch_id=v_batch.id and number=1;
      exception when sqlstate '54001' then
        return jsonb_build_object('error',jsonb_build_object('code','snapshot_limit','retry_after',900));
      when program_limit_exceeded then
        return jsonb_build_object('error',jsonb_build_object('code','response_too_large'));
      end;
    end if;
  end if;
  select id into v_next from external_api_private.sync_pages where batch_id=v_batch.id and number=v_page.number+1;
  return v_batch.metadata||jsonb_build_object('batch_id',v_batch.id,'page',v_page.number,
    'items',v_page.items,'has_more',v_next is not null,'next_page',v_next,
    'expires_at',v_batch.expires_at,'cursor',case when v_next is null then v_batch.state_id else null end);
end;
$$;
revoke all on function public.external_api_sync(text,text,integer,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.external_api_sync(text,text,integer,text,text,uuid,uuid) to service_role;

create function external_api_private.prune_sync() returns void
language plpgsql security invoker set search_path='' as $$
begin
  delete from external_api_private.sync_batches where expires_at<=clock_timestamp();
  delete from external_api_private.sync_states where expires_at<=clock_timestamp();
  -- Any cursor that predates tombstone removal is rejected by its epoch, including
  -- a full snapshot read concurrently with this cleanup but stored after it commits.
  delete from external_api_private.cell_changes where changed_at<clock_timestamp()-interval '30 days';
  if found then update schedule_private.sync_versions set revision=revision+1,
    changed_in=txid_current() where key='external-api-epoch'; end if;
end;
$$;
revoke all on function external_api_private.prune_sync() from public,anon,authenticated,service_role;
select cron.schedule('external-api-v2-prune','17 * * * *','select external_api_private.prune_sync()');
