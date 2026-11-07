-- Existing entries may be explicitly cleared. Retain the entry and its audit
-- metadata; a new manual entry still requires at least one positive value.
alter table public.distance_entries add column manual_override boolean not null default false;
-- The only application UPDATE of entry metadata before this migration was the
-- manual editor. Preserve its existing corrections as well as manual entries.
alter table public.distance_entries disable trigger distance_entries_touch;
update public.distance_entries set manual_override = true
where source = 'manual' or updated_at > created_at;
alter table public.distance_entries enable trigger distance_entries_touch;

create or replace function public.update_manual_distance_entry(p_entry_id uuid, p_comment text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_count integer := 0; rec record;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(jsonb_typeof(p_values), 'null') <> 'array' then
    raise exception 'bad values' using errcode = '22023';
  end if;
  if jsonb_array_length(p_values) = 0 then
    raise exception 'empty values' using errcode = '22023';
  end if;
  -- Serialize complete replacements of the same entry.
  perform 1 from public.distance_entries where id = p_entry_id for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  delete from public.distance_values where entry_id = p_entry_id;
  for rec in select nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'tournaments', '')::integer tournaments
    from jsonb_array_elements(p_values) x
  loop
    if rec.tournaments is null or rec.tournaments < 0 or not exists (select 1 from public.limits where id = rec.limit_id) then
      raise exception 'bad value' using errcode = '22023';
    end if;
    if rec.tournaments > 0 then
      insert into public.distance_values (entry_id, limit_id, tournaments) values (p_entry_id, rec.limit_id, rec.tournaments);
      v_count := v_count + 1;
    end if;
  end loop;
  update public.distance_entries set comment = nullif(trim(p_comment), ''), updated_by = public.current_member_id(), manual_override = true where id = p_entry_id;
  return jsonb_build_object('id', p_entry_id, 'values', v_count);
end;
$$;

revoke all on function public.update_manual_distance_entry(uuid, text, jsonb) from public, anon;
grant execute on function public.update_manual_distance_entry(uuid, text, jsonb) to authenticated;

create or replace function public.write_normalized_distance_value(
  p_batch_id uuid, p_member_id uuid, p_room_id uuid, p_month_start date,
  p_variant_id text, p_part integer, p_comment text, p_discord_id text,
  p_distance_ext_id text, p_game_nick text, p_source text, p_limit_id text, p_tournaments integer, p_overwrite_manual boolean
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_entry uuid; n integer; v_manual boolean;
begin
  select id into v_entry from public.distance_entries
  where room_id = p_room_id and month_start = p_month_start and variant_id = p_variant_id
    and format_id = 'mtt' and part = p_part and distance_ext_id = p_distance_ext_id;
  if v_entry is null and p_tournaments = 0 then return false; end if;
  if v_entry is null then
    insert into public.distance_entries (batch_id, member_id, room_id, month_start, variant_id, part, comment,
      discord_id, distance_ext_id, game_nick, source, created_by, updated_by)
    values (p_batch_id, p_member_id, p_room_id, p_month_start, p_variant_id, p_part,
      nullif(trim(p_comment), ''), p_discord_id, p_distance_ext_id, p_game_nick, p_source,
      public.current_member_id(), public.current_member_id())
    on conflict (room_id, month_start, variant_id, format_id, part, distance_ext_id) do nothing
    returning id into v_entry;
    if v_entry is null then
      select id into v_entry from public.distance_entries
      where room_id = p_room_id and month_start = p_month_start and variant_id = p_variant_id
        and format_id = 'mtt' and part = p_part and distance_ext_id = p_distance_ext_id;
    end if;
  end if;
  select manual_override or source = 'manual' into v_manual from public.distance_entries where id = v_entry for update;
  if v_manual and not coalesce(p_overwrite_manual, false) then return false; end if;
  if v_manual then
    if p_tournaments = 0 then
      delete from public.distance_values where entry_id = v_entry and limit_id = p_limit_id;
    else
      insert into public.distance_values (entry_id, limit_id, tournaments)
      values (v_entry, p_limit_id, p_tournaments)
      on conflict (entry_id, limit_id) do update set tournaments = excluded.tournaments
      where distance_values.tournaments is distinct from excluded.tournaments;
    end if;
  else
    if p_tournaments = 0 then return false; end if;
    insert into public.distance_values (entry_id, limit_id, tournaments)
    values (v_entry, p_limit_id, p_tournaments)
    on conflict (entry_id, limit_id) do nothing;
  end if;
  get diagnostics n = row_count;
  if n > 0 and v_manual then
    update public.distance_entries set updated_by = public.current_member_id() where id = v_entry;
  end if;
  return n > 0;
end;
$$;
revoke all on function public.write_normalized_distance_value(uuid, uuid, uuid, date, text, integer, text, text, text, text, text, text, integer, boolean) from public, anon, authenticated;

create or replace function public.write_normalized_distance_value(
  p_batch_id uuid, p_member_id uuid, p_room_id uuid, p_month_start date,
  p_variant_id text, p_part integer, p_comment text, p_discord_id text,
  p_distance_ext_id text, p_game_nick text, p_source text, p_limit_id text, p_tournaments integer
)
returns boolean language sql security invoker set search_path = '' as $$
  select public.write_normalized_distance_value(p_batch_id,p_member_id,p_room_id,p_month_start,
    p_variant_id,p_part,p_comment,p_discord_id,p_distance_ext_id,p_game_nick,p_source,p_limit_id,p_tournaments,false);
$$;
revoke all on function public.write_normalized_distance_value(uuid, uuid, uuid, date, text, integer, text, text, text, text, text, text, integer) from public, anon, authenticated;

create or replace function public.save_distance_dump(
  p_room_slug text, p_month_start date, p_entry_kind text, p_part integer,
  p_batch_label text, p_note text, p_rows jsonb, p_overwrite_manual boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not public.is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_part is null or p_part < 1 then raise exception 'bad part' using errcode = '22023'; end if;
  select id into v_room from public.rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into public.distance_batches (source, file_name, created_by) values ('import', nullif(trim(p_batch_label), ''), public.current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id,
      nullif(trim(x->>'variant_id'), '') variant_id, nullif(trim(x->>'limit_id'), '') limit_id,
      nullif(x->>'hands', '')::integer hands, nullif(trim(x->>'game_nick'), '') game_nick
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$' or rec.variant_id not in ('nitro', 'regular')
      or rec.hands is null or rec.hands < 0 or not exists (select 1 from public.limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    perform public.remember_distance_nick(v_room,rec.distance_ext_id,rec.game_nick,p_month_start);
    v_member := null; v_discord := null;
    did_insert := public.write_normalized_distance_value(v_batch, v_member, v_room, p_month_start, rec.variant_id, p_part,
      p_note, v_discord, rec.distance_ext_id, rec.game_nick, 'import', rec.limit_id, rec.hands, p_overwrite_manual);
    if did_insert then
      v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from public.distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown);
end;
$$;

revoke all on function public.save_distance_dump(text, date, text, integer, text, text, jsonb, boolean) from public, anon;
grant execute on function public.save_distance_dump(text, date, text, integer, text, text, jsonb, boolean) to authenticated;

-- Existing clients keep the safe, non-overwriting default.
create or replace function public.save_distance_dump(p_room_slug text, p_month_start date, p_entry_kind text, p_part integer, p_batch_label text, p_note text, p_rows jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.save_distance_dump(p_room_slug,p_month_start,p_entry_kind,p_part,p_batch_label,p_note,p_rows,false);
$$;
revoke all on function public.save_distance_dump(text, date, text, integer, text, text, jsonb) from public, anon;
grant execute on function public.save_distance_dump(text, date, text, integer, text, text, jsonb) to authenticated;

create or replace function public.save_historical_distance_dump(p_room_slug text, p_variant_id text, p_rows jsonb, p_overwrite_manual boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0; v_nick_updated integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not public.is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_variant_id not in ('nitro', 'regular') then raise exception 'bad variant' using errcode = '22023'; end if;
  select id into v_room from public.rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into public.distance_batches (source, file_name, created_by) values ('historical', 'historical-wide-csv', public.current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id, nullif(trim(x->>'discord_id'), '') source_discord_id,
      nullif(trim(x->>'game_nick'), '') game_nick, nullif(x->>'month_start', '')::date month_start,
      nullif(x->>'part', '')::integer part, nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'hands', '')::integer hands
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$'
      or (rec.source_discord_id is not null and rec.source_discord_id !~ '^[0-9]{15,22}$')
      or rec.month_start is null or rec.month_start is distinct from date_trunc('month', rec.month_start)::date
      or rec.part is null or rec.part < 1 or rec.hands is null or rec.hands < 0
      or not exists (select 1 from public.limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    v_discord := rec.source_discord_id; v_member := null;
    perform public.remember_distance_nick(v_room,rec.distance_ext_id,rec.game_nick,rec.month_start);
    did_insert := public.write_normalized_distance_value(v_batch, v_member, v_room, rec.month_start, p_variant_id, rec.part,
      'Historical distance import', v_discord, rec.distance_ext_id, rec.game_nick, 'historical', rec.limit_id, rec.hands, p_overwrite_manual);
    if did_insert then
      v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from public.distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown, 'nick_updated', v_nick_updated);
end;
$$;

revoke all on function public.save_historical_distance_dump(text, text, jsonb, boolean) from public, anon;
grant execute on function public.save_historical_distance_dump(text, text, jsonb, boolean) to authenticated;

-- Existing clients keep the safe, non-overwriting default.
create or replace function public.save_historical_distance_dump(p_room_slug text, p_variant_id text, p_rows jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.save_historical_distance_dump(p_room_slug,p_variant_id,p_rows,false);
$$;
revoke all on function public.save_historical_distance_dump(text, text, jsonb) from public, anon;
grant execute on function public.save_historical_distance_dump(text, text, jsonb) to authenticated;
