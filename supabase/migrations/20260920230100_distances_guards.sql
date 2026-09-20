-- Tighten distances helpers: search_path, staff policies, FK indexes.

create or replace function distances_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists distance_entry_kinds_staff on distance_entry_kinds;

create policy distance_entry_kinds_insert on distance_entry_kinds
  for insert to authenticated
  with check (is_staff());

create policy distance_entry_kinds_update on distance_entry_kinds
  for update to authenticated
  using (is_staff())
  with check (is_staff());

create policy distance_entry_kinds_delete on distance_entry_kinds
  for delete to authenticated
  using (is_staff());

create index distances_variant_idx on distances (variant_id);
create index distances_limit_idx on distances (limit_id);
create index distances_format_idx on distances (format_id);
create index distances_entry_kind_idx on distances (entry_kind);
