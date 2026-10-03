-- A limit hidden by the club is no longer available for new planning.
-- Existing occupancy stays readable and removable.

create or replace function enforce_schedule_filter_limit_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant text;
  v_limit text;
  v_enabled boolean;
begin
  select variant_id, limit_id
  into v_variant, v_limit
  from schedule_kinds
  where id = new.kind_id;

  select case v_variant
    when 'nitro' then v_limit = any(filter_limits_nitro)
    when 'regular' then v_limit = any(filter_limits_regular)
    else false
  end
  into v_enabled
  from schedule_settings
  where id;

  if coalesce(v_enabled, false) is not true then
    raise exception 'schedule-filter-limit-disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function enforce_schedule_filter_limit_on_insert() from public, anon, authenticated;

drop trigger if exists occupancy_filter_limit_insert on occupancy;
create trigger occupancy_filter_limit_insert
before insert on occupancy
for each row execute function enforce_schedule_filter_limit_on_insert();

comment on function enforce_schedule_filter_limit_on_insert() is
  'Reject new occupancy for a schedule limit hidden by club settings. Deletes remain allowed.';
