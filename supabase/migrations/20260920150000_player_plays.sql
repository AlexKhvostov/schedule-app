-- Player = member on a room. Cabinet saves nick history and Nitro/Regular limits here.

insert into rooms (slug, title)
values ('pokerstars', 'PokerStars'), ('ggpoker', 'GGPoker')
on conflict (slug) do nothing;

create table players (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  room_id uuid not null references rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id, room_id)
);

create table player_nicks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  nick text not null,
  at timestamptz not null default now()
);

create index player_nicks_player_at on player_nicks (player_id, at desc);

create table player_limits (
  player_id uuid not null references players (id) on delete cascade,
  variant_id text not null references variants (id),
  limit_id text not null references limits (id),
  primary key (player_id, variant_id, limit_id)
);

comment on table players is
  'Member on a poker room. Own id stays if the nick changes.';
comment on table player_nicks is
  'Nick history. The latest row is the current room nick.';
comment on table player_limits is
  'Buy-ins this person plays on that room, split by nitro / regular.';

alter table players enable row level security;
alter table player_nicks enable row level security;
alter table player_limits enable row level security;

grant select, insert, update, delete on players to authenticated;
grant select, insert, update, delete on player_nicks to authenticated;
grant select, insert, update, delete on player_limits to authenticated;
revoke all on players from anon;
revoke all on player_nicks from anon;
revoke all on player_limits from anon;

create policy players_read on players
  for select to authenticated
  using (true);

create policy players_insert on players
  for insert to authenticated
  with check (member_id = current_member_id() or is_staff());

create policy players_update on players
  for update to authenticated
  using (member_id = current_member_id() or is_staff())
  with check (member_id = current_member_id() or is_staff());

create policy players_delete on players
  for delete to authenticated
  using (member_id = current_member_id() or is_staff());

create policy player_nicks_read on player_nicks
  for select to authenticated
  using (true);

create policy player_nicks_write on player_nicks
  for all to authenticated
  using (
    exists (
      select 1 from players p
      where p.id = player_id
        and (p.member_id = current_member_id() or is_staff())
    )
  )
  with check (
    exists (
      select 1 from players p
      where p.id = player_id
        and (p.member_id = current_member_id() or is_staff())
    )
  );

create policy player_limits_read on player_limits
  for select to authenticated
  using (true);

create policy player_limits_write on player_limits
  for all to authenticated
  using (
    exists (
      select 1 from players p
      where p.id = player_id
        and (p.member_id = current_member_id() or is_staff())
    )
  )
  with check (
    exists (
      select 1 from players p
      where p.id = player_id
        and (p.member_id = current_member_id() or is_staff())
    )
  );
