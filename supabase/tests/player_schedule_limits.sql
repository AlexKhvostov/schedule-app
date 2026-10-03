-- New marks require the target player's matching cabinet limit.
-- Existing marks remain removable when that selection is disabled.

begin;

do $$
declare
  v_auth_id uuid;
  v_member_id uuid;
  v_kind_id uuid;
  v_player_id uuid;
  v_slot_date date := current_date + 370;
begin
  select m.id, m.auth_user_id
  into v_member_id, v_auth_id
  from members m
  join member_roles mr on mr.member_id = m.id and mr.role_id = 'root'
  where m.auth_user_id is not null
  limit 1;

  if v_member_id is null then
    v_auth_id := gen_random_uuid();
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
      'player-schedule-limits-test@example.invalid',
      '',
      now(),
      now(),
      now()
    );

    insert into members (auth_user_id, public_code, access_status, mark_tag)
    values (v_auth_id, 'RP-PL1TST', 'active', 'P1')
    returning id into v_member_id;

    insert into member_roles (member_id, role_id)
    values (v_member_id, 'root');
  end if;

  select id into v_kind_id
  from schedule_kinds
  where variant_id = 'nitro' and limit_id = '50'
  limit 1;

  insert into players (member_id, room_id)
  select v_member_id, room_id from schedule_kinds where id = v_kind_id
  on conflict (member_id, room_id) do update set room_id = excluded.room_id
  returning id into v_player_id;

  insert into player_limits (player_id, variant_id, limit_id)
  values (v_player_id, 'nitro', '50')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub', v_auth_id::text, true);
  perform save_schedule_filter_limits(array['50'], array['50']);

  perform apply_own_slots(
    v_kind_id,
    v_member_id,
    jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0, 'tables', 1)),
    '[]'::jsonb
  );

  delete from player_limits where player_id = v_player_id and variant_id = 'nitro' and limit_id = '50';

  perform apply_own_slots(
    v_kind_id,
    v_member_id,
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0))
  );

  begin
    perform apply_own_slots(
      v_kind_id,
      v_member_id,
      jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0, 'tables', 1)),
      '[]'::jsonb
    );
    raise exception 'player without the cabinet limit placed a new mark';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'schedule-player-limit-not-selected' then
        raise;
      end if;
  end;

  insert into player_limits (player_id, variant_id, limit_id)
  values (v_player_id, 'nitro', '50');

  perform apply_own_slots(
    v_kind_id,
    v_member_id,
    jsonb_build_array(jsonb_build_object('date', v_slot_date, 'half', 20, 'level', 0, 'tables', 1)),
    '[]'::jsonb
  );
end;
$$;

rollback;
