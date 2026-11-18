-- Completing a turn and opting out of its Discord messages are one transaction.
create function public.confirm_fill_completion(
  p_month date, p_queue text, p_member uuid, p_expected jsonb, p_notify boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid;
  offer jsonb;
  event_id uuid;
  recipient uuid;
  discord_user text;
begin
  actor := schedule_private.require_fill_access(p_month,p_queue);
  perform pg_advisory_xact_lock(hashtext('fill-queue:'||p_queue),(p_month-date '2000-01-01'));
  select c.id into event_id from schedule_private.fill_completions c
    where c.month=p_month and c.queue=p_queue and c.member_id=p_member and c.actor_id=actor;
  if event_id is not null then return jsonb_build_object('id',event_id); end if;

  offer := schedule_private.fill_offer(p_month,p_queue,p_member);
  if offer is distinct from p_expected then return jsonb_build_object('offer',offer); end if;
  insert into schedule_private.fill_completions(month,queue,member_id,actor_id,skipped)
    values(p_month,p_queue,p_member,actor,offer->>'mode'='skip') returning id into event_id;

  if p_notify is true and (offer->>'dm')::boolean then
    recipient := (offer->>'next')::uuid;
    select i.provider_uid into discord_user from public.identities i
      where i.member_id=recipient and i.provider='discord' and i.provider_uid ~ '^[0-9]{17,20}$'
      order by i.updated_at desc,i.id limit 1;
    insert into schedule_private.fill_deliveries(completion_id,destination,channel_id,discord_id,next_member,completed_name,delegated,status,error_code)
      select event_id,destination,offer->>'channel',discord_user,recipient,offer->>'name',actor<>p_member,
        case when discord_user is null then 'skipped' else 'pending' end,
        case when discord_user is null then 'no-discord-id' end
      from unnest(case when offer->>'channel' is null then array['dm'] else array['channel','dm'] end) destination;
  end if;

  perform realtime.send(jsonb_build_object('month',p_month,'queue',p_queue),'fill-queue','app:changes',true);
  return jsonb_build_object('id',event_id);
end $$;
revoke all on function public.confirm_fill_completion(date,text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.confirm_fill_completion(date,text,uuid,jsonb,boolean) to authenticated;

-- Existing clients retain the previous notification default.
create or replace function public.confirm_fill_completion(p_month date,p_queue text,p_member uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select public.confirm_fill_completion(p_month,p_queue,p_member,p_expected,true);
$$;
