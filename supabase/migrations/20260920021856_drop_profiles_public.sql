-- Public name view was SECURITY DEFINER and tripped the linter.
-- Display name stays on profiles; full card is still self/staff only.

drop view if exists profiles_public;
