-- RPC behavior, authorization and rollback contract for member table presets.
-- Run after migrations against a disposable local database.

begin;

create temporary table member_table_preset_test_members (
  role_name text primary key,
  auth_id uuid not null,
  member_id uuid
) on commit drop;

insert into member_table_preset_test_members (role_name, auth_id) values
  ('owner', gen_random_uuid()),
  ('stranger', gen_random_uuid()),
  ('admin', gen_random_uuid());

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  auth_id,
  'authenticated',
  'authenticated',
  'table-presets-' || role_name || '@example.invalid',
  '',
  now(),
  now(),
  now()
from member_table_preset_test_members;

update member_table_preset_test_members test_member
set member_id = member.id
from members member
where member.auth_user_id = test_member.auth_id;

do $$
declare
  missing_roles text;
begin
  select string_agg(role_name, ', ' order by role_name)
  into missing_roles
  from member_table_preset_test_members
  where member_id is null;

  if missing_roles is not null then
    raise exception 'auth member bootstrap failed for: %', missing_roles;
  end if;

  if exists (
    select 1
    from member_table_preset_test_members test_member
    where not exists (
      select 1
      from member_table_presets preset
      where preset.member_id = test_member.member_id
        and preset.position = 1
        and preset.tables = 1
    )
  ) then
    raise exception 'new member did not receive its legacy tables value as the initial preset';
  end if;
end;
$$;

insert into member_roles (member_id, role_id)
select member_id, 'root'
from member_table_preset_test_members
where role_name = 'admin';

select set_config(
  'request.jwt.claim.sub',
  (select auth_id::text from member_table_preset_test_members where role_name = 'owner'),
  true
);

do $$
declare
  target_id uuid := (
    select member_id from member_table_preset_test_members where role_name = 'owner'
  );
  actual_values smallint[];
  active_tables smallint;
begin
  perform save_member_table_presets(target_id, '[8, 6, 10]'::jsonb);

  select array_agg(tables order by position)
  into actual_values
  from member_table_presets
  where member_id = target_id;

  select tables into active_tables from members where id = target_id;
  if actual_values is distinct from array[8, 6, 10]::smallint[]
     or active_tables <> 8 then
    raise exception 'owner presets or active fallback were not saved: %, %', actual_values, active_tables;
  end if;

  update members set tables = 6 where id = target_id;
  perform save_member_table_presets(target_id, '[10, 6, 4]'::jsonb);
  select tables into active_tables from members where id = target_id;
  if active_tables <> 6 then
    raise exception 'an active brush that remains in the presets was not preserved';
  end if;

  begin
    perform save_member_table_presets(target_id, '[]'::jsonb);
    raise exception 'empty preset list was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform save_member_table_presets(target_id, '[1, 2, 3, 4, 5, 6]'::jsonb);
    raise exception 'more than five presets were accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform save_member_table_presets(target_id, '[6, 6]'::jsonb);
    raise exception 'duplicate presets were accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform save_member_table_presets(target_id, '[0, 31]'::jsonb);
    raise exception 'out-of-range presets were accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform save_member_table_presets(target_id, '[2.5]'::jsonb);
    raise exception 'fractional preset was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform save_member_table_presets(target_id, '{"tables": 8}'::jsonb);
    raise exception 'non-array presets were accepted';
  exception when sqlstate '22023' then null;
  end;

  select array_agg(tables order by position)
  into actual_values
  from member_table_presets
  where member_id = target_id;
  if actual_values is distinct from array[10, 6, 4]::smallint[] then
    raise exception 'failed RPC changed a previously valid preset list: %', actual_values;
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select auth_id::text from member_table_preset_test_members where role_name = 'stranger'),
  true
);

do $$
declare
  target_id uuid := (
    select member_id from member_table_preset_test_members where role_name = 'owner'
  );
begin
  begin
    perform save_member_table_presets(target_id, '[3]'::jsonb);
    raise exception 'stranger changed another member presets';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select auth_id::text from member_table_preset_test_members where role_name = 'admin'),
  true
);

do $$
declare
  target_id uuid := (
    select member_id from member_table_preset_test_members where role_name = 'owner'
  );
  actual_values smallint[];
begin
  perform save_member_table_presets(target_id, '[12, 9]'::jsonb);
  select array_agg(tables order by position)
  into actual_values
  from member_table_presets
  where member_id = target_id;
  if actual_values is distinct from array[12, 9]::smallint[] then
    raise exception 'admin did not replace another member presets: %', actual_values;
  end if;
end;
$$;

rollback;
