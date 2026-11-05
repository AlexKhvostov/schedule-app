-- The brush needs the recipient's schedule pairs before placing a mark.
-- Expose only those pairs under the existing club permission; write guards
-- in apply_schedule_edit/apply_own_slots and occupancy triggers stay intact.
create or replace function public.effective_schedule_access(p_member_ids uuid[])
returns table (member_id uuid, variant_id text, limit_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, v.id, l.id
  from public.members m
  cross join public.variants v
  cross join public.limits l
  where m.id = any(p_member_ids)
    and (
      m.id = public.current_member_id()
      or public.member_has_permission(public.current_member_id(), 'admin.people')
      or (
        public.member_has_permission(public.current_member_id(), 'schedule')
        and exists (select 1 from public.members actor
          where actor.id = public.current_member_id() and actor.access_status = 'active')
        and exists (select 1 from public.schedule_settings s where s.id and s.allow_act_as)
      )
    )
    and public.member_has_schedule_limit(m.id, v.id, l.id);
$$;

comment on function public.effective_schedule_access(uuid[]) is
  'Schedule pairs for self, people admins, or active schedule members when club act-as is enabled. Does not grant write access.';
revoke all on function public.effective_schedule_access(uuid[]) from public, anon;
grant execute on function public.effective_schedule_access(uuid[]) to authenticated;
