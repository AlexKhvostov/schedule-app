-- Winamax Expresso / Nitro standing buy-ins (euros), as listed by Winamax:
-- 0,25 €, 0,50 €, 1 €, 2 €, 5 €, 10 €, 25 €, 50 €, 100 €, 250 €, 500 €
-- Classic Expresso and Nitro share this ladder.

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
join rooms r on r.id = k.room_id
where r.slug = 'winamax'
on conflict (kind_id) do nothing;

insert into capacity_rules (kind_id, layer, hours)
select k.id, 'base', default_hour_caps()
from schedule_kinds k
join rooms r on r.id = k.room_id
where r.slug = 'winamax'
  and not exists (
    select 1 from capacity_rules c
    where c.kind_id = k.id and c.layer = 'base'
  );
