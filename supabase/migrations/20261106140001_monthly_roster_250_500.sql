-- Keep the stored 250 identifier for existing ratings, snapshots and Core fields.
create or replace function public.priority_slice_source(p_period_start date, p_variant text, p_group text, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cache public.priority_rating_cache%rowtype; v_source jsonb; v_person jsonb; v_old jsonb;
  v_people jsonb := '[]'::jsonb; v_entries jsonb; v_months jsonb; v_cells jsonb; v_points jsonb;
  v_calc jsonb; v_core public.members%rowtype; v_count integer;
begin
  if p_variant is null or p_variant not in ('nitro','regular') or p_group is null or p_group not in ('50-100','250') then
    raise exception 'priority-bad-slice' using errcode='22023';
  end if;
  if p_period_start is null or extract(day from p_period_start) <> 1 or extract(month from p_period_start) not in (2,5,8,11)
    or extract(year from p_period_start) not between 2000 and 2100 then raise exception 'priority-bad-period' using errcode='22023'; end if;
  insert into public.priority_rating_cache(period_start,variant_id,limit_group) values(p_period_start,p_variant,p_group) on conflict do nothing;
  -- Serialize concurrent rebuilds. A concurrent input writer marks dirty after this lock is released.
  select * into v_cache from public.priority_rating_cache where period_start=p_period_start and variant_id=p_variant and limit_group=p_group for update;
  if v_cache.dirty or p_force or v_cache.payload is null then
    v_source := public.priority_source(p_period_start);
    for v_person in select value from jsonb_array_elements(v_source->'people') loop
      select * into v_core from public.members where id=(v_person->>'memberId')::uuid;
      select coalesce(jsonb_agg(e order by e->>'month',e->>'id'),'[]') into v_entries
        from jsonb_array_elements(v_person->'entries') e where p_group='50-100' and e->>'variant'=p_variant;
      select x into v_old from jsonb_array_elements(v_cache.payload->'people') x where x->>'memberId'=v_person->>'memberId';
      -- Metadata/Core changes reuse exactly the same saved distance calculation.
      if not p_force and v_old->'entries'=v_entries then v_calc := v_old->'calculation'; else v_calc := null; end if;
      if v_calc is null then
        with months as (
          select (p_period_start + make_interval(months => i))::date as month, i+6 as idx from generate_series(-6,-1) i
        ), totals as (
          select m.month,m.idx, coalesce(sum((v->>'tournaments')::bigint) filter(where v->>'limit'='50'),0) as n50,
            coalesce(sum((v->>'tournaments')::bigint) filter(where v->>'limit'='100'),0) as n100
          from months m left join jsonb_array_elements(v_entries) e on (e->>'month')::date=m.month
          left join lateral jsonb_array_elements(e->'values') v on true group by m.month,m.idx
        ) select jsonb_agg(jsonb_build_object('month',month,
            'nitro50',case when p_variant='nitro' then n50 else 0 end,'regular50',case when p_variant='regular' then n50 else 0 end,
            'nitro100',case when p_variant='nitro' then n100 else 0 end,'regular100',case when p_variant='regular' then n100 else 0 end) order by idx),
          jsonb_build_array(sum(n50) filter(where idx<3),sum(n100) filter(where idx<3),sum(n50) filter(where idx>=3),sum(n100) filter(where idx>=3))
          into v_months,v_cells from totals;
        v_points := jsonb_build_array((v_cells->>0)::numeric*0.5,(v_cells->>1)::numeric,(v_cells->>2)::numeric,(v_cells->>3)::numeric*2);
        v_calc := jsonb_build_object('periodStart',p_period_start,'kind',p_variant,'group',p_group,'months',v_months,'distanceCells',v_cells,'pointCells',v_points,
          'total',(select sum(value::numeric) from jsonb_array_elements_text(v_points)));
      end if;
      v_person := v_person || jsonb_build_object('entries',v_entries,'coreNitro250',v_core.core_nitro_250,'coreRegular250',v_core.core_regular_250,'calculation',v_calc,
        'plays',coalesce((select jsonb_agg(distinct l.variant_id) from public.player_limits l join public.players pl on pl.id=l.player_id
          join public.rooms r on r.id=pl.room_id where pl.member_id=v_core.id and r.slug='winamax'
          and ((p_group='50-100' and l.limit_id in ('50','100')) or (p_group='250' and l.limit_id in ('250','500')))),'[]'::jsonb));
      v_people := v_people || jsonb_build_array(v_person);
    end loop;
    select count(*) into v_count from public.distance_entries e join public.rooms r on r.id=e.room_id
      where p_group='50-100' and r.slug='winamax' and e.variant_id=p_variant and e.month_start=(p_period_start-interval '1 month')::date
      and exists(select 1 from public.distance_values v where v.entry_id=e.id and v.limit_id in ('50','100'));
    v_source := v_source || jsonb_build_object('kind',p_variant,'group',p_group,'people',v_people,'lastMonthEntries',v_count,
      'calculatedAt',clock_timestamp(),'revision',md5(v_people::text || p_variant || p_group || p_period_start::text));
    -- Never persist caller authorization in a shared cache.
    v_source := v_source - 'canManage';
    update public.priority_rating_cache set payload=v_source, dirty=false where period_start=p_period_start and variant_id=p_variant and limit_group=p_group;
  else v_source := v_cache.payload; end if;
  return v_source || jsonb_build_object('today',(now() at time zone 'Europe/Minsk')::date,'canManage',public.is_staff());
end;
$$;

update public.priority_rating_cache set dirty=true where limit_group='250';

create or replace function public.load_month_roster(
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
  if p_variant='both' and p_group='250' then
    -- The combined queue needs only Core metadata. Keep the two high Core fields
    -- independent and choose the smallest positive number when both are set.
    with core_players as materialized (
      select d as directory, d.member_id,
        case when m.core_nitro_250 > 0 or m.core_regular_250 > 0 then 0
          when m.vip_nitro > 0 then 1 else 2 end as tier,
        coalesce(least(nullif(m.core_nitro_250,0),nullif(m.core_regular_250,0)),
          nullif(m.vip_nitro,0),nullif(m.vip_regular,0)) as core
      from public.schedule_player_directory(null,null) d
      join public.members m on m.id=d.member_id
      where m.core_nitro_250 > 0 or m.core_regular_250 > 0 or m.vip_nitro > 0 or m.vip_regular > 0
    )
    select coalesce(jsonb_agg(jsonb_build_object('memberId',member_id,'core',core,
      'tier',tier,'score',0,'excluded',false) order by member_id),'[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(directory) order by member_id),'[]'::jsonb)
    into v_people,v_directory from core_players;
    v_source := jsonb_build_object('today',(now() at time zone 'Europe/Minsk')::date,'lastMonthEntries',0);
  else
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
  end if;
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
