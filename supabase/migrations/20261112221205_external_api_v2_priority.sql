-- Reuse the club's active calculated Nitro50-100 cache; no new rating formula.
-- Only the authorized API wrapper can warm this existing cache. Idle polls do
-- not rebuild it or read distance/occupancy rows. Active selector is held stable.
create function external_api_private.prepare_priority() returns void
language plpgsql security definer set search_path='' as $$
declare v_period date;
begin
  select active_period into strict v_period from public.priority_settings where id for share;
  if not exists(select 1 from public.priority_rating_cache where period_start=v_period
    and variant_id='nitro' and limit_group='50-100' and not dirty and payload is not null) then
    perform public.priority_slice_source(v_period,'nitro','50-100');
  end if;
end;
$$;
revoke all on function external_api_private.prepare_priority() from public,anon,authenticated;
grant execute on function external_api_private.prepare_priority() to service_role;

create function external_api_private.read_priority() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('period_start',s.active_period,
    'revision',s.active_period::text||':'||(c.payload->>'revision'),
    'people',coalesce((select jsonb_object_agg(p->>'memberId',jsonb_build_object(
      'core',p->'vipNitro','score',p->'calculation'->'total','excluded',p->'excludedNitro'))
      from jsonb_array_elements(c.payload->'people') p),'{}'))
  from public.priority_settings s join public.priority_rating_cache c on c.period_start=s.active_period
    and c.variant_id='nitro' and c.limit_group='50-100'
  where s.id and not c.dirty and c.payload is not null;
$$;
revoke all on function external_api_private.read_priority() from public,anon,authenticated;
grant execute on function external_api_private.read_priority() to service_role;

create or replace function external_api_private.read_sync(p_query jsonb,p_versions jsonb,p_people jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_date date:=(p_query->>'date')::date; v_days integer:=(p_query->>'days')::integer;
  v_priority jsonb; v_versions jsonb; v_items jsonb; v_people jsonb; v_lines jsonb; v_full boolean:=p_versions is null;
begin
  v_priority:=external_api_private.read_priority();
  if v_priority is null then return jsonb_build_object('error',jsonb_build_object('code','priority_unavailable')); end if;
  select coalesce(jsonb_object_agg(v.key,v.revision),'{}') into v_versions
  from schedule_private.sync_versions v where v.key in ('config','directory','external-api-epoch') or
    (v.key>='slots:'||v_date::text||':' and v.key<'slots:'||(v_date+v_days)::text||':' and
      exists(select 1 from public.schedule_kinds k join public.rooms r on r.id=k.room_id
        where r.slug='winamax' and k.variant_id in ('nitro','regular')
          and (p_query->>'variant' is null or k.variant_id=p_query->>'variant')
          and (p_query->>'limit' is null or k.limit_id=p_query->>'limit')
          and k.id::text=split_part(v.key,':',3)));
  v_versions:=v_versions||jsonb_build_object('priority_nitro_50_100',v_priority->'revision');
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
      and (case when v.key like 'slots:%' then v.value::bigint end)>coalesce((p_versions->>v.key)::bigint,0)
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
  ), faces as materialized (
    select m.id::text as id,jsonb_build_object('name',
      coalesce(nullif(d.guild_nick,''),nullif(i.guild_nick,''),nullif(d.global_name,''),
        nullif(i.display_name,''),nullif(d.username,''),nullif(i.username,''),m.public_code),
      'discord_id',i.provider_uid,'mark',jsonb_build_object(
        'text',m.mark_tag,'background',m.mark_bg,'foreground',m.mark_fg)) as value,
      coalesce((v_priority->'people'->m.id::text->>'core')::integer,0) as core,
      coalesce((v_priority->'people'->m.id::text->>'score')::numeric,0) as score,
      coalesce((v_priority->'people'->m.id::text->>'excluded')::boolean,false) as excluded
    from referenced r join public.members m on m.id=r.member_id
    left join lateral (select ident.* from public.identities ident
      where ident.member_id=m.id and ident.provider='discord'
      order by ident.updated_at desc,ident.id desc limit 1) i on true
    left join public.discord_members d on d.discord_id=i.provider_uid
  ), ranked as materialized (
    select *,row_number() over(order by excluded,
      case when not excluded and core>0 then core else 2147483647 end,
      score desc,lower(value->>'name') collate "C",id) as position from faces
  ), people as materialized (
    select id,position,value||jsonb_build_object('priority',jsonb_build_object(
      'order',position,'core',core,'score',score,'excluded',excluded,
      'period_start',v_priority->'period_start','variant','nitro','limit_group','50-100')) as value from ranked
  ), items as (
    select '0:'||lpad(position::text,12,'0')||':'||id as sort,jsonb_build_object('type','person','id',id,'state',value) as value
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

create or replace function public.external_api_sync(p_key_hash text,p_date text default null,
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
      perform external_api_private.prepare_priority();
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
