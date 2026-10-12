-- Working-only transactional smoke: real facts are read, temporary requests and
-- exclusions are completely rolled back. No real identifiers are stored here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $smoke$
declare
  actor uuid; ordinary uuid; v_source jsonb; person jsonb; expected jsonb; request_id uuid;
  kind text; public_row jsonb; original_snapshot jsonb; json_points numeric; raw_points numeric;
begin
  select m.auth_user_id into actor from members m join member_roles r on r.member_id=m.id
    where r.role_id='root' and m.auth_user_id is not null order by m.id limit 1;
  if actor is null then raise exception 'No existing root session for Working smoke'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  v_source:=load_priorities('2026-08-01');
  if jsonb_array_length(v_source->'people')=0 then raise exception 'Empty real priority v_source'; end if;
  select sum((v->>'tournaments')::numeric * case when v->>'limit'='100' then 2 else 1 end
    * case when (e->>'month')::date < date '2026-05-01' then 0.5 else 1 end) into json_points
    from jsonb_array_elements(v_source->'people') p, jsonb_array_elements(p->'entries') e,
    jsonb_array_elements(e->'values') v;
  execute 'reset role';
  select sum(v.tournaments::numeric * case when v.limit_id='100' then 2 else 1 end
    * case when e.month_start < date '2026-05-01' then 0.5 else 1 end) into raw_points
  from distance_entries e join distance_values v on v.entry_id=e.id join rooms room on room.id=e.room_id
  where room.slug='winamax' and e.month_start>=date '2026-02-01' and e.month_start<date '2026-08-01'
    and e.variant_id in('nitro','regular') and v.limit_id in('50','100')
    and coalesce(e.member_id,
      (select i.member_id from identities i where i.provider='discord' and i.provider_uid=e.discord_id limit 1),
      (select m.id from members m where m.distance_ext_id=e.distance_ext_id limit 1))
      in(select (p->>'memberId')::uuid from jsonb_array_elements(v_source->'people') p);
  if json_points is distinct from raw_points or coalesce(raw_points,0)<=0 then raise exception 'Real weighted distance mismatch'; end if;
  select p into person from jsonb_array_elements(v_source->'people') p
    where p->'plays' ? 'nitro' and (p->>'vipNitro')::integer=0 and not (p->>'excludedNitro')::boolean limit 1;
  if person is null then raise exception 'No non-VIP Nitro player for transactional fixture'; end if;
  kind:='nitro'; expected:=jsonb_build_array(person);
  execute 'set local role authenticated';
  request_id:=submit_priority_request('2026-08-01',kind,expected,'Working release smoke; rollback only',true,v_source->>'revision');
  original_snapshot:=get_priority_request(request_id)->'snapshot';
  select p into public_row from jsonb_array_elements(list_priority_requests('2026-08-01')) p where p->>'id'=request_id::text;
  if public_row is null or public_row ? 'author' or public_row ? 'comment' or public_row ? 'snapshot' then raise exception 'Public request privacy failed'; end if;
  perform set_priority_exclusion((person->>'memberId')::uuid,kind,true);
  begin
    perform submit_priority_request('2026-08-01',kind,expected,'stale',true,v_source->>'revision');
    raise exception 'Stale request accepted';
  exception when sqlstate '40001' then null; end;
  if get_priority_request(request_id)->'snapshot' is distinct from original_snapshot then raise exception 'Snapshot mutated'; end if;
  execute 'reset role';
  select m.auth_user_id into ordinary from members m where m.auth_user_id is not null
    and not member_is_root(m.id) and member_has_permission(m.id,'schedule')
    and not member_has_permission(m.id,'admin.people') order by m.id limit 1;
  if ordinary is not null then
    perform set_config('request.jwt.claim.sub',ordinary::text,true);
    execute 'set local role authenticated';
    perform load_priorities('2026-08-01');
    begin perform get_priority_request(request_id); raise exception 'Player read private details'; exception when sqlstate '42501' then null; end;
    begin perform close_priority_request(request_id,'not allowed'); raise exception 'Player closed request'; exception when sqlstate '42501' then null; end;
    execute 'reset role';
  end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  perform close_priority_request(request_id,'Working smoke verified');
  select p into public_row from jsonb_array_elements(list_priority_requests('2026-08-01')) p where p->>'id'=request_id::text;
  if public_row->>'response' is distinct from 'Working smoke verified' then raise exception 'Public response missing'; end if;
  perform delete_priority_request(request_id);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform load_priorities('2026-08-01'); raise exception 'Outsider read v_source'; exception when sqlstate '42501' then null; end;
end;
$smoke$;
rollback;
select 'Working priorities smoke passed; all changes rolled back' as result,
  (select count(*) from members) as members,
  (select count(*) from distance_entries) as distance_entries,
  (select count(*) from distance_values) as distance_values,
  (select sum(tournaments) from distance_values) as tournaments;
