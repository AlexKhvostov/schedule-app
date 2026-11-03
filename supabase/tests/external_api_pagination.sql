-- Disposable local database only. Freeze checks deliberately edit synthetic fixtures.
begin;
\ir fixtures/external_api_seed.sql

do $$
begin
  if has_table_privilege('anon','external_api_private.snapshots','SELECT')
    or has_table_privilege('authenticated','external_api_private.snapshot_pages','SELECT')
    or has_function_privilege('authenticated','external_api_private.prune_snapshots()','EXECUTE') then
    raise exception 'snapshot storage exposed';
  end if;
  if not exists(select 1 from cron.job where jobname='external-api-snapshots-prune' and active) then
    raise exception 'snapshot cleanup not scheduled';
  end if;
end;
$$;

do $$
declare
  first_page jsonb;
  next_page jsonb;
  frozen_page jsonb;
  fresh_page jsonb;
  v_cursor text;
  v_snapshot uuid;
  v_deleted uuid;
  v_count integer;
begin
  first_page := public.external_api_schedule(repeat('a',64),'2098-11-01',31);
  v_cursor := first_page->'pagination'->>'next_cursor';
  v_snapshot := (first_page->'pagination'->>'snapshot_id')::uuid;
  next_page := public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor);
  if jsonb_array_length(first_page->'rows') is distinct from 1000
    or jsonb_array_length(next_page->'rows') is distinct from 106
    or next_page->'pagination'->'has_more' is distinct from 'false'::jsonb
    or next_page->'pagination'->'next_cursor' is distinct from 'null'::jsonb
    or first_page->'generated_at' is distinct from next_page->'generated_at'
    or first_page->'query' is distinct from next_page->'query'
    or first_page->'pagination'->'snapshot_id' is distinct from next_page->'pagination'->'snapshot_id' then
    raise exception 'page split or common snapshot metadata wrong';
  end if;
  select count(distinct item->>'id') into v_count
  from jsonb_array_elements((first_page->'rows') || (next_page->'rows')) item;
  if v_count<>1106 then raise exception 'duplicate or missing mark across pages'; end if;
  if public.external_api_schedule(repeat('b',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'snapshot_unavailable' then raise exception 'foreign client read cursor'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-11-01',31,p_cursor=>v_cursor)->'error'->>'field'
    is distinct from 'cursor' then raise exception 'cursor allowed different query'; end if;

  -- Edit, delete and insert between page requests. Frozen data must remain byte-for-byte equal.
  execute 'set local session_replication_role=replica';
  v_deleted := (next_page->'rows'->0->>'id')::uuid;
  delete from public.occupancy where id=v_deleted;
  update public.members set mark_tag='ZZ',mark_bg='#abcdef' where id='aaaaaaaa-0000-4000-8000-000000000001';
  update public.discord_members set guild_nick='ChangedGuild' where discord_id='123456789012345678';
  update public.player_nicks set nick='ChangedGame' where player_id='aaaaaaaa-0000-4000-8000-000000000010';
  update public.profiles set display_name='ChangedProfile' where member_id='aaaaaaaa-0000-4000-8000-000000000001';
  update public.schedule_settings set count_tables=true;
  insert into public.occupancy(member_id,kind_id,slot_date,half,level,tables)
  select 'aaaaaaaa-0000-4000-8000-000000000001',kind_id,'2098-11-30',0,0,4 from public.occupancy
  where member_id='aaaaaaaa-0000-4000-8000-000000000001' limit 1;
  execute 'set local session_replication_role=origin';
  frozen_page := public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor);
  if frozen_page is distinct from next_page then raise exception 'snapshot changed after live edits'; end if;
  if public.external_api_schedule(repeat('a',64),p_cursor=>first_page->'pagination'->>'cursor')
    is distinct from first_page then raise exception 'first page cannot be replayed'; end if;
  fresh_page := public.external_api_schedule(repeat('a',64),'2098-11-01',31);
  if fresh_page->'pagination'->'snapshot_id' = first_page->'pagination'->'snapshot_id' then raise exception 'new request reused stale snapshot'; end if;
  if not exists(select 1 from jsonb_array_elements(fresh_page->'rows') item
    where item->'owner'->>'display_name'='ChangedGuild' and item->'mark'->>'text'='ZZ'
      and item->'owner'->>'game_nick'='ChangedGame' and item->'tables'='3'::jsonb)
    then raise exception 'new export did not capture updates'; end if;

  update external_api_private.clients set revoked_at=now() where key_hash=repeat('a',64);
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'invalid_api_key' then raise exception 'revoked key retained snapshot access'; end if;
  update external_api_private.clients set revoked_at=null,scopes='{}' where key_hash=repeat('a',64);
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'insufficient_scope' then raise exception 'scope not rechecked'; end if;
  update external_api_private.clients set scopes=array['schedule:read'],expires_at=now()-interval '1 second' where key_hash=repeat('a',64);
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'invalid_api_key' then raise exception 'expired key retained snapshot access'; end if;
  update external_api_private.clients set expires_at=null where key_hash=repeat('a',64);
  update external_api_private.snapshots set expires_at=now()-interval '1 second' where id=v_snapshot;
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'snapshot_unavailable' then raise exception 'expired snapshot accessible'; end if;
  perform external_api_private.prune_snapshots();
  if exists(select 1 from external_api_private.snapshots where id=v_snapshot)
    or exists(select 1 from external_api_private.snapshot_pages where snapshot_id=v_snapshot)
    then raise exception 'expired payload was not cleaned'; end if;
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'error'->>'code'
    is distinct from 'snapshot_unavailable' then raise exception 'cleaned cursor error changed'; end if;

  -- A tiny source can still contain an excessively large profile field.
  select count(*) into v_count from external_api_private.snapshots;
  execute 'set local session_replication_role=replica';
  insert into public.profiles(member_id,display_name)
  values('aaaaaaaa-0000-4000-8000-000000000003',repeat('x',5*1024*1024));
  execute 'set local session_replication_role=origin';
  if public.external_api_schedule(repeat('a',64),'2098-11-01',1,'25','nitro')->'error'->>'code'
    is distinct from 'response_too_large' then raise exception 'page byte budget not enforced'; end if;
  if (select count(*) from external_api_private.snapshots)<>v_count then raise exception 'partial snapshot survived rejected export'; end if;
end;
$$;

-- An empty export is one replayable terminal page. Active-export quota is independent
-- from page reads, so clients can finish existing exports while new creation is throttled.
do $$
declare r jsonb; v_client uuid; v_cursor text;
begin
  r:=public.external_api_schedule(repeat('a',64),'2098-12-10',1);
  v_cursor:=r->'pagination'->>'cursor';
  if r->'rows' is distinct from '[]'::jsonb or r->'pagination'->>'total_pages' is distinct from '1'
    or r->'pagination'->'has_more' is distinct from 'false'::jsonb then raise exception 'empty pagination wrong'; end if;
  select id into v_client from external_api_private.clients where key_hash=repeat('a',64);
  insert into external_api_private.snapshots(client_id,query)
    select v_client,'{}'::jsonb from generate_series(1,30);
  if public.external_api_schedule(repeat('a',64),'2098-12-10',1)->'error'->>'code'
    is distinct from 'snapshot_limit' then raise exception 'active snapshot quota ignored'; end if;
  if public.external_api_schedule(repeat('a',64),p_cursor=>v_cursor)->'rows'
    is distinct from '[]'::jsonb then raise exception 'creation quota blocked existing page'; end if;
end;
$$;
rollback;
