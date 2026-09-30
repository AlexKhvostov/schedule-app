-- Ordered table-count brushes for each member.
-- members.tables remains the backwards-compatible active/default brush while
-- occupancy.tables continues to be the immutable snapshot stored on a mark.

create table member_table_presets (
  member_id uuid not null references members (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  tables smallint not null check (tables between 1 and 30),
  primary key (member_id, position),
  unique (member_id, tables)
);

comment on table member_table_presets is
  'Up to five ordered, unique table-count brushes per member. Values are integers from 1 through 30.';

insert into member_table_presets (member_id, position, tables)
select id, 1, tables
from members
on conflict do nothing;

create or replace function seed_member_table_preset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into member_table_presets (member_id, position, tables)
  values (new.id, 1, new.tables)
  on conflict do nothing;
  return new;
end;
$$;

create trigger member_table_presets_seed
  after insert on members
  for each row execute function seed_member_table_preset();

alter table member_table_presets enable row level security;

create policy member_table_presets_read on member_table_presets
  for select to authenticated
  using (true);

grant select on member_table_presets to authenticated;
revoke insert, update, delete on member_table_presets from authenticated;

create or replace function save_member_table_presets(
  p_member_id uuid,
  p_presets jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  numeric_value numeric;
  table_value smallint;
  normalized smallint[] := '{}'::smallint[];
  item_position integer := 0;
begin
  if p_member_id is null
     or not (p_member_id = current_member_id() or is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_presets is null
     or jsonb_typeof(p_presets) <> 'array'
     or jsonb_array_length(p_presets) not between 1 and 5 then
    raise exception 'member-table-presets-count' using errcode = '22023';
  end if;

  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'member-not-found' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_presets) loop
    if jsonb_typeof(item) <> 'number' then
      raise exception 'member-table-preset-invalid' using errcode = '22023';
    end if;

    begin
      numeric_value := (item #>> '{}')::numeric;
    exception when others then
      raise exception 'member-table-preset-invalid' using errcode = '22023';
    end;

    if numeric_value <> trunc(numeric_value)
       or numeric_value not between 1 and 30 then
      raise exception 'member-table-preset-invalid' using errcode = '22023';
    end if;

    table_value := numeric_value::smallint;
    if array_position(normalized, table_value) is not null then
      raise exception 'member-table-preset-duplicate' using errcode = '22023';
    end if;
    normalized := array_append(normalized, table_value);
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));

  delete from member_table_presets
  where member_id = p_member_id;

  foreach table_value in array normalized loop
    item_position := item_position + 1;
    insert into member_table_presets (member_id, position, tables)
    values (p_member_id, item_position, table_value);
  end loop;

  update members
  set tables = case
    when tables = any(normalized) then tables
    else normalized[1]
  end
  where id = p_member_id;
end;
$$;

revoke all on function save_member_table_presets(uuid, jsonb) from public, anon;
grant execute on function save_member_table_presets(uuid, jsonb) to authenticated;

comment on function save_member_table_presets(uuid, jsonb) is
  'Atomically replace one member table-count presets. Owner or admin.people only; accepts 1-5 unique integers from 1 through 30.';

alter publication supabase_realtime add table member_table_presets;
