-- Optional visual merging keeps occupancy rows unchanged.

alter table schedule_settings
  add column if not exists merge_adjacent_slots boolean not null default false;

comment on column schedule_settings.merge_adjacent_slots is
  'When true, clients may render consecutive matching occupancy slots as one visual block. Occupancy rows stay unchanged.';

grant update (merge_adjacent_slots) on schedule_settings to authenticated;
