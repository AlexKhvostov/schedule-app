create table public.member_presence (
  member_id uuid primary key references public.members(id) on delete cascade,
  seen_at timestamptz not null,
  active_at timestamptz not null
);

alter table public.member_presence enable row level security;
revoke all on public.member_presence from public, anon, authenticated;

create function public.ping_member_presence(p_interacted boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := public.current_member_id();
  stamp timestamptz := statement_timestamp();
begin
  if not exists (select 1 from public.members where id = viewer and access_status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.member_presence as presence (member_id, seen_at, active_at)
  values (viewer, stamp, stamp)
  on conflict (member_id) do update
    set seen_at = greatest(presence.seen_at, excluded.seen_at),
        active_at = case when p_interacted then greatest(presence.active_at, excluded.active_at) else presence.active_at end
    where presence.seen_at <= stamp - interval '25 seconds'
       or (p_interacted and presence.active_at <= stamp - interval '25 seconds');
end;
$$;

create function public.list_member_presence()
returns table (
  member_id uuid, nick text, avatar_url text, online boolean,
  activity_minutes integer, edit_minutes integer, edit_variant text, edit_limit text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.members
    where id = public.current_member_id() and access_status = 'active'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select m.id, coalesce(i.guild_nick, i.display_name, i.username, m.public_code), i.avatar_url,
         p.seen_at > now() - interval '2 minutes',
         greatest(0, floor(extract(epoch from (now() - p.active_at)) / 60)::integer),
         floor(extract(epoch from (now() - edit.at)) / 60)::integer,
         k.variant_id, k.limit_id
  from public.member_presence p
  join public.members m on m.id = p.member_id and m.access_status = 'active'
  left join lateral (
    select d.guild_nick, d.display_name, d.username, d.avatar_url
    from public.identities d where d.member_id = m.id and d.provider = 'discord'
    order by d.id limit 1
  ) i on true
  left join lateral (
    select e.at, e.kind_id from public.occupancy_events e
    where e.actor_id = m.id
    order by e.at desc, e.id desc limit 1
  ) edit on true
  left join public.schedule_kinds k on k.id = edit.kind_id
  where p.seen_at > now() - interval '24 hours'
  order by (p.seen_at > now() - interval '2 minutes') desc, p.active_at desc, m.id;
end;
$$;

revoke all on function public.ping_member_presence(boolean), public.list_member_presence() from public, anon;
grant execute on function public.ping_member_presence(boolean), public.list_member_presence() to authenticated;
