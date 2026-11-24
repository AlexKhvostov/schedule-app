-- Only synthetic people; all mutations are rolled back.
begin;
do $$
declare
  root_auth uuid:=gen_random_uuid(); player_auth uuid:=gen_random_uuid(); root_member uuid;
  a uuid; b uuid; c uuid; before_order jsonb; after_order jsonb; changed jsonb; old_number bigint;
  period date; roster jsonb; old_revision text; new_revision text; full_rank uuid[]; a_position bigint; b_position bigint; before_keys jsonb; after_keys jsonb; n integer;
begin
  if has_function_privilege('anon','public.load_club_order()','EXECUTE')
    or has_function_privilege('anon','public.save_club_order(text,jsonb)','EXECUTE')
    or has_table_privilege('authenticated','schedule_private.club_order','UPDATE')
    or has_function_privilege('authenticated','schedule_private.club_order_snapshot()','EXECUTE')
    or has_function_privilege('authenticated','schedule_private.lock_club_order_member_delete()','EXECUTE')
    or has_table_privilege('authenticated','schedule_private.club_order_positions','SELECT') then
    raise exception 'club order grants too broad';
  end if;
  insert into auth.users(id,email) values(root_auth,'club-order-root@example.invalid'),(player_auth,'club-order-player@example.invalid');
  insert into members(auth_user_id,public_code,access_status) values(root_auth,'ORDER-ROOT','active') returning id into root_member;
  insert into member_roles(member_id,role_id) values(root_member,'root');
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  insert into members(auth_user_id,public_code,access_status,mark_tag) values(player_auth,'ORDER-A','active','QA') returning id into a;
  insert into members(public_code,access_status,mark_tag) values('ORDER-B','active','QB') returning id into b;
  insert into members(public_code,access_status,mark_tag) values('ORDER-C','active','QC') returning id into c;
  insert into discord_guild_roles(role_id,name) values('order-players','Order players');
  insert into discord_role_permissions(role_id,permission_code) values('order-players','schedule');
  insert into discord_role_schedule_limits(role_id,variant_id,limit_id) values('order-players','nitro','50');
  insert into identities(member_id,provider,provider_uid,username,display_name,guild_present,discord_roles)
    select v.member,'discord',v.discord,v.name,v.name,true,
      jsonb_build_array(jsonb_build_object('id',s.required_discord_role_id),jsonb_build_object('id','order-players'))
    from (values(a,'999980000000000011','Alpha'),(b,'999980000000000022','Zulu')) v(member,discord,name)
    cross join club_settings s where s.id;
  insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
    values(c,'discord','999980000000000033','NoRole',true,'[]');
  if exists(select 1 from schedule_private.club_order where member_id in (c,root_member)) then
    raise exception 'number assigned without RedParty role';
  end if;
  if (select count(*) from schedule_private.club_order where member_id in(a,b))<>2 then
    raise exception 'automatic numbering missing';
  end if;
  -- Internal gaps are never exposed as public positions.
  select coalesce(max(ordinal),0) into old_number from schedule_private.club_order;
  update schedule_private.club_order set ordinal=old_number+case when member_id=a then 100 else 200 end where member_id in(a,b);
  before_order:=public.load_club_order();
  select position into a_position from schedule_private.club_order_positions where member_id=a;
  select position into b_position from schedule_private.club_order_positions where member_id=b;
  select count(*) into n from schedule_private.club_order;
  if b_position<>n or a_position<>n-1 then raise exception 'private gaps leaked into positions'; end if;
  select jsonb_agg(case when r->>'memberId'=a::text then r||jsonb_build_object('number',b_position)
    when r->>'memberId'=b::text then r||jsonb_build_object('number',a_position) else r end)
    into changed from jsonb_array_elements(before_order->'rows') r;
  execute 'set local role authenticated';
  after_order:=public.save_club_order(before_order->>'revision',changed);
  if after_order->>'revision'=before_order->>'revision' then raise exception 'revision unchanged'; end if;
  begin
    perform public.save_club_order(before_order->>'revision',changed);
    raise exception 'stale save accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_club_order(after_order->>'revision','[]');
    raise exception 'missing members accepted';
  exception when invalid_parameter_value then null; end;
  select jsonb_agg(r||'{"number":1}'::jsonb) into changed from jsonb_array_elements(after_order->'rows') r;
  begin
    perform public.save_club_order(after_order->>'revision',changed);
    raise exception 'duplicate numbers accepted';
  exception when invalid_parameter_value then null; end;
  select jsonb_agg(case when r->>'memberId'=a::text then r||jsonb_build_object('number',n+1) else r end)
    into changed from jsonb_array_elements(after_order->'rows') r;
  begin
    perform public.save_club_order(after_order->>'revision',changed);
    raise exception 'gap/out of range accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',player_auth::text,true);
  begin
    perform public.save_club_order(after_order->>'revision',after_order->'rows');
    raise exception 'ordinary member saved club order';
  exception when insufficient_privilege then null; end;
  begin
    perform public.load_club_order();
    raise exception 'ordinary member loaded admin order';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  insert into player_limits(player_id,variant_id,limit_id)
    select id,'nitro','50' from players where member_id in(a,b) on conflict do nothing;
  select active_period into period from priority_settings where id;
  roster:=public.load_active_month_roster('nitro','50-100',array['50','100']);
  if (select (r->>'clubOrder')::bigint from jsonb_array_elements(roster->'people') r where r->>'memberId'=a::text)<>b_position then
    raise exception 'roster missing order projection'; end if;
  select array_agg(member_id order by rank_no) into full_rank from schedule_private.fill_order('nitro') where member_id in(a,b);
  if full_rank<>array[b,a] then raise exception 'server queue ignores club order: %',full_rank; end if;
  old_revision:=roster->>'revision';
  before_order:=public.load_club_order();
  select jsonb_agg(case when r->>'memberId'=a::text then r||jsonb_build_object('number',a_position)
    when r->>'memberId'=b::text then r||jsonb_build_object('number',b_position) else r end)
    into changed from jsonb_array_elements(before_order->'rows') r;
  perform public.save_club_order(before_order->>'revision',changed);
  new_revision:=public.load_active_month_roster('nitro','50-100',array['50','100'])->>'revision';
  if old_revision=new_revision then raise exception 'roster revision stale after swap'; end if;
  select array_agg(member_id order by rank_no) into full_rank from schedule_private.fill_order('nitro') where member_id in(a,b);
  if full_rank<>array[a,b] then raise exception 'swap not applied to server queue'; end if;
  perform external_api_private.prepare_priority();
  if external_api_private.read_priority()->'people'->a::text->>'clubOrder'<>a_position::text then
    raise exception 'external priority missing club order'; end if;
  if (select (r->>'club_order')::bigint from jsonb_array_elements(public.admin_people_snapshot()->'members') r where r->>'id'=b::text)<>b_position then
    raise exception 'admin projection lost global position'; end if;
  select jsonb_object_agg(member_id,ordinal) into before_keys from schedule_private.club_order where member_id<>a;
  -- Removal is authoritative; re-joining allocates max+1, not the previous slot.
  update identities set discord_roles='[]' where member_id=a and provider='discord';
  if exists(select 1 from schedule_private.club_order where member_id=a) then raise exception 'lost role kept number'; end if;
  select jsonb_object_agg(member_id,ordinal) into after_keys from schedule_private.club_order;
  if before_keys<>after_keys then raise exception 'removal rewrote other keys'; end if;
  if (select position from schedule_private.club_order_positions where member_id=b)<>b_position-1 then raise exception 'removal left visible gap'; end if;
  select max(ordinal) into old_number from schedule_private.club_order;
  update identities set discord_roles=jsonb_build_array(jsonb_build_object('id',(select required_discord_role_id from club_settings where id)))
    where member_id=a and provider='discord';
  if (select ordinal from schedule_private.club_order where member_id=a)<>old_number+1 then raise exception 'return did not append'; end if;
  if (select position from schedule_private.club_order_positions where member_id=a)<>n then raise exception 'return position not last'; end if;
  -- A routine snapshot refresh and an ID edit must not change the assigned number.
  select ordinal into old_number from schedule_private.club_order where member_id=a;
  update identities set updated_at=clock_timestamp() where member_id=a;
  update members set distance_ext_id='99801' where id=a;
  if (select ordinal from schedule_private.club_order where member_id=a)<>old_number then raise exception 'metadata renumbered player'; end if;
  insert into discord_members(discord_id,username,present,roles)
    values('999980000000000011','Alpha',true,'[]');
  if exists(select 1 from schedule_private.club_order where member_id=a) then raise exception 'snapshot did not override stale identity role'; end if;
  update discord_members set roles=jsonb_build_array(jsonb_build_object('id',(select required_discord_role_id from club_settings where id)))
    where discord_id='999980000000000011';
  if not exists(select 1 from schedule_private.club_order where member_id=a) then raise exception 'snapshot return did not assign'; end if;
end;
$$;
-- A large insertion changes only the moved interval and retains the key set.
do $$
declare root_auth uuid:=gen_random_uuid(); root_member uuid; target uuid; before_order jsonb; after_order jsonb;
  changed jsonb; original_keys jsonb; key_values bigint[]; after_key_values bigint[]; n integer; changed_count integer;
begin
  select m.auth_user_id into root_auth from members m join member_roles r on r.member_id=m.id where r.role_id='root';
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  insert into members(id,public_code,access_status)
    select ('bbbbbbbb-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'ORDER-LARGE-'||i,'active' from generate_series(1,171) i;
  insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
    select ('bbbbbbbb-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'discord','999970000000'||lpad(i::text,6,'0'),'Large '||i,true,
      jsonb_build_array(jsonb_build_object('id',s.required_discord_role_id)) from generate_series(1,171) i cross join club_settings s where s.id;
  before_order:=public.load_club_order();
  n:=jsonb_array_length(before_order->'rows');
  target:=(before_order->'rows'->(n-1)->>'memberId')::uuid;
  select jsonb_object_agg(member_id,ordinal),array_agg(ordinal order by ordinal) into original_keys,key_values from schedule_private.club_order;
  select jsonb_agg(r||jsonb_build_object('number',case when r->>'memberId'=target::text then 50
    when (r->>'number')::int>=50 then (r->>'number')::int+1 else (r->>'number')::int end))
    into changed from jsonb_array_elements(before_order->'rows') r;
  after_order:=public.save_club_order(before_order->>'revision',changed);
  if after_order->'rows'->49->>'memberId'<>target::text then raise exception 'large move missed target'; end if;
  if exists(select 1 from jsonb_array_elements(before_order->'rows') r where (r->>'number')::int<50
    and not (after_order->'rows' @> jsonb_build_array(r))) then raise exception 'large move changed prefix'; end if;
  if exists(select 1 from jsonb_array_elements(before_order->'rows') r where (r->>'number')::int between 50 and n-1
    and not (after_order->'rows' @> jsonb_build_array(r||jsonb_build_object('number',(r->>'number')::int+1)))) then
    raise exception 'intermediate members did not shift by one'; end if;
  select count(*) filter(where ordinal<>(original_keys->>member_id::text)::bigint),array_agg(ordinal order by ordinal)
    into changed_count,after_key_values from schedule_private.club_order;
  if changed_count<>n-49 or key_values<>after_key_values then raise exception 'large move changed wrong keys'; end if;
end;
$$;
rollback;
