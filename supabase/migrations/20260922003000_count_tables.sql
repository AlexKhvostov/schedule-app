-- Club flag: whether the grid counts tables on marks.
-- Default off. Occupancy.tables stays in the schema; the product just does not use it.

alter table schedule_settings
  add column if not exists count_tables boolean not null default false;

comment on table schedule_settings is
  'One row. Club rules for the grid: delete foreign marks, count tables.';

comment on column schedule_settings.count_tables is
  'When true, painters set tables in the edit dock and chips show the number. When false, tables are unused in the product.';
