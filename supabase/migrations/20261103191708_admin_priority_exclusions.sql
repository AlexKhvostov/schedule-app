create function public.get_priority_exclusions(p_member_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'nitro', coalesce(s.excluded_nitro, false),
      'regular', coalesce(s.excluded_regular, false)
    )
    from public.members m
    left join public.priority_member_settings s on s.member_id = m.id
    where m.id = p_member_id
  );
end;
$$;

revoke all on function public.get_priority_exclusions(uuid) from public, anon;
grant execute on function public.get_priority_exclusions(uuid) to authenticated;
