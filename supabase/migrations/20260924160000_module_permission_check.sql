-- Let the signed-in client ask whether the current profile has a module.
-- Policies already call this function; the priorities screen calls it too.

grant execute on function current_has_permission(text) to authenticated;
