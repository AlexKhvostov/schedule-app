-- Only run in a disposable local database. Fixtures and quota changes are rolled back.
begin;

do $$
begin
  if has_schema_privilege('anon','external_api_private','USAGE')
     or has_table_privilege('anon','external_api_private.clients','SELECT')
     or has_table_privilege('authenticated','external_api_private.clients','SELECT')
     or has_function_privilege('anon','public.external_api_schedule(text,text,integer,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.external_api_schedule(text,text,integer,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.external_api_schedule(text,text,integer,text,text,text)','EXECUTE') then
    raise exception 'external API privilege boundary is broken';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.external_api_schedule(text,text,integer,text,text,text)'::regprocedure) then
    raise exception 'external API must not run as SECURITY DEFINER';
  end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.external_api_schedule(repeat('a',64),'2098-11-01',3);
    raise exception 'anonymous RPC unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  begin
    perform public.external_api_schedule(repeat('a',64),'2098-11-01',3);
    raise exception 'user RPC unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

\ir fixtures/external_api_seed.sql

set local role service_role;
do $$
declare
  r jsonb;
  row1 jsonb;
begin
  r := public.external_api_schedule(repeat('a',64),'2098-11-01',31);
  if jsonb_array_length(r->'rows') is distinct from 1000 or (r->'pagination'->>'total_slots')::integer is distinct from 1106 then raise exception 'truncated or missing rows: %',r->'error'; end if;
  row1 := (select value from jsonb_array_elements(r->'rows') where value->'owner'->>'member_id'='aaaaaaaa-0000-4000-8000-000000000001' limit 1);
  if row1->'owner'->>'discord_id' is distinct from '123456789012345678'
     or jsonb_typeof(row1->'owner'->'discord_id') is distinct from 'string'
     or row1->'owner'->>'game_nick' is distinct from 'CurrentNick'
     or row1->'owner'->>'display_name' is distinct from 'GuildNick'
     or row1->'owner'->>'profile_name' is distinct from 'ProfileName'
     or row1->'tables' is distinct from 'null'::jsonb then raise exception 'owner / tables projection wrong'; end if;
  if jsonb_array_length(public.external_api_schedule(repeat('a',64),'2098-11-01',3)->'rows') is distinct from 146 then raise exception 'inclusive days wrong'; end if;
  if jsonb_array_length(public.external_api_schedule(repeat('a',64),'2098-11-01',3,'50')->'rows') is distinct from 145 then raise exception 'limit filter wrong'; end if;
  if jsonb_array_length(public.external_api_schedule(repeat('a',64),'2098-11-01',3,null,'nitro')->'rows') is distinct from 145 then raise exception 'variant filter wrong'; end if;
  if jsonb_array_length(public.external_api_schedule(repeat('a',64),'2098-11-01',3,'50','nitro')->'rows') is distinct from 144 then raise exception 'combined filters wrong'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-12-01',3)->'rows' is distinct from '[]'::jsonb then raise exception 'empty range wrong'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-11-01',3,'0.50')->'rows' is distinct from '[]'::jsonb then raise exception 'valid fractional limit rejected'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-11-01',32)->'error'->>'field' is distinct from 'days' then raise exception 'days validation missing'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-02-29',1)->'error'->>'field' is distinct from 'date' then raise exception 'date validation missing'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-11-01',1,'999')->'error'->>'field' is distinct from 'limit' then raise exception 'limit validation missing'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-11-01',1,null,'bad')->'error'->>'field' is distinct from 'variant' then raise exception 'variant validation missing'; end if;
  if public.external_api_schedule(repeat('f',64),'2098-11-01',1)->'error'->>'code' is distinct from 'invalid_api_key' then raise exception 'unknown key accepted'; end if;
  if public.external_api_schedule(repeat('c',64),'2098-11-01',1)->'error'->>'code' is distinct from 'insufficient_scope' then raise exception 'scope ignored'; end if;
  if public.external_api_schedule(repeat('d',64),'2098-11-01',1)->'error'->>'code' is distinct from 'invalid_api_key' then raise exception 'revoked key accepted'; end if;
  if public.external_api_schedule(repeat('e',64),'2098-11-01',1)->'error'->>'code' is distinct from 'invalid_api_key' then raise exception 'expired key accepted'; end if;
  perform public.external_api_schedule(repeat('b',64),'2098-12-01',1);
  perform public.external_api_schedule(repeat('b',64),'2098-12-01',1);
  r := public.external_api_schedule(repeat('b',64),'2098-12-01',1);
  if r->'error'->>'code' is distinct from 'rate_limited' or (r->'error'->>'retry_after')::integer < 1 then raise exception 'quota not enforced'; end if;
  update external_api_private.clients set revoked_at=now() where key_hash=repeat('a',64);
  if public.external_api_schedule(repeat('a',64),'2098-11-01',1)->'error'->>'code' is distinct from 'invalid_api_key' then raise exception 'revocation not immediate'; end if;
end;
$$;
reset role;

-- Explicit overload errors, rather than a silently truncated successful result.
set local session_replication_role = replica;
insert into members(id,public_code,access_status,mark_tag)
select md5('api-large-'||n)::uuid,'API-LARGE-'||n,'active',chr(65+n)||'X'
from generate_series(1,8) n;
insert into occupancy(member_id,kind_id,slot_date,half,level,tables)
select md5('api-large-'||n)::uuid,k.id,date '2099-01-01'+d,h,(n-1)%6,1
from generate_series(1,8) n
join schedule_kinds k on k.variant_id=case when n<=6 then 'nitro' else 'regular' end and k.limit_id='50'
join rooms r on r.id=k.room_id and r.slug='winamax'
cross join generate_series(0,30) d cross join generate_series(0,47) h;
update schedule_settings set count_tables=true;
set local session_replication_role = origin;
update external_api_private.clients set revoked_at=null where key_hash=repeat('a',64);
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.external_api_schedule(repeat('a',64),'2099-01-01',31);
  if (r->'pagination'->>'total_slots')::integer is distinct from 11904 or jsonb_array_length(r->'rows') is distinct from 1000 then raise exception 'large export did not paginate'; end if;
  r := public.external_api_schedule(repeat('a',64),'2098-11-01',1,'50','nitro');
  if r->'rows'->0->>'tables' is distinct from '3' then raise exception 'stored tables not exposed when enabled'; end if;
  update external_api_private.failed_auth set window_start=date_trunc('minute',clock_timestamp()),request_count=300;
  r := public.external_api_schedule(repeat('f',64),'2098-11-01',1);
  if r->'error'->>'code' is distinct from 'rate_limited' then raise exception 'failed authentication bucket ignored'; end if;
  if public.external_api_schedule(repeat('a',64),'2098-12-01',1)->'rows' is distinct from '[]'::jsonb then
    raise exception 'invalid-key throttling blocked valid client';
  end if;
end;
$$;
reset role;
rollback;
