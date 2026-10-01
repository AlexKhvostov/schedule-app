-- schedule_settings is readable and writable only by authenticated users.
-- RLS already rejects anonymous writes, but clean Supabase projects can retain
-- a broad table-level UPDATE grant from the platform defaults. Remove it so the
-- privilege layer matches the policy and the column-level security contract.

revoke update on table public.schedule_settings from anon;
