-- Ordinary business conflicts must not trigger PostgREST's SQLSTATE 40001 retry loop.
-- Preserve signatures, settings, checks and existing ACLs; change only error codes.
do $migration$
declare
  target regprocedure;
  definition text;
  replacements integer;
  total integer := 0;
begin
  foreach target in array array[
    'public.apply_schedule_edit_v2(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.apply_schedule_edit(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.close_priority_request(uuid,text)'::regprocedure,
    'public.save_club_order(text,jsonb)'::regprocedure,
    'public.save_member_distance_ids(uuid,text[],text[])'::regprocedure,
    'public.save_schedule_appearance(jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_schedule_hour_load(text,jsonb,jsonb)'::regprocedure,
    'public.save_schedule_limit_palette(jsonb,jsonb)'::regprocedure,
    'public.save_schedule_locked_appearance(jsonb,jsonb)'::regprocedure,
    'public.save_schedule_sync(boolean,integer,boolean,integer)'::regprocedure,
    'public.set_active_priority(date,bigint)'::regprocedure,
    'public.submit_priority_request(date,text,jsonb,text,boolean,text)'::regprocedure,
    'public.submit_priority_slice_request(date,text,jsonb,text,text,boolean,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    replacements := (length(definition)-length(replace(definition, '''40001''', '')))/7;
    if replacements = 0 then
      raise exception 'Expected business conflict code in %', target;
    end if;
    execute replace(definition, '''40001''', '''PT409''');
    total := total + replacements;
  end loop;
  if total <> 21 then
    raise exception 'Expected 21 business conflict codes, got %', total;
  end if;
end;
$migration$;
