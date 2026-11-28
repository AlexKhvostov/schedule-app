-- Disposable local database only. Every fixture and mutation is rolled back.
begin;
insert into auth.users (id, aud, role, email, created_at, updated_at) values
 ('cccccccc-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'api-root@example.invalid', now(), now()),
 ('cccccccc-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'api-reader@example.invalid', now(), now());
insert into public.members (id, auth_user_id, public_code, access_status, mark_tag) values
 ('cccccccc-1000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','API-ROOT','active','AR'),
 ('cccccccc-1000-4000-8000-000000000002','cccccccc-0000-4000-8000-000000000002','API-READ','active','AZ');
insert into public.member_roles (member_id, role_id) values ('cccccccc-1000-4000-8000-000000000001','root');

do $$ begin
  if has_function_privilege('anon','public.root_api_clients(text,uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','external_api_private.manage_clients(text,uuid,jsonb)','EXECUTE')
    or has_table_privilege('authenticated','external_api_private.clients','SELECT')
    or has_table_privilege('authenticated','external_api_private.clients','INSERT')
    or has_table_privilege('authenticated','external_api_private.clients','UPDATE')
    or has_function_privilege('authenticated','external_api_private.authorize(text,text)','EXECUTE')
    or has_function_privilege('authenticated','external_api_private.prune_snapshots()','EXECUTE') then
    raise exception 'admin API grants broken';
  end if;
end $$;

set local role anon;
do $$ begin
  begin perform public.root_api_clients(); raise exception 'anonymous allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.root_api_clients(); raise exception 'missing uid allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.root_api_clients(); raise exception 'non-root list allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.root_api_clients('create','cccccccc-2000-4000-8000-000000000001','{}'); raise exception 'non-root create allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000001'); raise exception 'non-root reveal allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.root_api_clients('revoke','cccccccc-2000-4000-8000-000000000001'); raise exception 'non-root revoke allowed';
  exception when insufficient_privilege then null; end;
  begin perform external_api_private.manage_clients('list',null,'{}'); raise exception 'private direct call allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000001',true);
do $$ declare result jsonb; again jsonb; begin
  result := public.root_api_clients('create','cccccccc-2000-4000-8000-000000000001',jsonb_build_object(
    'name',' Test bot ', 'key_hash', repeat('f',64), 'contact','developer', 'notes','private note',
    'expires_at',now()+interval '90 days','requests_per_minute',42, 'scopes',jsonb_build_array('admin')));
  if result->0->>'name' <> 'Test bot' or result->0->>'requests_per_minute' <> '42'
    or result->0->>'guide_version' <> '1'
    or result->0->'scopes' <> '["schedule:read"]'::jsonb
    or (result->0) ? 'key_hash' or result::text like '%'||repeat('f',64)||'%' then
    raise exception 'create response, scopes or secret boundary broken';
  end if;
  again := public.root_api_clients('create','cccccccc-2000-4000-8000-000000000001',jsonb_build_object('name','Retry', 'key_hash',repeat('f',64)));
  if again <> result then raise exception 'retry changed data'; end if;
  begin
    perform public.root_api_clients('create','cccccccc-2000-4000-8000-000000000001',jsonb_build_object('name','Hijack','key_hash',repeat('e',64)));
    raise exception 'ID overwrite allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.root_api_clients('create',gen_random_uuid(),jsonb_build_object('name','Past','key_hash',repeat('e',64),'expires_at',now()-interval '1 day'));
    raise exception 'past expiry allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.root_api_clients('create',gen_random_uuid(),jsonb_build_object('name','Quota','key_hash',repeat('e',64),'requests_per_minute',601));
    raise exception 'excess quota allowed';
  exception when invalid_parameter_value then null; end;
  result:=public.root_api_clients('create','cccccccc-2000-4000-8000-000000000002',
    jsonb_build_object('name','V2 bot','key_hash',repeat('b',64),'guide_version',2));
  if result->0->>'guide_version'<>'2' then raise exception 'v2 preference not saved'; end if;
  again:=public.root_api_clients('create','cccccccc-2000-4000-8000-000000000002',
    jsonb_build_object('name','Retry v1','key_hash',repeat('b',64),'guide_version',1));
  if again<>result then raise exception 'retry changed guide version'; end if;
  if not exists(select 1 from jsonb_array_elements(public.root_api_clients()) x
    where x->>'id'='cccccccc-2000-4000-8000-000000000002' and x->>'guide_version'='2') then
    raise exception 'listed client lost guide preference'; end if;
  begin
    perform public.root_api_clients('create',gen_random_uuid(),
      jsonb_build_object('name','Invalid version','key_hash',repeat('c',64),'guide_version',3));
    raise exception 'unknown guide version allowed';
  exception when invalid_parameter_value then null; end;
  begin perform public.root_api_clients('unknown'); raise exception 'invalid action allowed';
  exception when invalid_parameter_value then null; end;
  begin perform 1 from external_api_private.clients; raise exception 'root reads hashes directly';
  exception when insufficient_privilege then null; end;
  if public.root_api_clients()::text like '%key_hash%' then raise exception 'list leaks hashes'; end if;
end $$;
reset role;

set local role service_role;
do $$ declare result jsonb; begin
  result := public.external_api_schedule(repeat('f',64),'2098-11-01',1);
  if result ? 'error' then raise exception 'created key cannot read schedule: %',result; end if;
end $$;
reset role;
set local role authenticated;
do $$ declare result jsonb; begin
  result := public.root_api_clients('revoke','cccccccc-2000-4000-8000-000000000001');
  if result->0->>'revoked_at' is null then raise exception 'revoke failed'; end if;
  if public.root_api_clients('revoke','cccccccc-2000-4000-8000-000000000001') <> result then raise exception 'revoke not idempotent'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare result jsonb; begin
  result := public.external_api_schedule(repeat('f',64),'2098-11-01',1);
  if result->'error'->>'code' is distinct from 'invalid_api_key' then raise exception 'revoked key still reads: %',result; end if;
end $$;
reset role;
-- Recoverable credentials are optional for compatibility, never included in metadata.
set local role authenticated;
do $$ declare result jsonb; token text := 'rp_' || repeat('a',64); payload jsonb; begin
  payload := jsonb_build_object('name','Recoverable bot', 'guide_version',2,
    'key',token,'key_hash',encode(extensions.digest(token,'sha256'),'hex'));
  result := public.root_api_clients('create','cccccccc-2000-4000-8000-000000000003',payload);
  if (result->0->>'has_saved_key')::boolean is distinct from true
    or result::text like '%' || token || '%' or result::text like '%key_secret_id%' then
    raise exception 'recoverable metadata boundary broken';
  end if;
  if public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000003') #>> '{}' is distinct from token then
    raise exception 'root cannot retrieve key';
  end if;
  if public.root_api_clients('create','cccccccc-2000-4000-8000-000000000003',payload) <> result then
    raise exception 'recoverable retry changed metadata';
  end if;
  if public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000002') is not null then
    raise exception 'legacy key claims to be recoverable';
  end if;
  if public.root_api_clients()::text like '%' || token || '%' then raise exception 'list leaks key'; end if;
  begin
    perform public.root_api_clients('create',gen_random_uuid(),payload || '{"key_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}');
    raise exception 'mismatched credential accepted';
  exception when invalid_parameter_value then null; end;
  begin perform 1 from vault.decrypted_secrets; raise exception 'root reads Vault directly';
  exception when insufficient_privilege then null; end;
  begin perform vault.create_secret('forbidden'); raise exception 'root writes Vault directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare token text := 'rp_' || repeat('a',64); begin
  if not exists(select 1 from external_api_private.clients c join vault.secrets s on s.id=c.key_secret_id
    where c.id='cccccccc-2000-4000-8000-000000000003' and s.secret <> token) then
    raise exception 'key not encrypted at rest';
  end if;
  if (select count(*) from vault.decrypted_secrets where decrypted_secret=token) <> 1 then
    raise exception 'retry duplicated secret';
  end if;
end $$;
update external_api_private.clients set expires_at=now()-interval '1 second'
 where id='cccccccc-2000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  if public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000003') is not null then
    raise exception 'expired key retrieved';
  end if;
end $$;
reset role;
update external_api_private.clients set expires_at=null where id='cccccccc-2000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  perform public.root_api_clients('revoke','cccccccc-2000-4000-8000-000000000003');
  if public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000003') is not null then
    raise exception 'revoked key retrieved';
  end if;
end $$;
reset role;
-- A still-valid JWT does not retain root permission after role removal.
delete from public.member_roles where member_id = 'cccccccc-1000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform public.root_api_clients('reveal','cccccccc-2000-4000-8000-000000000003'); raise exception 'removed root can reveal';
  exception when insufficient_privilege then null; end;
  begin perform public.root_api_clients(); raise exception 'removed root allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
