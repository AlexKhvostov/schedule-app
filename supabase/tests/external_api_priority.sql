-- Synthetic local fixtures only; no production writes.
begin;
\ir fixtures/external_api_seed.sql
create function pg_temp.check_priority(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
select external_api_private.prepare_priority();
-- Reuse a valid cache but inject deterministic synthetic ranking inputs. Rating
-- formula/invalidation are covered by priority_matrix.sql; this checks API order.
update public.priority_rating_cache set payload=jsonb_build_object('revision','api-order-a','people',jsonb_build_array(
 jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000001','vipNitro',1,'excludedNitro',false,'calculation',jsonb_build_object('total',1)),
 jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000002','vipNitro',2,'excludedNitro',false,'calculation',jsonb_build_object('total',1000)),
 jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000003','vipNitro',0,'excludedNitro',false,'calculation',jsonb_build_object('total',900))
)),dirty=false where period_start=(select active_period from public.priority_settings where id)
 and variant_id='nitro' and limit_group='50-100';

do $$ declare a jsonb; b jsonb; c jsonb; token uuid; frozen jsonb; old_page uuid; begin
 a:=public.external_api_sync(repeat('a',64),'2098-11-01',31);
 perform pg_temp.check_priority(a->'items'->0->>'id'='aaaaaaaa-0000-4000-8000-000000000001'
   and a->'items'->1->>'id'='aaaaaaaa-0000-4000-8000-000000000002'
   and a->'items'->2->>'id'='aaaaaaaa-0000-4000-8000-000000000003','Core precedes score in full');
 perform pg_temp.check_priority(a->'items'->0->'state'->'priority'->>'order'='1'
   and a->'items'->0->'state'->'priority'->>'period_start'=(select active_period::text from public.priority_settings where id),'explicit order and active period');
 old_page:=(a->>'next_page')::uuid;
 frozen:=public.external_api_sync(repeat('a',64),p_page=>old_page);
 token:=(frozen->>'cursor')::uuid;
 perform pg_temp.check_priority(public.external_api_sync(repeat('a',64),p_cursor=>token)->>'mode'='unchanged','idle priority cache');
 -- Change just the cached rating: there is NO occupancy/version write here.
 update public.priority_rating_cache set payload=jsonb_set(jsonb_set(payload,'{revision}','"api-order-b"'),'{people,0,excludedNitro}','true')
 where period_start=(select active_period from public.priority_settings where id) and variant_id='nitro' and limit_group='50-100';
 c:=public.external_api_sync(repeat('a',64),p_cursor=>token);
 perform pg_temp.check_priority(c->>'mode'='delta' and jsonb_array_length(c->'items')=3
   and not exists(select 1 from jsonb_array_elements(c->'items') x where x->>'type'<>'person'),'priority-only delta does not repeat cells');
 perform pg_temp.check_priority(c->'items'->0->>'id'='aaaaaaaa-0000-4000-8000-000000000002'
   and c->'items'->2->'state'->'priority'->>'excluded'='true','excluded moves last, ranks of others update');
 perform pg_temp.check_priority(public.external_api_sync(repeat('a',64),p_page=>old_page)=frozen,'priority changes preserve immutable pages');
 update public.priority_rating_cache set payload=jsonb_build_object('revision','api-score-only','people',jsonb_build_array(
  jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000001','vipNitro',0,'excludedNitro',false,'calculation',jsonb_build_object('total',2)),
  jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000002','vipNitro',0,'excludedNitro',false,'calculation',jsonb_build_object('total',5.5)),
  jsonb_build_object('memberId','aaaaaaaa-0000-4000-8000-000000000003','vipNitro',0,'excludedNitro',false,'calculation',jsonb_build_object('total',100))
 )) where period_start=(select active_period from public.priority_settings where id) and variant_id='nitro' and limit_group='50-100';
 c:=public.external_api_sync(repeat('a',64),p_cursor=>(c->>'cursor')::uuid);
 perform pg_temp.check_priority(c->'items'->0->>'id'='aaaaaaaa-0000-4000-8000-000000000003'
   and c->'items'->1->'state'->'priority'->>'score'='5.5','calculated score descending, preserves half points');
 -- Same scores: deterministic name then ID tie-break, not random map order.
 update public.priority_rating_cache set payload=jsonb_build_object('revision','api-order-c','people','[]'::jsonb)
 where period_start=(select active_period from public.priority_settings where id) and variant_id='nitro' and limit_group='50-100';
 c:=public.external_api_sync(repeat('a',64),p_cursor=>(c->>'cursor')::uuid);
 perform pg_temp.check_priority(c->'items'->0->>'id'='aaaaaaaa-0000-4000-8000-000000000002','name tie-break');
 perform pg_temp.check_priority(not has_function_privilege('anon','external_api_private.prepare_priority()','EXECUTE')
   and not has_function_privilege('authenticated','external_api_private.read_priority()','EXECUTE'),'private priority helpers');
end $$;
rollback;
