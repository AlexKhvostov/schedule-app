-- Synthetic players, messages and mutations in a disposable database only.
begin;
do $$
declare
  a_auth uuid := gen_random_uuid(); b_auth uuid := gen_random_uuid(); c_auth uuid := gen_random_uuid();
  root_auth uuid := gen_random_uuid(); a uuid; b uuid; c uuid; root_member uuid; kind uuid;
  future date := current_date + 370;
  season date := date_trunc('month',future)::date;
  future2 date := (season+interval '1 month 6 days')::date;
  season2 date := date_trunc('month',future2)::date;
  season3 date := (season+interval '2 months')::date;
  season4 date := (season+interval '3 months')::date;
  place jsonb; offer jsonb; event_id uuid; skip_id uuid; logs jsonb;
  silent_id uuid; notify_id uuid; disabled_id uuid;
begin
  if has_function_privilege('anon','public.load_fill_queue(date,text)','EXECUTE')
    or has_function_privilege('anon','public.confirm_fill_completion(date,text,uuid,jsonb,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_fill_deliveries(uuid,uuid)','EXECUTE')
    or has_table_privilege('authenticated','schedule_private.fill_completions','UPDATE') then
    raise exception 'fill queue privileges too broad';
  end if;
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (a_auth,'authenticated','authenticated','fill-a@example.invalid',now(),now()),
    (b_auth,'authenticated','authenticated','fill-b@example.invalid',now(),now()),
    (c_auth,'authenticated','authenticated','fill-c@example.invalid',now(),now()),
    (root_auth,'authenticated','authenticated','fill-root@example.invalid',now(),now());
  insert into members(auth_user_id,public_code,access_status,mark_tag,vip_nitro)
    values(a_auth,'FILL-A','active','QA',1) returning id into a;
  insert into members(auth_user_id,public_code,access_status,mark_tag,vip_nitro)
    values(b_auth,'FILL-B','active','QB',2) returning id into b;
  insert into members(auth_user_id,public_code,access_status,mark_tag,vip_nitro)
    values(c_auth,'FILL-C','active','QC',3) returning id into c;
  insert into members(auth_user_id,public_code,access_status,mark_tag)
    values(root_auth,'FILL-ROOT','active','QR') returning id into root_member;
  insert into member_roles(member_id,role_id) values(root_member,'root');
  insert into discord_guild_roles(role_id,name) values('fill-players','Fill queue players');
  insert into discord_role_permissions(role_id,permission_code) values('fill-players','schedule');
  insert into discord_role_schedule_limits(role_id,variant_id,limit_id) values('fill-players','nitro','50');
  insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
    select data.member,'discord',data.discord,data.nick,true,
      jsonb_build_array(jsonb_build_object('id',s.required_discord_role_id),jsonb_build_object('id','fill-players'))
    from (values(a,'999990000000000011','queue-a'),(b,'999990000000000022','queue-b'),(c,'999990000000000033','queue-c'))
      data(member,discord,nick) cross join club_settings s where s.id;
  insert into player_limits(player_id,variant_id,limit_id)
    select id,'nitro','50' from players where member_id in (a,b,c) on conflict do nothing;
  select id into kind from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;
  update capacity_rules set hours=array_fill(1::smallint,array[24]) where kind_id=kind;
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  update schedule_settings set allow_act_as=true,allow_overwrite_marks=true,lock_fill_queue=true,filter_limits_nitro=array['50'] where id;
  update bot_settings set notify_fill_queue=true,fill_channels='{"nitro":"999990000000000099"}' where id='discord';

  perform set_config('request.jwt.claim.sub',a_auth::text,true);
  execute 'set local role authenticated';
  if load_fill_queue(season,'nitro')->>'current' is distinct from a::text then raise exception 'first player mismatch'; end if;
  place := jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'tables',1));
  begin
    perform apply_schedule_edit(kind,b,place,'[]','[]');
    raise exception 'placed for a waiting player';
  exception when insufficient_privilege then
    if sqlerrm<>'schedule-fill-queue-locked' then raise; end if;
  end;
  if apply_schedule_edit(kind,a,place,'[]','[]')<>1 then raise exception 'current player cannot place'; end if;
  perform set_config('request.jwt.claim.sub',b_auth::text,true);
  begin
    perform apply_schedule_edit(kind,b,'[]','[]',jsonb_build_array(jsonb_build_object('date',future,'half',20,'level',0,'member_id',a)));
    raise exception 'waiting player removed a mark';
  exception when insufficient_privilege then null;
  end;
  begin
    perform preview_fill_completion(season,'nitro',c);
    raise exception 'a waiting player was confirmable by someone else';
  exception when invalid_parameter_value then null;
  end;
  offer := preview_fill_completion(season,'nitro',a);
  if offer->>'next' is distinct from b::text or offer->>'channel'<>'999990000000000099' or (offer->>'dm')::boolean is not true then
    raise exception 'incorrect confirmation offer %',offer;
  end if;
  if not (confirm_fill_completion(season,'nitro',a,'{}') ? 'offer')
    or load_fill_queue(season,'nitro')->>'current' is distinct from a::text then
    raise exception 'stale offer was accepted';
  end if;
  event_id := (confirm_fill_completion(season,'nitro',a,offer)->>'id')::uuid;
  if event_id is null or event_id is distinct from (confirm_fill_completion(season,'nitro',a,offer)->>'id')::uuid
    or load_fill_queue(season,'nitro')->>'current' is distinct from b::text
    or load_fill_queue((season+interval '1 month')::date,'nitro')->>'current' is distinct from a::text then
    raise exception 'handoff, idempotency or month isolation failed';
  end if;

  execute 'reset role';
  if (select count(*) from schedule_private.fill_deliveries d where completion_id=event_id)<>2 then raise exception 'wrong outbox rows'; end if;
  execute 'set local role service_role';
  if exists(select 1 from claim_fill_deliveries(event_id,a_auth)) then raise exception 'wrong actor claimed delivery'; end if;
  if (select count(*) from claim_fill_deliveries(event_id,b_auth))<>2 then raise exception 'actor did not claim both destinations'; end if;
  if exists(select 1 from claim_fill_deliveries(event_id,b_auth)) then raise exception 'in-flight destination claimed again'; end if;
  perform finish_fill_delivery(event_id,'channel',1,'sent',null,0);
  perform finish_fill_delivery(event_id,'dm',1,'failed','discord-50007',0);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  logs := root_logs(p_action=>'fill_complete',p_person=>'FILL-B',p_role=>'actor');
  if jsonb_array_length(logs->'rows')<>1 or logs->'rows'->0->'member'->>'id' is distinct from a::text
    or logs->'rows'->0->'detail'->'delivery'->>'dm'<>'failed' then raise exception 'wrong audit evidence %',logs; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',b_auth::text,true);
  execute 'set local role authenticated';
  offer := preview_fill_completion(season2,'nitro',b);
  if offer->>'mode'<>'skip' or offer->>'next' is not null or (offer->>'dm')::boolean is not false then
    raise exception 'early skip offered notifications: %',offer;
  end if;
  skip_id := (confirm_fill_completion(season2,'nitro',b,offer)->>'id')::uuid;
  if load_fill_queue(season2,'nitro')->>'current' is distinct from a::text then raise exception 'early skip moved turn'; end if;
  place := jsonb_build_array(jsonb_build_object('date',future2,'half',20,'level',0,'tables',1));
  begin
    perform apply_schedule_edit(kind,b,place,'[]','[]');
    raise exception 'early skip unlocked editing';
  exception when insufficient_privilege then
    if sqlerrm<>'schedule-fill-queue-locked' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',a_auth::text,true);
  offer := preview_fill_completion(season2,'nitro',a);
  if offer->>'next' is distinct from c::text then raise exception 'handoff did not jump the early skip'; end if;
  perform confirm_fill_completion(season2,'nitro',a,offer);
  if load_fill_queue(season2,'nitro')->>'current' is distinct from c::text then raise exception 'skipped player gained a turn'; end if;
  perform confirm_fill_completion(season2,'nitro',c,preview_fill_completion(season2,'nitro',c));
  perform set_config('request.jwt.claim.sub',b_auth::text,true);
  if apply_schedule_edit(kind,b,place,'[]','[]')<>1 then raise exception 'finished queue did not reopen editing'; end if;
  execute 'reset role';
  if exists(select 1 from schedule_private.fill_deliveries d where completion_id=skip_id) then
    raise exception 'an early skip created delivery rows';
  end if;
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  logs := root_logs(p_action=>'fill_skip',p_person=>'FILL-B',p_role=>'actor');
  if jsonb_array_length(logs->'rows')<>1 or logs->'rows'->0->'member'->>'id' is distinct from b::text then
    raise exception 'wrong skip audit evidence %',logs;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',a_auth::text,true);
  execute 'set local role authenticated';
  offer := preview_fill_completion(season3,'nitro',a);
  silent_id := (confirm_fill_completion(season3,'nitro',a,offer,false)->>'id')::uuid;
  if silent_id is null or load_fill_queue(season3,'nitro')->>'current' is distinct from b::text
    or (confirm_fill_completion(season3,'nitro',a,offer,true)->>'id')::uuid is distinct from silent_id then
    raise exception 'silent completion did not hand off or was not idempotent';
  end if;
  perform set_config('request.jwt.claim.sub',b_auth::text,true);
  offer := preview_fill_completion(season3,'nitro',b);
  notify_id := (confirm_fill_completion(season3,'nitro',b,offer,true)->>'id')::uuid;
  if notify_id is null or load_fill_queue(season3,'nitro')->>'current' is distinct from c::text then
    raise exception 'notification choice carried over to the next turn';
  end if;
  execute 'reset role';
  if exists(select 1 from schedule_private.fill_deliveries where completion_id=silent_id)
    or (select count(*) from schedule_private.fill_deliveries where completion_id=notify_id and next_member=c)<>2 then
    raise exception 'per-turn notification choice did not constrain delivery jobs';
  end if;
  perform set_config('request.jwt.claim.sub',root_auth::text,true);
  execute 'set local role authenticated';
  logs := root_logs(p_action=>'fill_complete',p_person=>'FILL-A',p_role=>'actor');
  if not exists(select 1 from jsonb_array_elements(logs->'rows') event where event->>'id'=silent_id::text) then
    raise exception 'silent completion was not audited';
  end if;
  execute 'reset role';

  update bot_settings set notify_fill_queue=false where id='discord';
  perform set_config('request.jwt.claim.sub',a_auth::text,true);
  execute 'set local role authenticated';
  offer := preview_fill_completion(season4,'nitro',a);
  disabled_id := (confirm_fill_completion(season4,'nitro',a,offer,true)->>'id')::uuid;
  if disabled_id is null or load_fill_queue(season4,'nitro')->>'current' is distinct from b::text then
    raise exception 'handoff failed when club notifications were disabled';
  end if;
  execute 'reset role';
  if exists(select 1 from schedule_private.fill_deliveries where completion_id=disabled_id) then
    raise exception 'caller overrode the club notification setting';
  end if;

  update members set vip_nitro=4 where id=b;
  perform set_config('request.jwt.claim.sub',a_auth::text,true);
  execute 'set local role authenticated';
  if load_fill_queue(season,'nitro')->>'current' is distinct from c::text then raise exception 'reordering did not change turn'; end if;
  place := jsonb_build_array(jsonb_build_object('date',future,'half',21,'level',0,'tables',1));
  if apply_schedule_edit(kind,a,place,'[]','[]')<>1 then raise exception 'finished player lost editing'; end if;
  if confirm_fill_completion(season,'nitro',c,preview_fill_completion(season,'nitro',c))->>'id' is null
    or confirm_fill_completion(season,'nitro',b,preview_fill_completion(season,'nitro',b))->>'id' is null
    or load_fill_queue(season,'nitro')->>'current' is not null then raise exception 'queue did not finish'; end if;
end $$;
rollback;
