-- Administrator is a first-class club role, not just a label in code.
-- Root already has staff screens; they also carry administrator so
-- member_roles shows the third role next to member and root.

update app_roles
set title = 'Administrator'
where id = 'admin';

insert into member_roles (member_id, role_id)
select member_id, 'admin'
from member_roles
where role_id = 'root'
on conflict do nothing;
