-- Club status: members and admins play; staff accompany and do not play.
-- Root is a service role, not a club seat. Keep root; do not treat them as members.

insert into app_roles (id, title)
values ('staff', 'Staff')
on conflict (id) do nothing;

create or replace function set_discord_access(p_discord_id text, p_access text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  actor uuid;
  snap discord_members%rowtype;
  uname text;
  code text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if p_access not in ('closed', 'member', 'admin', 'staff') then
    raise exception 'bad-access';
  end if;

  actor := current_member_id();

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;

  if p_access = 'closed' and mid is not null and exists (
    select 1 from member_roles where member_id = mid and role_id = 'root'
  ) then
    raise exception 'cannot-close-root';
  end if;

  if p_access = 'closed' and mid is not null and mid = actor then
    raise exception 'cannot-close-self';
  end if;

  if p_access = 'closed' then
    if mid is null then
      return null;
    end if;
    update members
    set access_status = 'blocked',
        approved_at = null
    where id = mid;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
    return mid;
  end if;

  if mid is null then
    select * into snap from discord_members where discord_id = p_discord_id;
    if not found or snap.bot then
      raise exception 'unknown-discord';
    end if;
    uname := coalesce(nullif(btrim(snap.guild_nick), ''), nullif(btrim(snap.global_name), ''), snap.username);
    loop
      code := 'RP-' || substr(md5(p_discord_id || clock_timestamp()::text), 1, 6);
      exit when not exists (select 1 from members where public_code = code);
    end loop;

    insert into members (auth_user_id, public_code, access_status, mark_tag, community_status, approved_at)
    values (null, code, 'active', null, 'club', now())
    returning id into mid;

    insert into profiles (member_id, display_name)
    values (mid, uname);

    insert into identities (
      member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw
    ) values (
      mid,
      'discord',
      p_discord_id,
      snap.username,
      snap.global_name,
      snap.guild_nick,
      snap.avatar_url,
      jsonb_build_object('source', 'admin-grant')
    );
  else
    update members
    set access_status = 'active',
        approved_at = coalesce(approved_at, now()),
        community_status = coalesce(community_status, 'club')
    where id = mid;
  end if;

  if p_access = 'staff' then
    insert into member_roles (member_id, role_id)
    values (mid, 'staff')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('member', 'admin');
  elsif p_access = 'admin' then
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    insert into member_roles (member_id, role_id)
    values (mid, 'admin')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id = 'staff';
  else
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
  end if;

  return mid;
end;
$$;

revoke all on function set_discord_access(text, text) from public;
grant execute on function set_discord_access(text, text) to authenticated;

insert into member_roles (member_id, role_id)
select member_id, 'staff'
from member_roles
where role_id = 'root'
on conflict do nothing;

delete from member_roles mr
where mr.role_id in ('member', 'admin')
  and exists (
    select 1 from member_roles r
    where r.member_id = mr.member_id
      and r.role_id = 'root'
  );
