-- Disposable LOCAL database. A transaction rolls every synthetic write back.
begin;
\ir fixtures/external_api_seed.sql
-- This read fixture deliberately contains historical marks from blocked owners;
-- exercise feed writes without changing their unrelated admission prerequisites.
alter table public.occupancy disable trigger occupancy_guard;
create function pg_temp.check_sync(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
select pg_temp.check_sync(not has_function_privilege('anon',
  'public.external_api_sync(text,text,integer,text,text,uuid,uuid)','EXECUTE'),'anonymous sync RPC');
select pg_temp.check_sync(not has_function_privilege('authenticated',
  'external_api_private.read_sync(jsonb,jsonb,jsonb)','EXECUTE'),'browser private read');
select pg_temp.check_sync(not has_table_privilege('authenticated',
  'external_api_private.cell_changes','SELECT'),'change addresses exposed');
select pg_temp.check_sync(not has_table_privilege('anon',
  'external_api_private.sync_states','SELECT'),'cursor registry exposed');
select pg_temp.check_sync(not has_function_privilege('service_role',
  'external_api_private.prune_sync()','EXECUTE'),'cleanup exposed');

do $$
declare a jsonb; b jsonb; c jsonb; cur uuid; other uuid; page_token uuid; kind uuid; person uuid;
begin
  a:=public.external_api_sync(repeat('a',64),'2098-11-01',31);
  perform pg_temp.check_sync(a->>'mode'='full' and a->>'cursor' is null
    and a->>'has_more'='true' and jsonb_array_length(a->'items')=1000,'first full page');
  perform pg_temp.check_sync(not (a::text like '%auth_user_id%') and not (a::text like '%key_hash%'), 'private fields');
  page_token:=(a->>'next_page')::uuid;
  b:=public.external_api_sync(repeat('a',64),p_page=>page_token);
  perform pg_temp.check_sync(jsonb_array_length(b->'items')=109 and b->>'has_more'='false','complete 1106 cells plus 3 people');
  cur:=(b->>'cursor')::uuid;
  perform pg_temp.check_sync(cur is not null,'final sync cursor');
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(c->>'mode'='unchanged' and c->'items'='[]' and (c->>'cursor')::uuid=cur,'idle response');

  -- Same transaction fixture: force a new test revision (real writes use separate
  -- transactions; commit-order behavior is tested with independent connections).
  update schedule_private.sync_versions set changed_in=0;
  delete from public.occupancy where slot_date='2098-11-01' and half=0;
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(c->>'mode'='delta' and jsonb_array_length(c->'items')=1
    and c->'items'->0->>'type'='cell' and c->'items'->0->'state'='null','delete returns one cleared cell');
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>cur)=c,'frozen retry');
  cur:=(c->>'cursor')::uuid;
  update schedule_private.sync_versions set changed_in=0;
  update public.discord_members set guild_nick='Renamed' where discord_id='123456789012345678';
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(jsonb_array_length(c->'items')=1 and c->'items'->0->>'type'='person'
    and c->'items'->0->'state'->>'name'='Renamed','name only: no cells repeated');
  cur:=(c->>'cursor')::uuid;

  select kind_id,member_id into kind,person from public.occupancy where slot_date='2098-11-01' and half=1 limit 1;
  update schedule_private.sync_versions set changed_in=0;
  update public.occupancy set level=2 where kind_id=kind and slot_date='2098-11-01' and half=1;
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(jsonb_array_length(c->'items')=2 and
    (select count(*) from jsonb_array_elements(c->'items') x where x->'state'='null')=1,
    'move clears the old address and sets the new one');
  cur:=(c->>'cursor')::uuid;

  -- Multiple writes to the same address collapse to its final live state.
  select kind_id,member_id into kind,person from public.occupancy where slot_date='2098-11-01' and half=1 limit 1;
  update schedule_private.sync_versions set changed_in=0;
  update public.occupancy set tables=5 where kind_id=kind and slot_date='2098-11-01' and half=1;
  update public.occupancy set tables=7 where kind_id=kind and slot_date='2098-11-01' and half=1;
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(jsonb_array_length(c->'items')=1 and c->'items'->0->>'type'='cell','coalesced cell update');
  cur:=(c->>'cursor')::uuid;

  -- Last occupancy removal also evicts the now-unreferenced dictionary entry.
  update schedule_private.sync_versions set changed_in=0;
  delete from public.occupancy where member_id='aaaaaaaa-0000-4000-8000-000000000003';
  c:=public.external_api_sync(repeat('a',64),p_cursor=>cur);
  perform pg_temp.check_sync(jsonb_array_length(c->'items')=2
    and c->'items'->0->>'type'='person' and c->'items'->0->'state'='null'
    and c->'items'->1->'state'='null','last-slot and dictionary deletion');
  cur:=(c->>'cursor')::uuid;

  -- Original pages remain unchanged even after live deletes and metadata edits.
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_page=>page_token)=b,'immutable pages');
  c:=public.external_api_sync(repeat('a',64),'2097-01-01',31);
  perform pg_temp.check_sync(c->>'mode'='full' and c->'items'='[]' and c->>'cursor' is not null,'empty full');
  perform pg_temp.check_sync(public.external_api_sync(repeat('c',64),'2098-11-01',31)->'error'->>'code'='insufficient_scope','scope');
  perform pg_temp.check_sync(public.external_api_sync(repeat('d',64),'2098-11-01',31)->'error'->>'code'='invalid_api_key','revocation');
  insert into external_api_private.clients(name,key_hash) values('foreign',repeat('f',64)) returning id into other;
  perform pg_temp.check_sync(public.external_api_sync(repeat('f',64),p_cursor=>cur)->'error'->>'code'='resync_required','foreign cursor');
  perform pg_temp.check_sync(public.external_api_sync(repeat('f',64),p_page=>page_token)->'error'->>'code'='resync_required','foreign page');
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>cur,p_days=>1)->'error'->>'code'='validation_error','mixed query');

  update schedule_private.sync_versions set changed_in=0;
  update public.limits set sort=sort+1 where id='50';
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>cur)->'error'->>'code'='resync_required','config reset');
  -- Retention rotates an epoch instead of silently losing cleared addresses.
  c:=public.external_api_sync(repeat('a',64),'2098-11-01',1);
  cur:=(c->>'cursor')::uuid;
  update external_api_private.cell_changes set changed_at=clock_timestamp()-interval '31 days';
  perform external_api_private.prune_sync();
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>cur)->'error'->>'code'='resync_required','prune reset');
  c:=public.external_api_sync(repeat('a',64),'2097-01-01',1);
  cur:=(c->>'cursor')::uuid;
  update external_api_private.sync_states set expires_at=clock_timestamp()-interval '1 second' where id=cur;
  perform pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>cur)->'error'->>'code'='resync_required','expired checkpoint');
  perform public.external_api_sync(repeat('b',64),'2097-01-01',1);
  perform public.external_api_sync(repeat('b',64),'2097-01-01',1);
  perform pg_temp.check_sync(public.external_api_sync(repeat('b',64),'2097-01-01',1)->'error'->>'code'='rate_limited','shared key quota');
end;
$$;
-- Security-invoker execution must also work as the actual upstream role.
set local role service_role;
select pg_temp.check_sync(public.external_api_sync(repeat('a',64),'2097-01-01',1)->>'mode'='full','service-role access');
reset role;

-- Prove that idle polling does not need a schedule/occupancy read at all.
create temporary table sync_idle_token as select
  (public.external_api_sync(repeat('a',64),'2097-01-01',1)->>'cursor')::uuid as id;
grant select on sync_idle_token to service_role;
revoke select on public.occupancy from service_role;
set local role service_role;
select pg_temp.check_sync(public.external_api_sync(repeat('a',64),p_cursor=>(select id from sync_idle_token))
  ->>'mode'='unchanged','idle path read occupancy');
reset role;
grant select on public.occupancy to service_role;

do $$ declare before_count integer; response jsonb; begin
  select count(*) into before_count from external_api_private.sync_states;
  update schedule_private.sync_versions set changed_in=0;
  update public.discord_members set guild_nick=repeat('x',4194304) where discord_id='123456789012345678';
  response:=public.external_api_sync(repeat('a',64),'2098-11-01',1);
  perform pg_temp.check_sync(response->'error'->>'code'='response_too_large','oversized page');
  perform pg_temp.check_sync((select count(*) from external_api_private.sync_states)=before_count,'oversized response left partial state');
  update external_api_private.sync_states set stored_bytes=67108864;
  response:=public.external_api_sync(repeat('a',64),'2097-01-01',1);
  perform pg_temp.check_sync(response->'error'->>'code'='snapshot_limit','state byte quota');
  perform pg_temp.check_sync((select count(*) from external_api_private.sync_states)=before_count,'quota left partial state');
end $$;
rollback;
