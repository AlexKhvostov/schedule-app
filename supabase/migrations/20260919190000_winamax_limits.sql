-- Default schedule room is Winamax, not GGPoker.
-- Limits 5 and 10 join the catalog; kinds and default capacity follow.

update rooms
set slug = 'winamax', title = 'Winamax'
where slug = 'gg';

insert into rooms (slug, title) values ('winamax', 'Winamax')
on conflict (slug) do update set title = excluded.title;

insert into limits (id, sort) values
  ('5', 1),
  ('10', 2),
  ('25', 3),
  ('50', 4),
  ('100', 5),
  ('250', 6),
  ('500', 7)
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
