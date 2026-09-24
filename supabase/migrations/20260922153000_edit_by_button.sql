-- Club flag: whether painting the grid needs the pencil button.
-- Default on: current product. Off: anyone can place/remove marks at any time, no edit glow.

alter table schedule_settings
  add column if not exists edit_by_button boolean not null default true;

comment on table schedule_settings is
  'One row. Club rules for the grid: delete foreign marks, count tables, edit by pencil.';

comment on column schedule_settings.edit_by_button is
  'When true, painters must press the pencil; the bar and grid glow while editing. When false, marks can be placed any time with no edit highlight.';
