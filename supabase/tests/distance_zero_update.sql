begin;

do $$
declare
  actor_auth uuid := gen_random_uuid(); actor uuid; player uuid;
  ordinary_auth uuid := gen_random_uuid(); ordinary uuid;
  entry uuid; result jsonb; book jsonb; before_entry jsonb; bad jsonb; rp text;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values('00000000-0000-0000-0000-000000000000',actor_auth,'authenticated','authenticated','zero-root@example.invalid','',now(),now(),now()),
    ('00000000-0000-0000-0000-000000000000',ordinary_auth,'authenticated','authenticated','zero-player@example.invalid','',now(),now(),now());
  insert into members(auth_user_id,public_code,access_status) values(actor_auth,'RP-ZEROROOT','active') returning id into actor;
  insert into member_roles(member_id,role_id) values(actor,'root');
  insert into members(auth_user_id,public_code,access_status) values(ordinary_auth,'RP-ZEROVIEW','active') returning id into ordinary;
  insert into members(public_code,access_status) values('RP-ZEROEDIT','active') returning id into player;
  insert into profiles(member_id) values(player) on conflict do nothing;
  select required_discord_role_id into rp from club_settings where id;
  insert into discord_members(discord_id,username,global_name,present,roles)
  values('990000000000007031','zero-player','Zero Player',true,jsonb_build_array(jsonb_build_object('id',rp)));
  insert into identities(member_id,provider,provider_uid) values(player,'discord','990000000000007031');
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  perform save_member_distance_ids(player,array['990731'],array[]::text[]);
  perform save_distance_dump('winamax','2026-10-01','all',1,'zero-test','original',
    '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"50","hands":9,"game_nick":"ZeroNick"}]');
  book := admin_distance_book('2026-10-01','winamax');
  select e->>'id' into entry from jsonb_array_elements(book->'entries') e where e->>'distance_ext_id'='990731';
  if entry is null then raise exception 'imported fixture missing'; end if;
  execute 'reset role';
  select to_jsonb(e)-'comment'-'updated_at'-'updated_by'-'manual_override' into before_entry from distance_entries e where id=entry;
  execute 'set local role authenticated';
  result := load_priority_slice('2026-11-01','regular','50-100');
  if (select (p->'calculation'->>'total')::numeric from jsonb_array_elements(result->'people') p where p->>'memberId'=player::text) is distinct from 9 then
    raise exception 'initial priority is not nine';
  end if;
  result := update_manual_distance_entry(entry,'Before joining the club','[{"limit_id":"50","tournaments":0},{"limit_id":"25","tournaments":0}]');
  if result->>'id' <> entry::text or (result->>'values')::integer <> 0 then raise exception 'zero update failed'; end if;
  book := admin_distance_book('2026-10-01','winamax');
  if not exists(select 1 from jsonb_array_elements(book->'entries') e where e->>'id'=entry::text
    and e->'values'='[]'::jsonb and e->>'comment'='Before joining the club') then raise exception 'zero entry lost from read model'; end if;
  result := load_priority_slice('2026-11-01','regular','50-100');
  if (select (p->'calculation'->>'total')::numeric from jsonb_array_elements(result->'people') p where p->>'memberId'=player::text) is distinct from 0 then
    raise exception 'priority retained removed tournaments';
  end if;
  -- Old and new clients both preserve corrections unless explicitly opted in.
  result := save_distance_dump('winamax','2026-10-01','all',1,'repeat','',
    '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"50","hands":9}]');
  if (result->>'inserted')::int <> 0 then raise exception 'legacy import resurrected zero'; end if;
  result := save_distance_dump('winamax','2026-10-01','all',1,'repeat','',
    '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"25","hands":3}]',false);
  if (result->>'inserted')::int <> 0 then raise exception 'default import supplemented manual entry'; end if;
  result := save_distance_dump('winamax','2026-10-01','all',1,'overwrite','',
    '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"50","hands":7},{"distance_ext_id":"990731","variant_id":"regular","limit_id":"25","hands":4}]',true);
  if (result->>'inserted')::int <> 2 then raise exception 'explicit overwrite failed'; end if;
  result := save_historical_distance_dump('winamax','regular',
    '[{"distance_ext_id":"990731","month_start":"2026-10-01","part":1,"limit_id":"50","hands":8}]');
  if (result->>'inserted')::int <> 0 then raise exception 'historical default overwrote correction'; end if;
  result := save_historical_distance_dump('winamax','regular',
    '[{"distance_ext_id":"990731","month_start":"2026-10-01","part":1,"limit_id":"50","hands":0}]',true);
  if (result->>'inserted')::int <> 1 then raise exception 'explicit historical zero ignored'; end if;
  execute 'reset role';
  if exists(select 1 from distance_values where entry_id=entry and limit_id='50')
    or not exists(select 1 from distance_values where entry_id=entry and limit_id='25' and tournaments=4) then
    raise exception 'overwrite did not respect explicit limits';
  end if;
  execute 'set local role authenticated';
  -- Explicit overwrite is per upload; it does not remove future protection.
  result := save_distance_dump('winamax','2026-10-01','all',1,'repeat-again','',
    '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"50","hands":9}]',false);
  if (result->>'inserted')::int <> 0 then raise exception 'overwrite removed future protection'; end if;
  execute 'reset role';
  if (select to_jsonb(e)-'comment'-'updated_at'-'updated_by'-'manual_override' from distance_entries e where id=entry) is distinct from before_entry
    or not exists(select 1 from distance_entries where id=entry and updated_by=actor) then raise exception 'entry identity or audit lost'; end if;
  execute 'set local role authenticated';
  -- Clearing twice and restoring a value use the same logical entry.
  perform update_manual_distance_entry(entry,'still zero','[{"limit_id":"50","tournaments":0}]');
  perform update_manual_distance_entry(entry,'restored','[{"limit_id":"50","tournaments":9}]');
  -- Invalid replacement must roll back its deletes and preserve the last value.
  for bad in select value from jsonb_array_elements('[null,[],{},[{"limit_id":"50","tournaments":-1}],[{"limit_id":"missing","tournaments":0}],[{"limit_id":"50","tournaments":1},{"limit_id":"50","tournaments":2}]]')
  loop
    begin
      perform update_manual_distance_entry(entry,'bad',case when bad='null'::jsonb then null else bad end);
      raise exception 'invalid update accepted: %',bad;
    exception when invalid_parameter_value or unique_violation then null;
    end;
  end loop;
  begin
    perform create_manual_distance_entry(player,'winamax','2026-10-01','regular',2,'','990731','[{"limit_id":"50","tournaments":0}]');
    raise exception 'empty new entry accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',ordinary_auth::text,true);
  begin
    perform update_manual_distance_entry(entry,'forbidden','[{"limit_id":"50","tournaments":0}]');
    raise exception 'ordinary player cleared distance';
  exception when insufficient_privilege then null; end;
  begin
    perform save_distance_dump('winamax','2026-10-01','all',1,'forbidden','',
      '[{"distance_ext_id":"990731","variant_id":"regular","limit_id":"50","hands":1}]',true);
    raise exception 'ordinary player bypassed import permission';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if not exists(select 1 from distance_values where entry_id=entry and limit_id='50' and tournaments=9)
    or not exists(select 1 from distance_entries where id=entry and comment='restored') then raise exception 'invalid update damaged prior value'; end if;
  if has_function_privilege('anon','public.update_manual_distance_entry(uuid,text,jsonb)','execute') then raise exception 'anonymous update allowed'; end if;
  if has_function_privilege('anon','public.save_distance_dump(text,date,text,integer,text,text,jsonb,boolean)','execute')
    or has_function_privilege('anon','public.save_historical_distance_dump(text,text,jsonb,boolean)','execute') then raise exception 'anonymous import allowed'; end if;
end;
$$;

rollback;
