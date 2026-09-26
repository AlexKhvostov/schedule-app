-- A distance import is authoritative for the current room nick.

alter table player_nicks
  add column if not exists source text not null default 'manual',
  add column if not exists distance_month date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'player_nicks_source_check'
      and conrelid = 'player_nicks'::regclass
  ) then
    alter table player_nicks
      add constraint player_nicks_source_check
      check (source in ('manual', 'distance'));
  end if;
end;
$$;

comment on column player_nicks.source is
  'manual when saved from a member/admin card; distance when discovered in an imported dump.';
comment on column player_nicks.distance_month is
  'Calendar month of the imported distance dump; null for manual changes.';

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
  v_player uuid;
  n integer;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then
    raise exception 'bad month' using errcode = '22007';
  end if;
  if p_part is null or p_part < 1 then raise exception 'bad part' using errcode = '22023'; end if;
  if p_entry_kind is null or not exists (select 1 from distance_entry_kinds k where k.id = p_entry_kind) then
    raise exception 'bad kind' using errcode = '22023';
  end if;
  select r.id into v_room from rooms r where r.slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;

  for rec in
    select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id,
           nullif(trim(x->>'variant_id'), '') variant_id,
           nullif(trim(x->>'limit_id'), '') limit_id,
           nullif(x->>'hands', '')::integer hands,
           nullif(trim(x->>'game_nick'), '') game_nick
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$'
       or rec.variant_id not in ('nitro', 'regular') or rec.hands is null or rec.hands < 0
       or not exists (select 1 from limits l where l.id = rec.limit_id) then
      v_unknown := v_unknown + 1; continue;
    end if;
    if rec.hands = 0 then v_skipped := v_skipped + 1; continue; end if;
    v_discord := null; v_member := null; v_player := null;
    select d.discord_id into v_discord from discord_distance_ids d where d.distance_ext_id = rec.distance_ext_id;
    select m.id into v_member from members m where m.distance_ext_id = rec.distance_ext_id limit 1;
    if v_member is null and v_discord is not null then
      select i.member_id into v_member from identities i where i.provider = 'discord' and i.provider_uid = v_discord limit 1;
    end if;

    insert into distances (member_id, room_id, month_start, variant_id, limit_id, format_id, entry_kind, part,
      hands, discord_id, distance_ext_id, batch_label, note, game_nick)
    values (v_member, v_room, p_month_start, rec.variant_id, rec.limit_id, 'mtt', p_entry_kind, p_part::smallint,
      rec.hands, v_discord, rec.distance_ext_id, nullif(trim(p_batch_label), ''), nullif(trim(p_note), ''), rec.game_nick)
    on conflict on constraint distances_slice_uidx do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      v_inserted := v_inserted + 1;
      if v_member is not null and rec.game_nick is not null then
        insert into players (member_id, room_id) values (v_member, v_room)
        on conflict (member_id, room_id) do update set room_id = excluded.room_id returning id into v_player;
        if rec.game_nick is distinct from (
          select pn.nick from player_nicks pn where pn.player_id = v_player order by pn.at desc, pn.id desc limit 1
        ) then
          insert into player_nicks (player_id, nick, source, distance_month)
          values (v_player, rec.game_nick, 'distance', p_month_start);
        end if;
      end if;
    else v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown);
end;
$$;

comment on function save_distance_dump(text, date, text, integer, text, text, jsonb) is
  'Root-only atomic distance import. Stores room snapshots and promotes a changed dump nick into player_nicks.';
