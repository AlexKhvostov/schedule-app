-- A distance record is one logical entry (member / room / month / variant / part)
-- with separate values per limit. The legacy distances table stays for rollback.

create table distance_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('import', 'historical', 'manual', 'legacy')),
  file_name text,
  created_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now()
);

create table distance_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references distance_batches (id) on delete set null,
  member_id uuid references members (id) on delete set null,
  room_id uuid not null references rooms (id),
  month_start date not null,
  variant_id text not null references variants (id),
  format_id text not null default 'mtt' references formats (id),
  part smallint not null default 1,
  comment text,
  discord_id text,
  distance_ext_id text not null,
  game_nick text,
  source text not null check (source in ('import', 'historical', 'manual', 'legacy')),
  created_by uuid references members (id) on delete set null,
  updated_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date),
  check (part >= 1),
  check (distance_ext_id ~ '^[0-9]{1,12}$'),
  unique (room_id, month_start, variant_id, format_id, part, distance_ext_id)
);

create table distance_values (
  entry_id uuid not null references distance_entries (id) on delete cascade,
  limit_id text not null references limits (id),
  tournaments integer not null check (tournaments > 0),
  updated_at timestamptz not null default now(),
  primary key (entry_id, limit_id)
);

create index distance_entries_member_month_idx on distance_entries (member_id, month_start);
create index distance_entries_ext_month_idx on distance_entries (distance_ext_id, month_start);
create index distance_entries_room_month_variant_idx on distance_entries (room_id, month_start, variant_id);
create index distance_entries_updated_idx on distance_entries (updated_at desc);
create index distance_values_limit_entry_idx on distance_values (limit_id, entry_id);

comment on table distance_entries is
  'One logical distance record. Part is the only user-facing subdivision; primary/correction and labels are legacy-only.';
comment on table distance_values is
  'Positive tournament counts by limit for a logical distance entry. Missing value means zero.';
comment on table distance_batches is
  'One import or manual write operation, retained so a specific load can later be rolled back safely.';

alter table distance_batches enable row level security;
alter table distance_entries enable row level security;
alter table distance_values enable row level security;

grant select, insert, update, delete on distance_batches, distance_entries, distance_values to authenticated;
revoke all on distance_batches, distance_entries, distance_values from anon;

create policy distance_batches_staff on distance_batches for all to authenticated
  using (is_staff()) with check (is_staff());
create policy distance_entries_read on distance_entries for select to authenticated
  using (current_has_permission('distances') or current_has_permission('admin.people'));
create policy distance_entries_write on distance_entries for all to authenticated
  using (is_staff()) with check (is_staff());
create policy distance_values_read on distance_values for select to authenticated
  using (current_has_permission('distances') or current_has_permission('admin.people'));
create policy distance_values_write on distance_values for all to authenticated
  using (is_staff()) with check (is_staff());

-- Backfill legacy rows. If primary/correction reused the same part, assign consecutive
-- parts so the simplified model remains unambiguous.
do $$
begin
  if exists (select 1 from distances where hands < 0) then
    raise exception 'negative legacy distance corrections must be resolved before normalization';
  end if;
end;
$$;

create temporary table distance_legacy_groups on commit drop as
with grouped as (
  select
    gen_random_uuid() as entry_id,
    d.member_id, d.room_id, d.month_start, d.variant_id, d.format_id,
    d.part as old_part, d.entry_kind, d.distance_ext_id,
    max(d.discord_id) as discord_id,
    max(d.game_nick) as game_nick,
    max(d.note) as comment,
    min(d.created_at) as created_at,
    max(d.updated_at) as updated_at
  from distances d
  group by d.member_id, d.room_id, d.month_start, d.variant_id, d.format_id,
    d.part, d.entry_kind, d.distance_ext_id
), ranked as (
  select g.*,
    row_number() over (
      partition by g.room_id, g.month_start, g.variant_id, g.format_id, g.distance_ext_id, g.old_part
      order by case when g.entry_kind = 'primary' then 0 else 1 end, g.entry_id
    ) as within_part,
    max(g.old_part) over (
      partition by g.room_id, g.month_start, g.variant_id, g.format_id, g.distance_ext_id
    ) as max_part
  from grouped g
)
select r.*,
  case when r.within_part = 1 then r.old_part else r.max_part +
    sum(case when r.within_part > 1 then 1 else 0 end) over (
      partition by r.room_id, r.month_start, r.variant_id, r.format_id, r.distance_ext_id
      order by r.old_part, r.within_part, r.entry_id
    )
  end::smallint as new_part
from ranked r;

insert into distance_entries (
  id, member_id, room_id, month_start, variant_id, format_id, part, comment,
  discord_id, distance_ext_id, game_nick, source, created_at, updated_at
)
select entry_id, member_id, room_id, month_start, variant_id, format_id, new_part,
  comment, discord_id, distance_ext_id, game_nick, 'legacy', created_at, updated_at
from distance_legacy_groups;

insert into distance_values (entry_id, limit_id, tournaments, updated_at)
select g.entry_id, d.limit_id, sum(d.hands)::integer, max(d.updated_at)
from distances d
join distance_legacy_groups g
  on g.member_id is not distinct from d.member_id
 and g.room_id = d.room_id
 and g.month_start = d.month_start
 and g.variant_id = d.variant_id
 and g.format_id = d.format_id
 and g.old_part = d.part
 and g.entry_kind = d.entry_kind
 and g.distance_ext_id = d.distance_ext_id
where d.hands > 0
group by g.entry_id, d.limit_id;

create or replace function distance_entries_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger distance_entries_touch
  before update on distance_entries
  for each row execute function distance_entries_touch();

create or replace function admin_distance_book(p_month_start date, p_room_slug text default 'winamax')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_room uuid;
begin
  if not current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id,
        'distance_ext_id', m.distance_ext_id,
        'discord_id', i.provider_uid,
        'discord_nick', coalesce(dm.guild_nick, dm.global_name, dm.username, i.guild_nick, i.display_name, i.username, p.display_name, ''),
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'game_nick', coalesce(pn.nick, '')
      ) order by coalesce(dm.guild_nick, dm.global_name, dm.username, i.display_name, p.display_name, m.public_code))
      from members m
      left join profiles p on p.member_id = m.id
      left join lateral (
        select x.* from identities x where x.member_id = m.id and x.provider = 'discord' limit 1
      ) i on true
      left join discord_members dm on dm.discord_id = i.provider_uid
      left join players pl on pl.member_id = m.id and pl.room_id = v_room
      left join lateral (
        select n.nick from player_nicks n where n.player_id = pl.id order by n.at desc, n.id desc limit 1
      ) pn on true
      where m.access_status = 'active'
        and exists (select 1 from member_roles mr where mr.member_id = m.id and mr.role_id in ('member', 'admin'))
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'member_id', e.member_id, 'distance_ext_id', e.distance_ext_id,
        'discord_id', e.discord_id, 'game_nick', e.game_nick, 'variant_id', e.variant_id,
        'part', e.part, 'comment', e.comment, 'source', e.source,
        'created_at', e.created_at, 'updated_at', e.updated_at,
        'created_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.created_by),
        'updated_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.updated_by),
        'values', coalesce((select jsonb_agg(jsonb_build_object('limit_id', v.limit_id, 'tournaments', v.tournaments)) from distance_values v where v.entry_id = e.id), '[]'::jsonb)
      ) order by e.distance_ext_id, e.variant_id, e.part)
      from distance_entries e where e.month_start = p_month_start and e.room_id = v_room
    ), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(l.id order by l.sort, l.id) from limits l), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(x.month_start order by x.month_start desc) from (select distinct month_start from distance_entries) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function admin_distance_book(date, text) from public, anon;
grant execute on function admin_distance_book(date, text) to authenticated;

create or replace function create_manual_distance_entry(
  p_member_id uuid, p_room_slug text, p_month_start date, p_variant_id text,
  p_part integer, p_comment text, p_distance_ext_id text, p_values jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_ext text; v_discord text; v_nick text; v_entry uuid; v_batch uuid;
  v_count integer := 0; rec record;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_variant_id not in ('nitro', 'regular') or p_part is null or p_part < 1 then raise exception 'bad entry' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  select distance_ext_id into v_ext from members where id = p_member_id and access_status = 'active' for update;
  if not found then raise exception 'bad member' using errcode = '22023'; end if;
  v_ext := coalesce(v_ext, nullif(trim(p_distance_ext_id), ''));
  if v_ext is null or v_ext !~ '^[0-9]{1,12}$' then raise exception 'bad distance id' using errcode = '22023'; end if;
  if exists (select 1 from members where distance_ext_id = v_ext and id <> p_member_id) then raise exception 'distance id already used' using errcode = '23505'; end if;
  select provider_uid into v_discord from identities where member_id = p_member_id and provider = 'discord' limit 1;
  update members set distance_ext_id = v_ext where id = p_member_id and distance_ext_id is null;
  if v_discord is not null then
    insert into discord_distance_ids (discord_id, distance_ext_id) values (v_discord, v_ext)
    on conflict (discord_id) do update set distance_ext_id = excluded.distance_ext_id;
  end if;
  select pn.nick into v_nick from players pl join player_nicks pn on pn.player_id = pl.id
    where pl.member_id = p_member_id and pl.room_id = v_room order by pn.at desc, pn.id desc limit 1;
  insert into distance_batches (source, created_by) values ('manual', current_member_id()) returning id into v_batch;
  insert into distance_entries (batch_id, member_id, room_id, month_start, variant_id, part, comment,
    discord_id, distance_ext_id, game_nick, source, created_by, updated_by)
  values (v_batch, p_member_id, v_room, p_month_start, p_variant_id, p_part, nullif(trim(p_comment), ''),
    v_discord, v_ext, v_nick, 'manual', current_member_id(), current_member_id()) returning id into v_entry;
  for rec in select nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'tournaments', '')::integer tournaments
    from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) x
  loop
    if rec.tournaments is null or rec.tournaments < 0 or not exists (select 1 from limits where id = rec.limit_id) then raise exception 'bad value' using errcode = '22023'; end if;
    if rec.tournaments > 0 then
      insert into distance_values (entry_id, limit_id, tournaments) values (v_entry, rec.limit_id, rec.tournaments);
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count = 0 then raise exception 'empty values' using errcode = '22023'; end if;
  return jsonb_build_object('id', v_entry, 'values', v_count);
end;
$$;

create or replace function update_manual_distance_entry(p_entry_id uuid, p_comment text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_count integer := 0; rec record;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from distance_entries where id = p_entry_id) then raise exception 'entry not found' using errcode = 'P0002'; end if;
  delete from distance_values where entry_id = p_entry_id;
  for rec in select nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'tournaments', '')::integer tournaments
    from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) x
  loop
    if rec.tournaments is null or rec.tournaments < 0 or not exists (select 1 from limits where id = rec.limit_id) then raise exception 'bad value' using errcode = '22023'; end if;
    if rec.tournaments > 0 then
      insert into distance_values (entry_id, limit_id, tournaments) values (p_entry_id, rec.limit_id, rec.tournaments);
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count = 0 then raise exception 'empty values' using errcode = '22023'; end if;
  update distance_entries set comment = nullif(trim(p_comment), ''), updated_by = current_member_id() where id = p_entry_id;
  return jsonb_build_object('id', p_entry_id, 'values', v_count);
end;
$$;

revoke all on function create_manual_distance_entry(uuid, text, date, text, integer, text, text, jsonb) from public, anon;
grant execute on function create_manual_distance_entry(uuid, text, date, text, integer, text, text, jsonb) to authenticated;
revoke all on function update_manual_distance_entry(uuid, text, jsonb) from public, anon;
grant execute on function update_manual_distance_entry(uuid, text, jsonb) to authenticated;

create or replace function write_normalized_distance_value(
  p_batch_id uuid, p_member_id uuid, p_room_id uuid, p_month_start date,
  p_variant_id text, p_part integer, p_comment text, p_discord_id text,
  p_distance_ext_id text, p_game_nick text, p_source text, p_limit_id text, p_tournaments integer
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_entry uuid; n integer;
begin
  select id into v_entry from distance_entries
  where room_id = p_room_id and month_start = p_month_start and variant_id = p_variant_id
    and format_id = 'mtt' and part = p_part and distance_ext_id = p_distance_ext_id;
  if v_entry is null then
    insert into distance_entries (batch_id, member_id, room_id, month_start, variant_id, part, comment,
      discord_id, distance_ext_id, game_nick, source, created_by, updated_by)
    values (p_batch_id, p_member_id, p_room_id, p_month_start, p_variant_id, p_part,
      nullif(trim(p_comment), ''), p_discord_id, p_distance_ext_id, p_game_nick, p_source,
      current_member_id(), current_member_id())
    on conflict (room_id, month_start, variant_id, format_id, part, distance_ext_id) do nothing
    returning id into v_entry;
    if v_entry is null then
      select id into v_entry from distance_entries
      where room_id = p_room_id and month_start = p_month_start and variant_id = p_variant_id
        and format_id = 'mtt' and part = p_part and distance_ext_id = p_distance_ext_id;
    end if;
  end if;
  insert into distance_values (entry_id, limit_id, tournaments)
  values (v_entry, p_limit_id, p_tournaments)
  on conflict (entry_id, limit_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function write_normalized_distance_value(uuid, uuid, uuid, date, text, integer, text, text, text, text, text, text, integer) from public, anon, authenticated;

create or replace function save_distance_dump(
  p_room_slug text, p_month_start date, p_entry_kind text, p_part integer,
  p_batch_label text, p_note text, p_rows jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_part is null or p_part < 1 then raise exception 'bad part' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into distance_batches (source, file_name, created_by) values ('import', nullif(trim(p_batch_label), ''), current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id,
      nullif(trim(x->>'variant_id'), '') variant_id, nullif(trim(x->>'limit_id'), '') limit_id,
      nullif(x->>'hands', '')::integer hands, nullif(trim(x->>'game_nick'), '') game_nick
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$' or rec.variant_id not in ('nitro', 'regular')
      or rec.hands is null or rec.hands < 0 or not exists (select 1 from limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    if rec.hands = 0 then v_skipped := v_skipped + 1; continue; end if;
    v_member := null; v_discord := null; v_player := null;
    select discord_id into v_discord from discord_distance_ids where distance_ext_id = rec.distance_ext_id;
    select id into v_member from members where distance_ext_id = rec.distance_ext_id limit 1;
    if v_member is null and v_discord is not null then select member_id into v_member from identities where provider = 'discord' and provider_uid = v_discord limit 1; end if;
    did_insert := write_normalized_distance_value(v_batch, v_member, v_room, p_month_start, rec.variant_id, p_part,
      p_note, v_discord, rec.distance_ext_id, rec.game_nick, 'import', rec.limit_id, rec.hands);
    if did_insert then
      v_inserted := v_inserted + 1;
      if v_member is not null and rec.game_nick is not null then
        insert into players (member_id, room_id) values (v_member, v_room)
        on conflict (member_id, room_id) do update set room_id = excluded.room_id returning id into v_player;
        if rec.game_nick is distinct from (select nick from player_nicks where player_id = v_player order by at desc, id desc limit 1) then
          insert into player_nicks (player_id, nick, source, distance_month) values (v_player, rec.game_nick, 'distance', p_month_start);
        end if;
      end if;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown);
end;
$$;

create or replace function save_historical_distance_dump(p_room_slug text, p_variant_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0; v_nick_updated integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_variant_id not in ('nitro', 'regular') then raise exception 'bad variant' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into distance_batches (source, file_name, created_by) values ('historical', 'historical-wide-csv', current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id, nullif(trim(x->>'discord_id'), '') source_discord_id,
      nullif(trim(x->>'game_nick'), '') game_nick, nullif(x->>'month_start', '')::date month_start,
      nullif(x->>'part', '')::integer part, nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'hands', '')::integer hands
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$'
      or (rec.source_discord_id is not null and rec.source_discord_id !~ '^[0-9]{15,22}$')
      or rec.month_start is null or rec.month_start is distinct from date_trunc('month', rec.month_start)::date
      or rec.part is null or rec.part < 1 or rec.hands is null or rec.hands <= 0
      or not exists (select 1 from limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    v_discord := rec.source_discord_id; v_member := null; v_player := null;
    if v_discord is null then select discord_id into v_discord from discord_distance_ids where distance_ext_id = rec.distance_ext_id; end if;
    select id into v_member from members where distance_ext_id = rec.distance_ext_id limit 1;
    if v_member is null and v_discord is not null then select member_id into v_member from identities where provider = 'discord' and provider_uid = v_discord limit 1; end if;
    did_insert := write_normalized_distance_value(v_batch, v_member, v_room, rec.month_start, p_variant_id, rec.part,
      'Historical distance import', v_discord, rec.distance_ext_id, rec.game_nick, 'historical', rec.limit_id, rec.hands);
    if did_insert then
      v_inserted := v_inserted + 1;
      if v_member is not null and rec.game_nick is not null then
        insert into players (member_id, room_id) values (v_member, v_room)
        on conflict (member_id, room_id) do update set room_id = excluded.room_id returning id into v_player;
        if rec.game_nick is distinct from (select nick from player_nicks where player_id = v_player order by at desc, id desc limit 1) then
          insert into player_nicks (player_id, nick, source, distance_month) values (v_player, rec.game_nick, 'distance', rec.month_start);
          v_nick_updated := v_nick_updated + 1;
        end if;
      end if;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown, 'nick_updated', v_nick_updated);
end;
$$;

create or replace function clear_distance_rows(p_month_start date default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare n integer := 0;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is not null and p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_month_start is null then delete from distance_values;
  else delete from distance_values where entry_id in (select id from distance_entries where month_start = p_month_start); end if;
  get diagnostics n = row_count;
  if p_month_start is null then delete from distance_entries; delete from distances;
  else delete from distance_entries where month_start = p_month_start; delete from distances where month_start = p_month_start; end if;
  delete from distance_batches b where not exists (select 1 from distance_entries e where e.batch_id = b.id);
  return jsonb_build_object('deleted', n);
end;
$$;

revoke all on function save_distance_dump(text, date, text, integer, text, text, jsonb) from public, anon;
grant execute on function save_distance_dump(text, date, text, integer, text, text, jsonb) to authenticated;
revoke all on function save_historical_distance_dump(text, text, jsonb) from public, anon;
grant execute on function save_historical_distance_dump(text, text, jsonb) to authenticated;
revoke all on function clear_distance_rows(date) from public, anon;
grant execute on function clear_distance_rows(date) to authenticated;
