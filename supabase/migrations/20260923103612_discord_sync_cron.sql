create extension if not exists pg_net with schema extensions;

create table if not exists discord_sync_cron_secret (
  id boolean primary key default true check (id),
  token text not null default gen_random_uuid()::text
);

insert into discord_sync_cron_secret (id)
values (true)
on conflict (id) do nothing;

alter table discord_sync_cron_secret enable row level security;
revoke all on discord_sync_cron_secret from public, anon, authenticated;
grant select on discord_sync_cron_secret to service_role;

do $$
declare
  existing bigint;
begin
  select jobid into existing from cron.job where jobname = 'redparty-discord-sync';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;
end;
$$;

select cron.schedule(
  'redparty-discord-sync',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://wvfllegshaqonqqpbtle.supabase.co/functions/v1/discord-guild',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2ZmxsZWdzaGFxb25xcXBidGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjM5ODUsImV4cCI6MjEwNTMzOTk4NX0.-rWWcfdjYt5xfzbnDEq0cejbo1BLkHLdxxVOt2Chl-w',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2ZmxsZWdzaGFxb25xcXBidGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjM5ODUsImV4cCI6MjEwNTMzOTk4NX0.-rWWcfdjYt5xfzbnDEq0cejbo1BLkHLdxxVOt2Chl-w',
        'x-cron-token', (select token from discord_sync_cron_secret where id)
      ),
      body := '{}'::jsonb
    );
  $job$
);
