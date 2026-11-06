-- The member UUID is the person. External IDs are current assignments, not owners of facts.
create table public.member_distance_ids (
  distance_ext_id text primary key check (distance_ext_id ~ '^[0-9]{1,12}$'),
  member_id uuid not null references public.members(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index member_distance_ids_member_idx on public.member_distance_ids(member_id);
create unique index member_distance_ids_primary_idx on public.member_distance_ids(member_id) where is_primary;
alter table public.member_distance_ids enable row level security;
grant select on public.member_distance_ids to authenticated;
create policy member_distance_ids_read on public.member_distance_ids for select to authenticated using (true);
insert into public.member_distance_ids(distance_ext_id,member_id,is_primary)
select distance_ext_id,id,true from public.members where distance_ext_id is not null;

create table public.member_distance_id_audit (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  old_ids text[] not null,
  new_ids text[] not null,
  actor_id uuid,
  at timestamptz not null default now()
);
alter table public.member_distance_id_audit enable row level security;
grant select on public.member_distance_id_audit to authenticated;
create policy member_distance_audit_read on public.member_distance_id_audit for select to authenticated
using (public.current_has_permission('admin.people'));

create table public.distance_id_nicks (
  room_id uuid not null references public.rooms(id),
  distance_ext_id text not null,
  nick text not null,
  month_start date,
  observed_at timestamptz not null default clock_timestamp(),
  primary key(room_id,distance_ext_id)
);
alter table public.distance_id_nicks enable row level security;
-- Last accepted upload wins. Historical entry labels themselves remain untouched.
insert into public.distance_id_nicks(room_id,distance_ext_id,nick,month_start,observed_at)
select distinct on (room_id,distance_ext_id) room_id,distance_ext_id,game_nick,month_start,created_at
from public.distance_entries where nullif(btrim(game_nick),'') is not null
order by room_id,distance_ext_id,created_at desc,id desc;

create function public.member_distance_id_list(p_member uuid) returns text[]
language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(distance_ext_id order by is_primary desc,distance_ext_id),'{}'::text[])
  from public.member_distance_ids where member_id=p_member;
$$;
revoke all on function public.member_distance_id_list(uuid) from public,anon,authenticated;

alter table public.player_nicks add column distance_ext_id text;

create function public.refresh_member_distance_nick(p_member uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r record; v_player uuid; v_primary text;
begin
  select distance_ext_id into v_primary from public.member_distance_ids where member_id=p_member and is_primary;
  for r in select pl.id,n.nick,n.source,n.distance_ext_id from public.players pl
    join lateral(select * from public.player_nicks where player_id=pl.id order by at desc,id desc limit 1) n on true
    where pl.member_id=p_member and n.source='distance' and n.nick<>''
      and n.distance_ext_id is distinct from v_primary
  loop
    insert into public.player_nicks(player_id,nick,source,at) values(r.id,'','distance',clock_timestamp());
  end loop;
  for r in select n.* from public.distance_id_nicks n join public.member_distance_ids l
    on l.distance_ext_id=n.distance_ext_id and l.member_id=p_member and l.is_primary
  loop
    insert into public.players(member_id,room_id) values(p_member,r.room_id)
    on conflict(member_id,room_id) do update set room_id=excluded.room_id returning id into v_player;
    if r.nick is distinct from (select nick from public.player_nicks where player_id=v_player order by at desc,id desc limit 1) then
      insert into public.player_nicks(player_id,nick,source,distance_month,distance_ext_id,at) values(v_player,r.nick,'distance',r.month_start,r.distance_ext_id,clock_timestamp());
    end if;
  end loop;
end;
$$;
revoke all on function public.refresh_member_distance_nick(uuid) from public,anon,authenticated;

create function public.remember_distance_nick(p_room uuid,p_ext text,p_nick text,p_month date) returns void
language plpgsql security definer set search_path=public as $$
declare v_member uuid;
begin
  if nullif(btrim(p_nick),'') is null then return; end if;
  insert into public.distance_id_nicks(room_id,distance_ext_id,nick,month_start)
  values(p_room,p_ext,btrim(p_nick),p_month)
  on conflict(room_id,distance_ext_id) do update set nick=excluded.nick,month_start=excluded.month_start,observed_at=clock_timestamp();
  select member_id into v_member from public.member_distance_ids where distance_ext_id=p_ext and is_primary;
  if v_member is not null then perform public.refresh_member_distance_nick(v_member); end if;
end;
$$;
revoke all on function public.remember_distance_nick(uuid,text,text,date) from public,anon,authenticated;

create function public.save_member_distance_ids(p_member_id uuid,p_ids text[],p_expected_ids text[]) returns void
language plpgsql security definer set search_path=public as $$
declare old_ids text[]; new_ids text[] := coalesce(p_ids,'{}'::text[]);
begin
  if not public.current_has_permission('admin.people') then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.members where id=p_member_id for update;
  if not found then raise exception 'member-not-found' using errcode='22023'; end if;
  old_ids:=public.member_distance_id_list(p_member_id);
  if p_expected_ids is null or old_ids is distinct from p_expected_ids then raise exception 'distance-links-stale' using errcode='40001'; end if;
  if exists(select 1 from unnest(new_ids) x where x is null or x !~ '^[0-9]{1,12}$')
    or cardinality(new_ids)<>(select count(distinct x) from unnest(new_ids) x) then
    raise exception 'bad-distance-ids' using errcode='22023';
  end if;
  -- Stable ordering avoids needless changes and lets clients detect concurrent edits.
  select coalesce(array_agg(x order by (x=new_ids[1]) desc,x),'{}'::text[]) into new_ids from unnest(new_ids) x;
  if old_ids=new_ids then return; end if;
  if exists(select 1 from public.member_distance_ids where distance_ext_id=any(new_ids) and member_id<>p_member_id) then
    raise exception 'distance-id-already-assigned' using errcode='23505';
  end if;
  delete from public.member_distance_ids where member_id=p_member_id;
  insert into public.member_distance_ids(distance_ext_id,member_id,is_primary)
    select x,p_member_id,x=new_ids[1] from unnest(new_ids) x order by x;
  update public.members set distance_ext_id=new_ids[1] where id=p_member_id;
  insert into public.member_distance_id_audit(member_id,old_ids,new_ids,actor_id)
    values(p_member_id,old_ids,new_ids,public.current_member_id());
  perform public.refresh_member_distance_nick(p_member_id);
  update public.priority_rating_cache set dirty=true where not dirty;
end;
$$;
revoke all on function public.save_member_distance_ids(uuid,text[],text[]) from public,anon;
grant execute on function public.save_member_distance_ids(uuid,text[],text[]) to authenticated;

-- Compatibility for existing member inserts and old clients. The primary column is a projection.
create function public.sync_member_distance_primary() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.distance_ext_id is not distinct from (select distance_ext_id from public.member_distance_ids where member_id=new.id and is_primary) then return new; end if;
  if TG_OP='UPDATE' then
    delete from public.member_distance_ids where member_id=new.id and distance_ext_id=old.distance_ext_id;
  end if;
  update public.member_distance_ids set is_primary=false where member_id=new.id and is_primary;
  if new.distance_ext_id is not null then
    insert into public.member_distance_ids(distance_ext_id,member_id,is_primary) values(new.distance_ext_id,new.id,true)
    on conflict(distance_ext_id) do update set is_primary=true where member_distance_ids.member_id=new.id;
    if not found then raise exception 'distance-id-already-assigned' using errcode='23505'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_member_distance_primary() from public,anon,authenticated;
create trigger members_distance_primary after insert or update of distance_ext_id on public.members
for each row execute function public.sync_member_distance_primary();

create trigger priority_distance_links_dirty after insert or update or delete on public.member_distance_ids
for each row execute function public.invalidate_priority_directory();

comment on table public.discord_distance_ids is 'Legacy import mapping retained for audit only. Current ownership is member_distance_ids.';


create or replace function public.admin_distance_book(p_month_start date, p_room_slug text default 'winamax')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_room uuid;
begin
  if not current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  return jsonb_build_object(
    'people_filters_version', 1,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id, 'distance_ext_id', m.distance_ext_id, 'distance_ids', to_jsonb(member_distance_id_list(m.id)),
        'discord_id', i.provider_uid,
        'discord_nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, ''),
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'has_active_profile', p.member_id is not null,
        'game_nick', coalesce(pn.nick, '')
      ) order by coalesce(dm.global_name, i.display_name, dm.username, i.username, m.public_code))
      from members m
      left join profiles p on p.member_id = m.id
      left join lateral (
        select x.* from identities x where x.member_id = m.id and x.provider = 'discord' limit 1
      ) i on true
      left join discord_members dm on dm.discord_id = i.provider_uid
      left join players pl on pl.member_id = m.id and pl.room_id = v_room
      left join lateral (
        select n.nick from player_nicks n where n.player_id = pl.id order by n.at desc, n.id desc limit 1
      ) pn on true
      where m.access_status = 'active'
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'member_id', m.id, 'distance_ext_id', e.distance_ext_id,
        'discord_id', i.provider_uid, 'game_nick', e.game_nick, 'variant_id', e.variant_id,
        'part', e.part, 'comment', e.comment, 'source', e.source,
        'created_at', e.created_at, 'updated_at', e.updated_at,
        'created_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.created_by),
        'updated_by_name', (select coalesce(p.display_name, m.public_code) from members m left join profiles p on p.member_id = m.id where m.id = e.updated_by),
        'present', coalesce(dm.present, i.guild_present, false),
        'roles', coalesce(dm.roles, i.discord_roles, '[]'::jsonb),
        'profile_member_id', m.id,
        'avatar_url', coalesce(dm.avatar_url, i.avatar_url),
        'discord_nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, ''),
        'has_active_profile', coalesce(m.access_status = 'active', false) and exists(select 1 from profiles p where p.member_id = m.id),
        'values', coalesce((select jsonb_agg(jsonb_build_object('limit_id', v.limit_id, 'tournaments', v.tournaments)) from distance_values v where v.entry_id = e.id), '[]'::jsonb)
      ) order by e.distance_ext_id, e.variant_id, e.part)
      from distance_entries e
      left join member_distance_ids link on link.distance_ext_id=e.distance_ext_id
      left join members m on m.id=link.member_id
      left join lateral (
        select x.* from identities x where x.member_id=m.id and x.provider='discord' limit 1
      ) i on true
      left join discord_members dm on dm.discord_id=i.provider_uid
      where e.month_start = p_month_start and e.room_id = v_room
    ), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(l.id order by l.sort, l.id) from limits l), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(x.month_start order by x.month_start desc) from (select distinct month_start from distance_entries) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.priority_source(p_period_start date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_room uuid; v_rp text; v_today date := (now() at time zone 'Europe/Minsk')::date; v_result jsonb;
begin
  if p_period_start is null or extract(day from p_period_start) <> 1
    or extract(month from p_period_start) not in (2,5,8,11)
    or extract(year from p_period_start) not between 2000 and 2100 then
    raise exception 'priority-bad-period' using errcode = '22023';
  end if;
  select id into v_room from rooms where slug = 'winamax';
  select coalesce(required_discord_role_id,'1208022351652986891') into v_rp from club_settings where id = true;
  v_result := jsonb_build_object(
    'periodStart', p_period_start, 'today', v_today, 'canManage', is_staff(),
    'lastMonthEntries', (select count(*) from distance_entries e where e.room_id = v_room
      and e.month_start = (p_period_start - interval '1 month')::date and e.variant_id in ('nitro','regular')
      and exists(select 1 from distance_values v where v.entry_id=e.id and v.limit_id in ('50','100'))),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', m.id,
        'nick', coalesce(nullif(btrim(dm.global_name),''), nullif(btrim(i.display_name),''), dm.username, i.username, m.public_code),
        'gameNick', coalesce(pn.nick,''),
        'avatarUrl', coalesce(dm.avatar_url, i.avatar_url),
        'redParty', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'=v_rp),
        'team50', coalesce(dm.present, i.guild_present, false) and exists(select 1 from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r where r->>'id'='1208022278088949770'),
        'discordRoles', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r->>'id', 'name', coalesce(gr.name, r->>'name', r->>'id'),
          'color', coalesce(gr.color, r->>'color')) order by r->>'id')
          from jsonb_array_elements(coalesce(dm.roles,i.discord_roles,'[]'::jsonb)) r
          left join discord_guild_roles gr on gr.role_id=r->>'id'
          where coalesce(dm.present,i.guild_present,false) and r->>'id' is not null), '[]'::jsonb),
        'hasActiveProfile', m.access_status='active' and exists(select 1 from profiles p where p.member_id=m.id),
        'plays', coalesce((select jsonb_agg(x.variant_id order by x.variant_id) from
          (select distinct l.variant_id from player_limits l where l.player_id=pl.id and l.variant_id in ('nitro','regular')) x), '[]'::jsonb),
        'vipNitro', m.vip_nitro, 'vipRegular', m.vip_regular,
        'excludedNitro', coalesce(s.excluded_nitro,false), 'excludedRegular', coalesce(s.excluded_regular,false),
        'entries', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'month', e.month_start, 'variant', e.variant_id, 'part', e.part,
          'values', coalesce((select jsonb_agg(jsonb_build_object('limit',v.limit_id,'tournaments',v.tournaments) order by v.limit_id)
            from distance_values v where v.entry_id=e.id and v.limit_id in ('50','100')), '[]'::jsonb)
          ) order by e.month_start,e.variant_id,e.part,e.id)
          from distance_entries e where e.room_id=v_room and e.variant_id in ('nitro','regular')
            and e.month_start >= (p_period_start-interval '6 months')::date and e.month_start < p_period_start
            and exists(select 1 from member_distance_ids link where link.distance_ext_id=e.distance_ext_id and link.member_id=m.id)), '[]'::jsonb)
      ) order by m.id)
      from members m left join players pl on pl.member_id=m.id and pl.room_id=v_room
      left join priority_member_settings s on s.member_id=m.id
      left join lateral(select x.* from identities x where x.member_id=m.id and x.provider='discord' order by x.id limit 1) i on true
      left join discord_members dm on dm.discord_id=i.provider_uid
      left join lateral(select n.nick from player_nicks n where n.player_id=pl.id order by n.at desc,n.id desc limit 1) pn on true
    ), '[]'::jsonb)
  );
  return v_result || jsonb_build_object('revision',md5((v_result->'people')::text));
end;
$$;

create or replace function save_distance_dump(
  p_room_slug text, p_month_start date, p_entry_kind text, p_part integer,
  p_batch_label text, p_note text, p_rows jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_part is null or p_part < 1 then raise exception 'bad part' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into distance_batches (source, file_name, created_by) values ('import', nullif(trim(p_batch_label), ''), current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id,
      nullif(trim(x->>'variant_id'), '') variant_id, nullif(trim(x->>'limit_id'), '') limit_id,
      nullif(x->>'hands', '')::integer hands, nullif(trim(x->>'game_nick'), '') game_nick
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$' or rec.variant_id not in ('nitro', 'regular')
      or rec.hands is null or rec.hands < 0 or not exists (select 1 from limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    perform remember_distance_nick(v_room,rec.distance_ext_id,rec.game_nick,p_month_start);
    if rec.hands = 0 then v_skipped := v_skipped + 1; continue; end if;
    v_member := null; v_discord := null;
    did_insert := write_normalized_distance_value(v_batch, v_member, v_room, p_month_start, rec.variant_id, p_part,
      p_note, v_discord, rec.distance_ext_id, rec.game_nick, 'import', rec.limit_id, rec.hands);
    if did_insert then
      v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown);
end;
$$;

create or replace function save_historical_distance_dump(p_room_slug text, p_variant_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_batch uuid; v_inserted integer := 0; v_skipped integer := 0; v_unknown integer := 0; v_nick_updated integer := 0;
  v_member uuid; v_discord text; v_player uuid; rec record; did_insert boolean;
begin
  if not is_root() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_variant_id not in ('nitro', 'regular') then raise exception 'bad variant' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  insert into distance_batches (source, file_name, created_by) values ('historical', 'historical-wide-csv', current_member_id()) returning id into v_batch;
  for rec in select nullif(trim(x->>'distance_ext_id'), '') distance_ext_id, nullif(trim(x->>'discord_id'), '') source_discord_id,
      nullif(trim(x->>'game_nick'), '') game_nick, nullif(x->>'month_start', '')::date month_start,
      nullif(x->>'part', '')::integer part, nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'hands', '')::integer hands
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  loop
    if rec.distance_ext_id is null or rec.distance_ext_id !~ '^[0-9]{1,12}$'
      or (rec.source_discord_id is not null and rec.source_discord_id !~ '^[0-9]{15,22}$')
      or rec.month_start is null or rec.month_start is distinct from date_trunc('month', rec.month_start)::date
      or rec.part is null or rec.part < 1 or rec.hands is null or rec.hands <= 0
      or not exists (select 1 from limits where id = rec.limit_id) then v_unknown := v_unknown + 1; continue; end if;
    v_discord := rec.source_discord_id; v_member := null;
    perform remember_distance_nick(v_room,rec.distance_ext_id,rec.game_nick,rec.month_start);
    did_insert := write_normalized_distance_value(v_batch, v_member, v_room, rec.month_start, p_variant_id, rec.part,
      'Historical distance import', v_discord, rec.distance_ext_id, rec.game_nick, 'historical', rec.limit_id, rec.hands);
    if did_insert then
      v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;
  if v_inserted = 0 then delete from distance_batches where id = v_batch; end if;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'unknown', v_unknown, 'nick_updated', v_nick_updated);
end;
$$;

create or replace function create_manual_distance_entry(
  p_member_id uuid, p_room_slug text, p_month_start date, p_variant_id text,
  p_part integer, p_comment text, p_distance_ext_id text, p_values jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room uuid; v_ext text; v_discord text; v_nick text; v_entry uuid; v_batch uuid;
  v_count integer := 0; rec record;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start is distinct from date_trunc('month', p_month_start)::date then raise exception 'bad month' using errcode = '22007'; end if;
  if p_variant_id not in ('nitro', 'regular') or p_part is null or p_part < 1 then raise exception 'bad entry' using errcode = '22023'; end if;
  select id into v_room from rooms where slug = coalesce(nullif(trim(p_room_slug), ''), 'winamax');
  if v_room is null then raise exception 'bad room' using errcode = '22023'; end if;
  perform 1 from members where id=p_member_id and access_status='active' for update;
  if not found then raise exception 'bad member' using errcode='22023'; end if;
  v_ext := nullif(btrim(p_distance_ext_id),'');
  if v_ext is null or v_ext !~ '^[0-9]{1,12}$' then raise exception 'bad distance id' using errcode='22023'; end if;
  if not exists(select 1 from member_distance_ids where member_id=p_member_id) then
    perform save_member_distance_ids(p_member_id,array[v_ext],array[]::text[]);
  elsif not exists(select 1 from member_distance_ids where member_id=p_member_id and distance_ext_id=v_ext) then
    raise exception 'distance-id-not-assigned' using errcode='22023';
  end if;
  v_discord := null;
  select pn.nick into v_nick from players pl join player_nicks pn on pn.player_id = pl.id
    where pl.member_id = p_member_id and pl.room_id = v_room order by pn.at desc, pn.id desc limit 1;
  insert into distance_batches (source, created_by) values ('manual', current_member_id()) returning id into v_batch;
  insert into distance_entries (batch_id, member_id, room_id, month_start, variant_id, part, comment,
    discord_id, distance_ext_id, game_nick, source, created_by, updated_by)
  values (v_batch, null, v_room, p_month_start, p_variant_id, p_part, nullif(trim(p_comment), ''),
    v_discord, v_ext, v_nick, 'manual', current_member_id(), current_member_id()) returning id into v_entry;
  for rec in select nullif(trim(x->>'limit_id'), '') limit_id, nullif(x->>'tournaments', '')::integer tournaments
    from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) x
  loop
    if rec.tournaments is null or rec.tournaments < 0 or not exists (select 1 from limits where id = rec.limit_id) then raise exception 'bad value' using errcode = '22023'; end if;
    if rec.tournaments > 0 then
      insert into distance_values (entry_id, limit_id, tournaments) values (v_entry, rec.limit_id, rec.tournaments);
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count = 0 then raise exception 'empty values' using errcode = '22023'; end if;
  return jsonb_build_object('id', v_entry, 'values', v_count);
end;
$$;

create or replace function create_club_card(p_discord_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  snap discord_members%rowtype;
  req club_join_requests%rowtype;
  uname text;
  code text;
  dist text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;
  if mid is not null then
    return mid;
  end if;

  select * into snap from discord_members where discord_id = p_discord_id;
  select * into req
  from club_join_requests
  where discord_id = p_discord_id
    and kind = 'join'
  order by created_at desc
  limit 1;

  if snap.discord_id is not null and snap.bot then
    raise exception 'unknown-discord';
  end if;
  if snap.discord_id is null and req.id is null then
    raise exception 'unknown-discord';
  end if;

  uname := coalesce(
    nullif(btrim(snap.guild_nick), ''),
    nullif(btrim(snap.global_name), ''),
    nullif(btrim(req.display_name), ''),
    nullif(btrim(snap.username), ''),
    nullif(btrim(req.username), ''),
    'user'
  );
  loop
    code := 'RP-' || substr(md5(p_discord_id || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from members where public_code = code);
  end loop;

  insert into members (auth_user_id, public_code, access_status, mark_tag, community_status, approved_at)
  values (req.auth_user_id, code, 'blocked', null, 'club', null)
  returning id into mid;

  insert into profiles (member_id, display_name)
  values (mid, uname);

  insert into identities (
    member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw,
    guild_present, guild_left_at, discord_roles
  ) values (
    mid,
    'discord',
    p_discord_id,
    coalesce(snap.username, req.username),
    coalesce(snap.global_name, req.display_name),
    snap.guild_nick,
    coalesce(snap.avatar_url, req.avatar_url),
    jsonb_build_object('source', 'admin-card'),
    snap.discord_id is not null,
    case when snap.discord_id is null then now() else null end,
    coalesce(snap.roles, '[]'::jsonb)
  );

  update club_join_requests
  set status = 'done', resolved_at = now(), resolved_by = current_member_id(), member_id = mid
  where discord_id = p_discord_id
    and status = 'open';

  return mid;
end;
$$;

create or replace function self_create_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  uid text;
  snap discord_members%rowtype;
  required_role text;
  allow_self boolean;
  code text;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  select id into mid from members where auth_user_id = auth.uid();
  if mid is not null then return mid; end if;

  select self_create_card, required_discord_role_id
  into allow_self, required_role from club_settings where id;
  if not coalesce(allow_self, false) then
    raise exception 'self-create-disabled' using errcode = '42501';
  end if;

  uid := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub',
    auth.jwt() -> 'identities' -> 0 ->> 'id'
  );
  select * into snap from discord_members where discord_id = uid and present;
  if snap.discord_id is null or not exists (
    select 1 from jsonb_array_elements(snap.roles) r
    where r ->> 'id' = required_role
  ) then
    raise exception 'redparty-required' using errcode = '42501';
  end if;

  select i.member_id into mid
  from identities i where i.provider = 'discord' and i.provider_uid = uid;
  if mid is not null then
    update members set auth_user_id = auth.uid()
    where id = mid and auth_user_id is null;
    return mid;
  end if;

  loop
    code := 'RP-' || substr(md5(auth.uid()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from members where public_code = code);
  end loop;
  uname := coalesce(snap.guild_nick, snap.global_name, snap.username);

  insert into members (
    auth_user_id, public_code, access_status, approved_at,
    mark_tag, community_status, block_reason, blocked_at
  ) values (
    auth.uid(), code, 'active', now(), null, 'club', null, null
  ) returning id into mid;

  insert into profiles (member_id, display_name)
  values (mid, uname);

  insert into identities (
    member_id, provider, provider_uid, username, display_name, guild_nick,
    avatar_url, raw, guild_present, guild_left_at, discord_roles
  ) values (
    mid, 'discord', uid, snap.username, snap.global_name, snap.guild_nick,
    snap.avatar_url, jsonb_build_object('source', 'self-create'),
    true, null, snap.roles
  );

  perform ensure_default_winamax_play(mid);
  return mid;
end;
$$;

create or replace function set_discord_access(p_discord_id text, p_access text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  actor uuid;
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

  if mid is null then
    raise exception 'no-card';
  end if;

  if p_access = 'closed' and exists (
    select 1 from member_roles where member_id = mid and role_id = 'root'
  ) then
    raise exception 'cannot-close-root';
  end if;

  if p_access = 'closed' and mid = actor then
    raise exception 'cannot-close-self';
  end if;

  if p_access = 'closed' then
    update members
    set access_status = 'blocked',
        approved_at = null
    where id = mid;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
    return mid;
  end if;

  update members
  set access_status = 'active',
      approved_at = coalesce(approved_at, now()),
      community_status = coalesce(community_status, 'club'),
      access_before_leave = null
  where id = mid;

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

create or replace function admin_people_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'discord', coalesce((
      select jsonb_agg(jsonb_build_object(
        'discord_id', d.discord_id, 'username', d.username, 'global_name', d.global_name,
        'guild_nick', d.guild_nick, 'avatar_url', d.avatar_url, 'bot', d.bot,
        'joined_at', d.joined_at, 'roles', d.roles, 'present', d.present
      )) from discord_members d
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'public_code', m.public_code, 'access_status', m.access_status,
        'block_reason', m.block_reason, 'community_status', m.community_status,
        'guarantor_id', m.guarantor_id, 'mark_tag', m.mark_tag, 'mark_bg', m.mark_bg,
        'mark_fg', m.mark_fg, 'tables', m.tables, 'grid_priority', m.grid_priority,
        'core_nitro_250',m.core_nitro_250,'core_regular_250',m.core_regular_250,'vip_nitro', m.vip_nitro, 'vip_regular', m.vip_regular,
        'distance_ext_id', m.distance_ext_id, 'distance_ids', to_jsonb(member_distance_id_list(m.id)), 'auth_user_id', m.auth_user_id,
        'created_at', m.created_at, 'approved_at', m.approved_at
      )) from members m
    ), '[]'::jsonb),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', i.member_id, 'provider', i.provider, 'provider_uid', i.provider_uid,
        'username', i.username, 'display_name', i.display_name, 'guild_nick', i.guild_nick,
        'avatar_url', i.avatar_url, 'guild_present', i.guild_present,
        'discord_roles', i.discord_roles
      )) from identities i
    ), '[]'::jsonb),
    'member_roles', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', mr.member_id, 'role_id', mr.role_id))
      from member_roles mr
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', p.member_id, 'display_name', p.display_name, 'email', p.email,
        'phone', p.phone, 'city', p.city, 'country', p.country, 'birthday', p.birthday,
        'show_extra_tz', p.show_extra_tz, 'extra_utc', p.extra_utc,
        'telegram', p.telegram, 'contact_alt', p.contact_alt, 'notify_channel', p.notify_channel
      )) from profiles p
    ), '[]'::jsonb),
    'distance_map', coalesce((
      select jsonb_agg(jsonb_build_object('discord_id', x.discord_id, 'distance_ext_id', x.distance_ext_id))
      from (select i.provider_uid discord_id,l.distance_ext_id from member_distance_ids l join identities i on i.member_id=l.member_id and i.provider='discord' where l.is_primary) x
    ), '[]'::jsonb),
    'role_catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_id', r.role_id, 'position', r.position,
        'display_order', r.display_order, 'admin_visible', r.admin_visible
      )) from discord_guild_roles r
    ), '[]'::jsonb)
  );
end;
$$;

do $$ declare r record; begin
  for r in select distinct member_id from member_distance_ids loop perform refresh_member_distance_nick(r.member_id); end loop;
end; $$;
update public.priority_rating_cache set dirty=true;
