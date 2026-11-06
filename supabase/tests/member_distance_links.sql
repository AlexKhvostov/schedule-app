begin;
do $$
declare
  actor_auth uuid:=gen_random_uuid(); actor uuid; first_member uuid; second_member uuid;
  room uuid; rp text; book jsonb; result jsonb; rows jsonb; total_before bigint; nick text;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values('00000000-0000-0000-0000-000000000000',actor_auth,'authenticated','authenticated','distance-links@example.invalid','',now(),now(),now());
  insert into members(auth_user_id,public_code,access_status) values(actor_auth,'RP-LINKROOT','active') returning id into actor;
  insert into member_roles(member_id,role_id) values(actor,'root');
  insert into members(public_code,access_status) values('RP-LINKONE','active') returning id into first_member;
  insert into members(public_code,access_status) values('RP-LINKTWO','active') returning id into second_member;
  insert into profiles(member_id) values(first_member),(second_member) on conflict do nothing;
  select id into room from rooms where slug='winamax';
  select required_discord_role_id into rp from club_settings where id;
  insert into discord_members(discord_id,username,global_name,present,roles) values
    ('990000000000007001','link-one','Link One',true,jsonb_build_array(jsonb_build_object('id',rp))),
    ('990000000000007002','link-two','Link Two',true,jsonb_build_array(jsonb_build_object('id',rp)));
  insert into identities(member_id,provider,provider_uid) values
    (first_member,'discord','990000000000007001'),(second_member,'discord','990000000000007002');
  -- A conflicting obsolete mapping must never choose an owner.
  insert into discord_distance_ids(discord_id,distance_ext_id) values('990000000000007002','990701');
  perform set_config('request.jwt.claim.sub',actor_auth::text,true);
  execute 'set local role authenticated';
  rows:='[{"distance_ext_id":"990701","variant_id":"nitro","limit_id":"50","hands":100,"game_nick":"FirstNick"},
    {"distance_ext_id":"990702","variant_id":"nitro","limit_id":"50","hands":200,"game_nick":"SecondNick"}]';
  result:=save_distance_dump('winamax','2026-10-01','all',1,'link-test','',rows);
  if (result->>'inserted')::int<>2 then raise exception 'import lost facts'; end if;
  book:=admin_distance_book('2026-10-01','winamax');
  if exists(select 1 from jsonb_array_elements(book->'entries') e where e->>'distance_ext_id' in ('990701','990702') and e->>'member_id' is not null) then
    raise exception 'unassigned facts attached through obsolete Discord mapping'; end if;
  perform save_member_distance_ids(first_member,array['990701','990702'],array[]::text[]);
  book:=admin_distance_book('2026-10-01','winamax');
  if (select count(*) from jsonb_array_elements(book->'entries') e where e->>'distance_ext_id' in ('990701','990702')
    and e->>'member_id'=first_member::text and (e->>'has_active_profile')::bool and (e->>'present')::bool)<>2 then
    raise exception 'late assignment did not attach both IDs'; end if;
  if not exists(select 1 from jsonb_array_elements(book->'people') p where p->>'member_id'=first_member::text and p->>'game_nick'='FirstNick') then
    raise exception 'primary nickname or card without legacy role missing'; end if;
  result:=load_priority_slice('2026-11-01','nitro','50-100');
  if (select (p->'calculation'->>'total')::numeric from jsonb_array_elements(result->'people') p where p->>'memberId'=first_member::text)<>300 then
    raise exception 'multi-ID priority total incorrect'; end if;
  begin
    perform save_member_distance_ids(second_member,array['990701'],array[]::text[]);
    raise exception 'duplicate assignment accepted';
  exception when unique_violation then null; end;
  begin
    perform save_member_distance_ids(first_member,array['990703'],array[]::text[]);
    raise exception 'stale editor accepted';
  exception when serialization_failure then null; end;
  -- Repeated values still update the nickname and never duplicate tournaments.
  result:=save_distance_dump('winamax','2026-10-01','all',1,'nick-refresh','',replace(rows::text,'FirstNick','NewNick')::jsonb);
  if (result->>'inserted')::int<>0 then raise exception 'repeat duplicated facts'; end if;
  book:=admin_distance_book('2026-10-01','winamax');
  if not exists(select 1 from jsonb_array_elements(book->'people') p where p->>'member_id'=first_member::text and p->>'game_nick'='NewNick') then
    raise exception 'repeat failed to refresh nickname'; end if;
  -- A newly uploaded old month is authoritative too, including zero-value rows.
  perform save_distance_dump('winamax','2026-01-01','all',1,'old-month','',
    '[{"distance_ext_id":"990701","variant_id":"nitro","limit_id":"50","hands":0,"game_nick":"NewestNick"}]');
  book:=admin_distance_book('2026-10-01','winamax');
  if not exists(select 1 from jsonb_array_elements(book->'people') p where p->>'member_id'=first_member::text and p->>'game_nick'='NewestNick') then
    raise exception 'zero-row old-month metadata lost'; end if;
  perform save_member_distance_ids(first_member,array['990702','990701'],array['990701','990702']);
  book:=admin_distance_book('2026-10-01','winamax');
  if not exists(select 1 from jsonb_array_elements(book->'people') p where p->>'member_id'=first_member::text and p->>'game_nick'='SecondNick') then
    raise exception 'primary ID switch failed'; end if;
  perform save_member_distance_ids(first_member,array[]::text[],array['990702','990701']);
  book:=admin_distance_book('2026-10-01','winamax');
  if exists(select 1 from jsonb_array_elements(book->'entries') e where e->>'distance_ext_id' in ('990701','990702') and e->>'member_id' is not null) then
    raise exception 'removal restored a legacy link'; end if;
  result:=load_priority_slice('2026-11-01','nitro','50-100');
  if (select (p->'calculation'->>'total')::numeric from jsonb_array_elements(result->'people') p where p->>'memberId'=first_member::text)<>0 then
    raise exception 'priority cache retained removed IDs'; end if;
  perform save_member_distance_ids(second_member,array['990701'],array[]::text[]);
  book:=admin_distance_book('2026-10-01','winamax');
  if not exists(select 1 from jsonb_array_elements(book->'entries') e where e->>'distance_ext_id'='990701' and e->>'member_id'=second_member::text) then
    raise exception 'reassignment failed'; end if;
  select sum((v->>'tournaments')::bigint) into total_before from jsonb_array_elements(book->'entries') e
    cross join lateral jsonb_array_elements(e->'values') v where e->>'distance_ext_id' in ('990701','990702');
  if total_before<>300 then raise exception 'assignment changed facts'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform save_member_distance_ids(first_member,array['990704'],array[]::text[]);
    raise exception 'outsider assigned ID';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
