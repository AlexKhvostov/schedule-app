-- Snapshot of the dump room nick so Admin can sort distances without the CSV.

alter table distances
  add column if not exists game_nick text;

comment on column distances.game_nick is
  'Room nickname from the dump at write. Snapshot, not a live FK to player_nicks.';

create or replace function save_distance_dump(
  p_room_slug text,
  p_month_start date,
  p_entry_kind text,
  p_part integer,
  p_batch_label text,
  p_note text,
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
  rec record;
  v_member uuid;
  v_discord text;
  n integer;
begin
  if not is_root() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then
    raise exception 'bad month' using errcode = '22007';
  end if;
  if p_part is null or p_part < 1 then
    raise exception 'bad part' using errcode = '22023';
  end if;
  if p_entry_kind is null or not exists (
    select 1 from distance_entry_kinds k where k.id = p_entry_kind
  ) then
    raise exception 'bad kind' using errcode = '22023';
  end if;

  select r.id into v_room
  from rooms r
  where r.slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then
    raise exception 'bad room' using errcode = '22023';
  end if;

  for rec in
    select
      nullif(trim(x->>'distance_ext_id'), '') as distance_ext_id,
      nullif(trim(x->>'variant_id'), '') as variant_id,
      nullif(trim(x->>'limit_id'), '') as limit_id,
      nullif(x->>'hands', '')::integer as hands,
      nullif(trim(x->>'game_nick'), '') as game_nick
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null
       or rec.distance_ext_id !~ '^[0-9]{1,12}$'
       or rec.variant_id not in ('nitro', 'regular')
       or rec.hands is null
       or rec.hands < 0
       or not exists (select 1 from limits l where l.id = rec.limit_id)
    then
      v_unknown := v_unknown + 1;
      continue;
    end if;
    if rec.hands = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_discord := null;
    v_member := null;

    select d.discord_id into v_discord
    from discord_distance_ids d
    where d.distance_ext_id = rec.distance_ext_id;

    select m.id into v_member
    from members m
    where m.distance_ext_id = rec.distance_ext_id
    limit 1;

    if v_member is null and v_discord is not null then
      select i.member_id into v_member
      from identities i
      where i.provider = 'discord'
        and i.provider_uid = v_discord
      limit 1;
    end if;

    insert into distances (
      member_id,
      room_id,
      month_start,
      variant_id,
      limit_id,
      format_id,
      entry_kind,
      part,
      hands,
      discord_id,
      distance_ext_id,
      batch_label,
      note,
      game_nick
    ) values (
      v_member,
      v_room,
      p_month_start,
      rec.variant_id,
      rec.limit_id,
      'mtt',
      p_entry_kind,
      p_part::smallint,
      rec.hands,
      v_discord,
      rec.distance_ext_id,
      nullif(trim(p_batch_label), ''),
      nullif(trim(p_note), ''),
      rec.game_nick
    )
    on conflict on constraint distances_slice_uidx do nothing;

    get diagnostics n = row_count;
    if n > 0 then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'unknown', v_unknown
  );
end;
$$;

comment on function save_distance_dump(text, date, text, integer, text, text, jsonb) is
  'Root-only dump insert. Skips identical month/limit/part/distance rows. Stores dump room nick. Does not overwrite.';
