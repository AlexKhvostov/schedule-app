-- Run against a migrated test database with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_contracts.sql

begin;

do $$
declare
  missing_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if missing_rls is not null then
    raise exception 'all public tables must enable RLS; missing: %', missing_rls;
  end if;

  if has_table_privilege('authenticated', 'public.distances', 'INSERT')
     or has_table_privilege('authenticated', 'public.distances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.distances', 'DELETE') then
    raise exception 'authenticated must not write distances directly';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_recent_removal_notifications(uuid)',
    'EXECUTE'
  ) then
    raise exception 'notification claim RPC must be service-role only';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.save_distance_rows(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'staff correction RPC must remain callable by authenticated users';
  end if;

  if not has_function_privilege('authenticated', 'public.schedule_player_directory(text,text[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_people_snapshot()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_member_plays(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_payment_methods(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_capacity_profiles(text,jsonb)', 'EXECUTE') then
    raise exception 'consolidated data-access RPC grants are incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.occupancy_event_notifications', 'SELECT')
     or has_table_privilege('authenticated', 'public.occupancy_event_notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.occupancy_event_notifications', 'UPDATE')
     or has_table_privilege('authenticated', 'public.occupancy_event_notifications', 'DELETE') then
    raise exception 'notification delivery audit must remain service-role only';
  end if;

  if not has_table_privilege('authenticated', 'public.app_roles', 'SELECT')
     or has_table_privilege('authenticated', 'public.app_roles', 'INSERT')
     or has_table_privilege('authenticated', 'public.app_roles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.app_roles', 'DELETE') then
    raise exception 'authenticated may only read app_roles';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'occupancy_event_notifications'
      and column_name = 'attempt_count'
  ) then
    raise exception 'notification retry attempt counter is missing';
  end if;
end;
$$;

rollback;
