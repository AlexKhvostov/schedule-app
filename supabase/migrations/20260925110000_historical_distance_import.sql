-- Root-only atomic import for the wide historical CSV format.

create or replace function save_historical_distance_dump(
  p_room_slug text,
  p_variant_id text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_unknown integer := 0;
  v_nick_updated integer := 0;
  v_member uuid;
  v_discord text;
  v_player uuid;
  v_inserted_ext_ids text[] := '{}'::text[];
  rec record;
  n integer;
begin
  if not is_root() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_variant_id not in ('nitro', 'regular') then
    raise exception 'bad variant' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then
    raise exception 'bad room' using errcode = '22023';
  end if;

  for rec in
    select
      nullif(trim(x->>'distance_ext_id'), '') as distance_ext_id,
      nullif(trim(x->>'discord_id'), '') as source_discord_id,
      nullif(trim(x->>'game_nick'), '') as game_nick,
      nullif(x->>'month_start', '')::date as month_start,
      nullif(x->>'part', '')::integer as part,
      nullif(trim(x->>'limit_id'), '') as limit_id,
      nullif(x->>'hands', '')::integer as hands
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null
       or rec.distance_ext_id !~ '^[0-9]{1,12}$'
       or (rec.source_discord_id is not null and rec.source_discord_id !~ '^[0-9]{15,22}$')
       or rec.month_start is null
       or rec.month_start is distinct from date_trunc('month', rec.month_start)::date
       or rec.part is null or rec.part < 1
       or rec.hands is null or rec.hands <= 0
       or not exists (select 1 from limits where id = rec.limit_id)
    then
      v_unknown := v_unknown + 1;
      continue;
    end if;

    v_member := null;
    v_discord := rec.source_discord_id;
    if v_discord is null then
      select discord_id into v_discord
      from discord_distance_ids
      where distance_ext_id = rec.distance_ext_id;
    end if;
    select id into v_member from members where distance_ext_id = rec.distance_ext_id limit 1;
    if v_member is null and v_discord is not null then
      select member_id into v_member
      from identities
      where provider = 'discord' and provider_uid = v_discord
      limit 1;
    end if;

    insert into distances (
      member_id, room_id, month_start, variant_id, limit_id, format_id,
      entry_kind, part, hands, discord_id, distance_ext_id, batch_label, note, game_nick
    ) values (
      v_member, v_room, rec.month_start, p_variant_id, rec.limit_id, 'mtt',
      'primary', rec.part::smallint, rec.hands, v_discord, rec.distance_ext_id,
      'historical-wide-csv', 'Historical distance import', rec.game_nick
    )
    on conflict on constraint distances_slice_uidx do nothing;

    get diagnostics n = row_count;
    if n > 0 then
      v_inserted := v_inserted + 1;
      v_inserted_ext_ids := array_append(v_inserted_ext_ids, rec.distance_ext_id);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  for rec in
    select distinct on (nullif(trim(x->>'distance_ext_id'), ''))
      nullif(trim(x->>'distance_ext_id'), '') as distance_ext_id,
      nullif(trim(x->>'discord_id'), '') as source_discord_id,
      nullif(trim(x->>'game_nick'), '') as game_nick,
      nullif(x->>'month_start', '')::date as month_start
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
    where nullif(trim(x->>'distance_ext_id'), '') = any(v_inserted_ext_ids)
      and nullif(trim(x->>'game_nick'), '') is not null
    order by nullif(trim(x->>'distance_ext_id'), ''), nullif(x->>'month_start', '')::date desc
  loop
    v_member := null;
    v_discord := rec.source_discord_id;
    if v_discord is null then
      select discord_id into v_discord from discord_distance_ids where distance_ext_id = rec.distance_ext_id;
    end if;
    select id into v_member from members where distance_ext_id = rec.distance_ext_id limit 1;
    if v_member is null and v_discord is not null then
      select member_id into v_member from identities
      where provider = 'discord' and provider_uid = v_discord limit 1;
    end if;
    if v_member is not null then
      insert into players (member_id, room_id) values (v_member, v_room)
      on conflict (member_id, room_id) do update set room_id = excluded.room_id
      returning id into v_player;
      if rec.game_nick is distinct from (
        select nick from player_nicks where player_id = v_player order by at desc, id desc limit 1
      ) then
        insert into player_nicks (player_id, nick, source, distance_month)
        values (v_player, rec.game_nick, 'distance', rec.month_start);
        v_nick_updated := v_nick_updated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'unknown', v_unknown,
    'nick_updated', v_nick_updated
  );
end;
$$;

revoke all on function save_historical_distance_dump(text, text, jsonb) from public, anon;
grant execute on function save_historical_distance_dump(text, text, jsonb) to authenticated;

comment on function save_historical_distance_dump(text, text, jsonb) is
  'Root-only atomic import for normalized facts parsed from a four-header-row historical distance CSV.';
