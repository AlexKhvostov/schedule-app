-- The existing role editor and member_access_context discover this catalog entry.
-- Do not grant Dashboard to any Discord role automatically.
insert into public.app_permissions (code, title, section, sort)
values ('dashboard', 'Dashboard', 'module', 35)
on conflict (code) do update
set title = excluded.title, section = excluded.section, sort = excluded.sort;
