-- Root can wipe a test dump: one month, or the whole distances table.

create or replace function clear_distance_rows(p_month_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if not is_root() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_month_start is null then
    delete from distances;
  else
    if p_month_start is distinct from date_trunc('month', p_month_start)::date then
      raise exception 'bad month' using errcode = '22007';
    end if;
    delete from distances where month_start = p_month_start;
  end if;

  get diagnostics n = row_count;
  return jsonb_build_object('deleted', n);
end;
$$;

revoke all on function clear_distance_rows(date) from public, anon;
grant execute on function clear_distance_rows(date) to authenticated;

comment on function clear_distance_rows(date) is
  'Root-only. Delete distances for one calendar month, or all rows if month is null.';
