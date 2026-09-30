-- RPC behavior and rollback contract for admin-controlled schedule filter limits.
-- Run after migrations against a disposable local database.

begin;

do $$
declare
  v_auth_id uuid := gen_random_uuid();
  v_plain_auth_id uuid := gen_random_uuid();
  v_member_id uuid;
  v_kind_count bigint;
  v_disabled_kind uuid;
  v_slot_date date := current_date + 7;
  v_nitro text[];
  v_regular text[];
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_auth_id,
    'authenticated',
    'authenticated',
    'schedule-filter-limits-test@example.invalid',
    '',
    now(),
    now(),
    now()
  );

  insert into members (auth_user_id, public_code, access_status, mark_tag)
  values (v_auth_id, 'RP-F01TST', 'active', 'F1')
  returning id into v_member_id;

  insert into member_roles (member_id, role_id)
  values (v_member_id, 'root');

  perform set_config('request.jwt.claim.sub', v_auth_id::text, true);
  select count(*) into v_kind_count from schedule_kinds;
  select id into v_disabled_kind from schedule_kinds where variant_id = 'nitro' and limit_id = '25';

  perform apply_own_slots(
    v_disabled_kind,
    v_member_id,
    jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0, 'tables', 1)),
    '[]'::jsonb
  );

  perform save_schedule_filter_limits(array['100', '50', '50'], array['25', '50']);

  perform apply_own_slots(
    v_disabled_kind,
    v_member_id,
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0))
  );

  begin
    perform apply_own_slots(
      v_disabled_kind,
      v_member_id,
      jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0, 'tables', 1)),
      '[]'::jsonb
    );
    raise exception 'disabled schedule filter limit accepted a new mark';
  exception
    when sqlstate '42501' then null;
  end;

  select filter_limits_nitro, filter_limits_regular
  into v_nitro, v_regular
  from schedule_settings
  where id;

  if v_nitro is distinct from array['50', '100']::text[]
     or v_regular is distinct from array['25', '50']::text[] then
    raise exception 'schedule filter limits were not normalized and saved atomically: %, %', v_nitro, v_regular;
  end if;

  begin
    perform save_schedule_filter_limits(array[]::text[], array['50']);
    raise exception 'empty Nitro limits were accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform save_schedule_filter_limits(array['50', 'not-a-limit'], array['50']);
    raise exception 'unknown Nitro limit was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  select filter_limits_nitro, filter_limits_regular
  into v_nitro, v_regular
  from schedule_settings
  where id;

  if v_nitro is distinct from array['50', '100']::text[]
     or v_regular is distinct from array['25', '50']::text[] then
    raise exception 'failed RPC changed a previously valid setting';
  end if;

  if (select count(*) from schedule_kinds) <> v_kind_count then
    raise exception 'filter setting changed schedule_kinds';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_plain_auth_id,
    'authenticated',
    'authenticated',
    'schedule-filter-limits-plain@example.invalid',
    '',
    now(),
    now(),
    now()
  );

  insert into members (auth_user_id, public_code, access_status, mark_tag)
  values (v_plain_auth_id, 'RP-F01USR', 'active', 'F2');

  perform set_config('request.jwt.claim.sub', v_plain_auth_id::text, true);

  begin
    perform save_schedule_filter_limits(array['50'], array['50']);
    raise exception 'member without schedule.manage changed filter limits';
  exception
    when sqlstate '42501' then null;
  end;

  select filter_limits_nitro, filter_limits_regular
  into v_nitro, v_regular
  from schedule_settings
  where id;

  if v_nitro is distinct from array['50', '100']::text[]
     or v_regular is distinct from array['25', '50']::text[] then
    raise exception 'unauthorized RPC changed a previously valid setting';
  end if;
end;
$$;

rollback;
