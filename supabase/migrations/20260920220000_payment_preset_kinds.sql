-- Preset payout types: USDT TRC20 and Skrill. Custom methods stay kind = custom.

alter table payment_methods
  add column if not exists kind text not null default 'custom';

alter table payment_methods
  drop constraint if exists payment_methods_kind_check;

alter table payment_methods
  add constraint payment_methods_kind_check
  check (kind in ('usdt_trc20', 'skrill', 'custom'));

update payment_methods
set kind = 'usdt_trc20'
where kind = 'custom'
  and title ~* 'usdt'
  and title ~* 'trc';

update payment_methods
set kind = 'skrill'
where kind = 'custom'
  and lower(btrim(title)) = 'skrill';

with ranked as (
  select id,
    row_number() over (partition by member_id, kind order by created_at, id) as n
  from payment_methods
  where kind in ('usdt_trc20', 'skrill')
)
update payment_methods p
set kind = 'custom'
from ranked r
where p.id = r.id
  and r.n > 1;

create unique index if not exists payment_methods_preset_kind_uidx
  on payment_methods (member_id, kind)
  where kind in ('usdt_trc20', 'skrill');

comment on column payment_methods.kind is
  'usdt_trc20 and skrill are the two preset wallets. custom is anything the person adds.';
