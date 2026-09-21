-- A person may occupy several seats in the same half-hour:
-- other levels of the same kind, and other kinds. Hours still count that half once.
-- The seat itself stays unique: one mark per kind/date/half/level.

alter table occupancy
  drop constraint if exists occupancy_member_id_slot_date_half_key;

comment on table occupancy is
  'Live marks. One occupant per kind/date/half/level. The same member may hold several seats in one half-hour; hours count unique halves.';
