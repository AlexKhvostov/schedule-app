-- One authorized read for the monthly roster. Reuse the rating cache; do not
-- introduce another formula or persist caller-specific directory permissions.
create function public.load_month_roster(
  p_period_start date, p_variant text, p_group text, p_limit_ids text[],
  p_priority_revision text default null, p_directory_revision text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_source jsonb; v_people jsonb; v_directory jsonb;
  v_priority_revision text; v_directory_revision text;
begin
  if not public.current_has_permission('schedule') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  v_source := public.priority_slice_source(p_period_start,p_variant,p_group);
  select coalesce(jsonb_agg(jsonb_build_object(
    'memberId',p->'memberId',
    'core',p->case when p_group='250' then case when p_variant='nitro' then 'coreNitro250' else 'coreRegular250' end
      else case when p_variant='nitro' then 'vipNitro' else 'vipRegular' end end,
    'score',p->'calculation'->'total',
    'excluded',p->case when p_variant='nitro' then 'excludedNitro' else 'excludedRegular' end
  ) order by p->>'memberId'),'[]'::jsonb) into v_people
  from jsonb_array_elements(v_source->'people') p;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.member_id),'[]'::jsonb) into v_directory
    from public.schedule_player_directory(p_variant,p_limit_ids) d;
  -- Hash the actual projections independently. A display-name/mark/permission
  -- change must refresh the directory even when the rating revision is unchanged.
  v_priority_revision := md5(p_period_start::text || p_variant || p_group || v_people::text);
  v_directory_revision := md5(v_directory::text);
  return jsonb_build_object(
    'periodStart',p_period_start,'kind',p_variant,'group',p_group,
    'today',v_source->'today','lastMonthEntries',v_source->'lastMonthEntries','calculatedAt',v_source->'calculatedAt',
    'revision',v_priority_revision,'directoryRevision',v_directory_revision,
    'people',case when p_priority_revision=v_priority_revision then null else v_people end,
    'directory',case when p_directory_revision=v_directory_revision then null else v_directory end
  );
end;
$$;
revoke all on function public.load_month_roster(date,text,text,text[],text,text) from public,anon;
grant execute on function public.load_month_roster(date,text,text,text[],text,text) to authenticated;
