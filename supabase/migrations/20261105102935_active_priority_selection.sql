-- A shared selector, not a frozen rating or an activation history.
create table public.priority_settings (
  id boolean primary key default true check (id),
  active_period date not null default '2026-08-01' check (
    extract(day from active_period)=1 and extract(month from active_period) in (2,5,8,11)
    and extract(year from active_period) between 2000 and 2100),
  revision bigint not null default 0 check (revision >= 0)
);
alter table public.priority_settings enable row level security;
revoke all on public.priority_settings from public, anon, authenticated;
insert into public.priority_settings(id) values(true);

create function public.set_active_priority(p_period_start date, p_expected_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_revision bigint;
begin
  if auth.uid() is null or not public.current_has_permission('admin.people') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_period_start is null or extract(day from p_period_start)<>1
    or extract(month from p_period_start) not in (2,5,8,11)
    or extract(year from p_period_start) not between 2000 and 2100 then
    raise exception 'priority-bad-period' using errcode='22023';
  end if;
  select revision into strict v_revision from public.priority_settings where id for update;
  if p_expected_revision is distinct from v_revision then
    raise exception 'priority-active-conflict' using errcode='40001';
  end if;
  update public.priority_settings set active_period=p_period_start, revision=revision+1 where id;
end;
$$;
revoke all on function public.set_active_priority(date,bigint) from public,anon;
grant execute on function public.set_active_priority(date,bigint) to authenticated;

-- Null means follow the active selection. Explicit dates are read-only previews.
-- Keep the selector stable throughout this read and reuse the existing live cache.
create function public.load_priority_view(p_period_start date,p_variant text,p_group text,p_refresh boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.priority_settings%rowtype; v_source jsonb;
begin
  if auth.uid() is null or not (public.current_has_permission('priorities') or public.current_has_permission('schedule')) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select * into strict v_settings from public.priority_settings where id for share;
  v_source:=public.load_priority_slice(coalesce(p_period_start,v_settings.active_period),p_variant,p_group,p_refresh);
  return v_source || jsonb_build_object('activePeriod',v_settings.active_period,'activeRevision',v_settings.revision,
    'canActivate',public.current_has_permission('admin.people'));
end;
$$;
revoke all on function public.load_priority_view(date,text,text,boolean) from public,anon;
grant execute on function public.load_priority_view(date,text,text,boolean) to authenticated;

-- No caller-supplied period: every current schedule client uses the club selection.
-- The old explicit-period projection remains available for compatibility.
create function public.load_active_month_roster(
  p_variant text,p_group text,p_limit_ids text[],p_priority_revision text default null,p_directory_revision text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_period date;
begin
  if auth.uid() is null or not public.current_has_permission('schedule') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select active_period into strict v_period from public.priority_settings where id for share;
  return public.load_month_roster(v_period,p_variant,p_group,p_limit_ids,p_priority_revision,p_directory_revision);
end;
$$;
revoke all on function public.load_active_month_roster(text,text,text[],text,text) from public,anon;
grant execute on function public.load_active_month_roster(text,text,text[],text,text) to authenticated;
