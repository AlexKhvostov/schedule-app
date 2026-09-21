-- Default lane capacity is 1 for every hour of every limit.
-- Night hours used to seed as 2; admins raise specific hours when needed.

create or replace function default_hour_caps()
returns smallint[]
language sql
immutable
as $$
  select array_fill(1::smallint, array[24]);
$$;

update capacity_rules
set hours = array_fill(1::smallint, array[24]);
