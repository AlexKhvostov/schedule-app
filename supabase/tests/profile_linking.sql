-- Synthetic users only; every fixture and update is rolled back.
begin;
do $$
declare
  root_auth uuid := gen_random_uuid(); root_member uuid;
  first_auth uuid := gen_random_uuid(); first_member uuid;
  other_auth uuid := gen_random_uuid(); other_member uuid;
  blocked_auth uuid := gen_random_uuid(); blocked_member uuid;
  new_auth uuid := gen_random_uuid(); created_member uuid;
  no_identity_auth uuid := gen_random_uuid();
  required_role text; before_count integer; result uuid;
begin
  if has_function_privilege('anon','public.self_create_profile()','EXECUTE') then
    raise exception 'Anonymous users can call profile linking';
  end if;
  select required_discord_role_id into required_role from public.club_settings where id;
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (root_auth,'authenticated','authenticated','link-root@example.invalid',now(),now()),
    (first_auth,'authenticated','authenticated','link-first@example.invalid',now(),now()),
    (other_auth,'authenticated','authenticated','link-other@example.invalid',now(),now()),
    (blocked_auth,'authenticated','authenticated','link-blocked@example.invalid',now(),now()),
    (new_auth,'authenticated','authenticated','link-new@example.invalid',now(),now()),
    (no_identity_auth,'authenticated','authenticated','link-no-identity@example.invalid',now(),now());
  insert into public.members(auth_user_id,public_code,access_status) values(root_auth,'LINK-ROOT','active') returning id into root_member;
  insert into public.member_roles(member_id,role_id) values(root_member,'root');
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  update public.club_settings set self_create_card=false where id;
  insert into auth.identities(provider_id,user_id,identity_data,provider) values
    ('link-first',first_auth,'{}','discord'),
    ('link-other',other_auth,'{}','discord'),
    ('link-blocked',blocked_auth,'{}','discord'),
    ('link-new',new_auth,'{}','discord');
  insert into public.discord_members(discord_id,username,present,roles) values
    ('link-first','First',true,jsonb_build_array(jsonb_build_object('id',required_role))),
    ('link-other','Other',true,jsonb_build_array(jsonb_build_object('id',required_role))),
    ('link-blocked','Blocked',true,jsonb_build_array(jsonb_build_object('id',required_role))),
    ('link-new','New',true,jsonb_build_array(jsonb_build_object('id',required_role)));
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  first_member := public.approve_club_profile('link-first');
  other_member := public.approve_club_profile('link-other');
  blocked_member := public.approve_club_profile('link-blocked');
  update public.members set access_status='blocked',block_reason='manual',blocked_at=now() where id=blocked_member;
  select count(*) into before_count from public.members;
  if exists(select 1 from public.members where id=first_member and auth_user_id is not null) then
    raise exception 'Fixture must reproduce Auth before admin-created card';
  end if;

  -- A forged editable JWT must not select another person's Discord card.
  perform set_config('request.jwt.claim.sub',first_auth::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',first_auth,'user_metadata',jsonb_build_object('provider_id','link-other'))::text,true);
  execute 'set local role authenticated';
  result := public.self_create_profile();
  if result<>first_member or public.self_create_profile()<>first_member then
    raise exception 'Existing card did not link idempotently with registration disabled';
  end if;
  execute 'reset role';
  if (select auth_user_id from public.members where id=first_member) is distinct from first_auth
    or (select auth_user_id from public.members where id=other_member) is not null
    or (select count(*) from public.members)<>before_count then
    raise exception 'Wrong card linked or duplicate profile created';
  end if;
  update public.identities set guild_present=false where member_id=first_member;
  if public.member_has_permission(first_member,'profile') then raise exception 'Linking bypassed missing Discord membership'; end if;
  update public.identities set guild_present=true,discord_roles='[]' where member_id=first_member;
  if public.member_has_permission(first_member,'profile') then raise exception 'Linking bypassed missing required role'; end if;
  update public.identities set discord_roles=jsonb_build_array(jsonb_build_object('id',required_role)) where member_id=first_member;

  perform set_config('request.jwt.claim.sub',blocked_auth::text,true);
  execute 'set local role authenticated';
  result := public.self_create_profile();
  if result<>blocked_member or public.member_has_permission(result,'profile') then
    raise exception 'Blocked profile regained access';
  end if;
  execute 'reset role';
  if not exists(select 1 from public.members where id=blocked_member and access_status='blocked' and block_reason='manual' and blocked_at is not null) then
    raise exception 'Linking overwrote manual blocking';
  end if;

  -- Conflicting links are never reassigned, even with correct Discord ownership.
  update public.members set auth_user_id=no_identity_auth where id=other_member;
  perform set_config('request.jwt.claim.sub',other_auth::text,true);
  execute 'set local role authenticated';
  begin
    perform public.self_create_profile();
    raise exception 'Conflicting profile was reassigned';
  exception when insufficient_privilege then
    if sqlerrm<>'profile-already-linked' then raise; end if;
  end;
  execute 'reset role';
  if (select auth_user_id from public.members where id=other_member) is distinct from no_identity_auth then
    raise exception 'Conflict changed the owner';
  end if;

  perform set_config('request.jwt.claim.sub',new_auth::text,true);
  execute 'set local role authenticated';
  begin
    perform public.self_create_profile();
    raise exception 'Disabled registration created a new profile';
  exception when insufficient_privilege then
    if sqlerrm<>'self-create-disabled' then raise; end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  update public.club_settings set self_create_card=true where id;
  -- A user without a trusted Discord identity cannot claim metadata ownership.
  update public.members set auth_user_id=null where id=other_member;
  perform set_config('request.jwt.claim.sub',no_identity_auth::text,true);
  execute 'set local role authenticated';
  begin
    perform public.self_create_profile();
    raise exception 'Unverified Discord metadata accepted';
  exception when insufficient_privilege then
    if sqlerrm<>'discord-identity-required' then raise; end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',new_auth::text,true);
  update public.discord_members set roles='[]' where discord_id='link-new';
  execute 'set local role authenticated';
  begin
    perform public.self_create_profile();
    raise exception 'Registration without RedParty succeeded';
  exception when insufficient_privilege then
    if sqlerrm<>'redparty-required' then raise; end if;
  end;
  execute 'reset role';
  update public.discord_members set roles=jsonb_build_array(jsonb_build_object('id',required_role)) where discord_id='link-new';
  execute 'set local role authenticated';
  created_member := public.self_create_profile();
  if public.self_create_profile()<>created_member then raise exception 'New profile is not idempotent'; end if;
  execute 'reset role';
  if (select count(*) from public.members)<>before_count+1 then raise exception 'New registration created duplicate cards'; end if;

  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  begin
    perform public.self_create_profile();
    raise exception 'Missing Auth UID accepted';
  exception when insufficient_privilege then
    if sqlerrm<>'not-authenticated' then raise; end if;
  end;
  execute 'reset role';
end;
$$;
rollback;
