-- Disposable local DB only; all synthetic data and deletion are rolled back.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('eeeeeeee-0000-4000-8000-000000000001','authenticated','authenticated','logs-root@example.invalid',now(),now()),
 ('eeeeeeee-0000-4000-8000-000000000002','authenticated','authenticated','logs-admin@example.invalid',now(),now());
insert into public.members(id,auth_user_id,public_code,access_status,mark_tag) values
 ('eeeeeeee-1000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','LOG-ROOT','active','LR'),
 ('eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002','LOG-ADMIN','active','LA');
insert into public.member_roles(member_id,role_id) values
 ('eeeeeeee-1000-4000-8000-000000000001','root'),('eeeeeeee-1000-4000-8000-000000000002','admin');
insert into public.profiles(member_id,display_name) values
 ('eeeeeeee-1000-4000-8000-000000000001','Log Root'),('eeeeeeee-1000-4000-8000-000000000002','Log Subject')
 on conflict(member_id) do update set display_name=excluded.display_name;
insert into public.identities(member_id,provider,provider_uid,username) values
 ('eeeeeeee-1000-4000-8000-000000000002','discord','999990000000000099','SubjectAlias');
insert into public.occupancy_events(id,at,action,member_id,actor_id,slot_date,half,level) values
 ('eeeeeeee-2000-4000-8000-000000000001','2090-01-01 20:59:59Z','place','eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000001','2090-06-01',0,0),
 ('eeeeeeee-2000-4000-8000-000000000002','2090-01-01 21:00:00Z','place','eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000001','2090-06-01',0,0),
 ('eeeeeeee-2000-4000-8000-000000000003','2090-01-01 21:00:00Z','remove','eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000001','2090-06-01',0,0),
 ('eeeeeeee-2000-4000-8000-000000000004','2090-01-02 20:59:59Z','place','eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000001','2090-06-01',0,0),
 ('eeeeeeee-2000-4000-8000-000000000005','2090-01-02 21:00:00Z','place','eeeeeeee-1000-4000-8000-000000000002','eeeeeeee-1000-4000-8000-000000000001','2090-06-01',0,0);
insert into public.member_distance_id_audit(id,member_id,old_ids,new_ids,actor_id,at) overriding system value values
 (900001,'eeeeeeee-1000-4000-8000-000000000002','{901}','{902,901}','eeeeeeee-1000-4000-8000-000000000001','2090-01-01 21:00:00Z'),
 (900002,'eeeeeeee-1000-4000-8000-000000000002','{902,901}','{903}','eeeeeeee-1000-4000-8000-000000000001','2090-01-01 21:00:00Z'),
 (900003,'eeeeeeee-9999-4000-8000-000000000099','{903}','{}',null,'2090-01-01 21:00:00Z');
do $$ begin
 if has_function_privilege('anon','public.root_logs(text,text,text,date,date,text,integer,timestamptz,text)','EXECUTE')
   or has_function_privilege('anon','public.root_logs_cleanup(integer,timestamptz,boolean)','EXECUTE') then raise exception 'anon grant'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.root_logs(); raise exception 'anon read'; exception when insufficient_privilege then null; end;
 begin perform public.root_logs_cleanup(); raise exception 'anon cleanup'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.root_logs(); raise exception 'missing uid'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.root_logs(); raise exception 'admin read'; exception when insufficient_privilege then null; end;
 begin perform public.root_logs_cleanup(2,null,true); raise exception 'admin cleanup'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; n jsonb; begin
 r:=public.root_logs(p_person=>'log root',p_from=>'2090-01-02',p_to=>'2090-01-02',p_limit=>2);
 if jsonb_array_length(r->'rows')<>2 or r->>'has_more'<>'true'
   or r->'rows'->0->>'id'<>'eeeeeeee-2000-4000-8000-000000000004'
   or r->'rows'->1->>'id'<>'eeeeeeee-2000-4000-8000-000000000003' then raise exception 'date or sorting: %',r; end if;
 n:=public.root_logs(p_person=>'log root',p_from=>'2090-01-02',p_to=>'2090-01-02',p_limit=>2,
   p_before_at=>(r->'rows'->1->>'at')::timestamptz,p_before_id=>r->'rows'->1->>'id');
 if jsonb_array_length(n->'rows')<>1 or n->>'has_more'<>'false'
   or n->'rows'->0->>'id'<>'eeeeeeee-2000-4000-8000-000000000002' then raise exception 'cursor ties: %',n; end if;
 if jsonb_array_length(public.root_logs(p_person=>'SubjectAlias',p_role=>'actor')->'rows')<>0
   or jsonb_array_length(public.root_logs(p_person=>'999990000000000099',p_role=>'member',p_action=>'remove')->'rows')<>1
   or jsonb_array_length(public.root_logs(p_person=>'%',p_role=>'member')->'rows')<>0 then raise exception 'person/action search'; end if;
 r:=public.root_logs(p_source=>'distance',p_from=>'2090-01-02',p_to=>'2090-01-02',p_limit=>2);
 if r->'rows'->0->'member'->>'id'<>'eeeeeeee-9999-4000-8000-000000000099' or r->'rows'->0->'member' ? 'name'
   or r->'rows'->1->>'id'<>'900002' then raise exception 'orphan or distance order: %',r; end if;
 n:=public.root_logs(p_source=>'distance',p_from=>'2090-01-02',p_to=>'2090-01-02',p_limit=>2,
   p_before_at=>(r->'rows'->1->>'at')::timestamptz,p_before_id=>r->'rows'->1->>'id');
 if n->'rows'->0->>'id'<>'900001' or n->'rows'->0->'detail'->'new_ids'<>'["902","901"]'::jsonb then raise exception 'distance cursor/details'; end if;
 begin perform public.root_logs(p_limit=>201); raise exception 'unbounded page'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs(p_before_at=>now()); raise exception 'partial cursor'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs(p_from=>'2090-01-02',p_to=>'2090-01-01'); raise exception 'reversed dates'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs_cleanup(1); raise exception 'short retention'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs_cleanup(2,null,true); raise exception 'missing preview'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs_cleanup(2,now(),true); raise exception 'recent cutoff'; exception when invalid_parameter_value then null; end;
 begin perform public.root_logs_cleanup(2,now()-interval '4 months',true); raise exception 'expired preview'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Scope, strict cutoff, maximum batch and preservation of both journals' recent records.
create temp table cleanup_boundary as select (public.root_logs_cleanup()->>'cutoff')::timestamptz as at;
insert into public.occupancy_events(at,action,slot_date,half,level)
 select at-interval '1 second','place','2000-01-01',0,0 from cleanup_boundary cross join generate_series(1,5001);
insert into public.occupancy_events(id,at,action,slot_date,half,level)
 select 'eeeeeeee-3000-4000-8000-000000000001',at,'place','2000-01-01',0,0 from cleanup_boundary;
insert into public.member_distance_id_audit(member_id,old_ids,new_ids,at)
 select 'eeeeeeee-1000-4000-8000-000000000002','{}','{901}',at-interval '1 year' from cleanup_boundary;
grant select on cleanup_boundary to authenticated;
set local role authenticated;
do $$ declare r jsonb; boundary timestamptz; begin
 select at into boundary from cleanup_boundary;
 r:=public.root_logs_cleanup();
 if (r->>'eligible')::int<5001 or (r->>'deleted')::int<>0 then raise exception 'preview mutated records'; end if;
 if (public.root_logs_cleanup(3)->>'eligible')::int<>0 then raise exception 'three month cutoff'; end if;
 r:=public.root_logs_cleanup(2,boundary,true);
 if (r->>'deleted')::int<>5000 or (r->>'eligible')::int<1 then raise exception 'batch boundary: %',r; end if;
 r:=public.root_logs_cleanup(2,boundary,true);
 if (r->>'eligible')::int<>0 then raise exception 'cleanup remaining'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.occupancy_events where id='eeeeeeee-3000-4000-8000-000000000001')
   or not exists(select 1 from public.member_distance_id_audit where at<now()-interval '1 year')
   or not exists(select 1 from cron.job where jobname='occupancy-events-prune' and active and schedule='20 3 * * *') then
   raise exception 'cleanup removed boundary/audit or changed auto retention'; end if;
end $$;
rollback;
