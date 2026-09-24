-- Staff can correct hands on existing distance slices from the admin book.

create or replace function save_distance_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_updated integer := 0;
  v_unknown integer := 0;
  n integer;
begin
  if not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for rec in
    select
      nullif(trim(x->>'id'), '')::uuid as id,
      nullif(x->>'hands', '')::integer as hands
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.id is null or rec.hands is null or rec.hands < 0 then
      v_unknown := v_unknown + 1;
      continue;
    end if;

    update distances
    set hands = rec.hands
    where id = rec.id
      and hands is distinct from rec.hands;

    get diagnostics n = row_count;
    if n > 0 then
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'unknown', v_unknown);
end;
$$;

revoke all on function save_distance_rows(jsonb) from public, anon;
grant execute on function save_distance_rows(jsonb) to authenticated;

comment on function save_distance_rows(jsonb) is
  'Staff/root: update hands on existing distance rows. Does not insert.';
