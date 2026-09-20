-- Catalogs and default capacity. Safe to re-run on an empty project after the spine migration.
-- Winamax Expresso / Nitro buy-ins: 0,25 € … 500 €.

insert into rooms (slug, title) values ('winamax', 'Winamax')
on conflict (slug) do update set title = excluded.title;

insert into limits (id, sort) values
  ('0.25', 1),
  ('0.50', 2),
  ('1', 3),
  ('2', 4),
  ('5', 5),
  ('10', 6),
  ('25', 7),
  ('50', 8),
  ('100', 9),
  ('250', 10),
  ('500', 11)
on conflict (id) do update set sort = excluded.sort;

insert into formats (id) values ('mtt')
on conflict (id) do nothing;

insert into variants (id) values ('nitro'), ('regular')
on conflict (id) do nothing;

insert into schedule_kinds (room_id, limit_id, format_id, variant_id)
select r.id, l.id, 'mtt', v.id
from rooms r
cross join limits l
cross join variants v
where r.slug = 'winamax'
on conflict (room_id, limit_id, format_id, variant_id) do nothing;

insert into capacity_flags (kind_id, equalize, week_on, month_on)
select k.id, false, true, true
from schedule_kinds k
on conflict (kind_id) do nothing;

insert into capacity_rules (kind_id, layer, hours)
select k.id, 'base', default_hour_caps()
from schedule_kinds k
where not exists (
  select 1 from capacity_rules c
  where c.kind_id = k.id and c.layer = 'base'
);
