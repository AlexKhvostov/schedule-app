-- VIP fill rank is per tournament kind. Nitro and Regular are separate lists.
-- 1 is first in that kind. 0 means no VIP. Numbers unique within the kind.

alter table public.members
  add column if not exists vip_nitro integer not null default 0,
  add column if not exists vip_regular integer not null default 0;

alter table public.members
  drop constraint if exists members_vip_nitro_nonneg,
  drop constraint if exists members_vip_regular_nonneg;

alter table public.members
  add constraint members_vip_nitro_nonneg check (vip_nitro >= 0),
  add constraint members_vip_regular_nonneg check (vip_regular >= 0);

create unique index if not exists members_vip_nitro_pos_uidx
  on public.members (vip_nitro)
  where vip_nitro > 0;

create unique index if not exists members_vip_regular_pos_uidx
  on public.members (vip_regular)
  where vip_regular > 0;

comment on column public.members.vip_nitro is
  'VIP fill rank for Nitro. 1 is first. 0 means no VIP. Unique among values > 0.';

comment on column public.members.vip_regular is
  'VIP fill rank for Regular. 1 is first. 0 means no VIP. Unique among values > 0.';
