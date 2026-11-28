-- Vault keeps the encryption key outside database backups. Existing hashes remain valid.
create extension if not exists supabase_vault with schema vault;
-- The browser can only cross this boundary through the guarded management RPC.
revoke all on schema vault from public, anon, authenticated;
revoke all on all tables in schema vault from public, anon, authenticated;
revoke all on all functions in schema vault from public, anon, authenticated;
alter table external_api_private.clients add column key_secret_id uuid
  references vault.secrets(id) on delete set null;

create or replace function external_api_private.manage_clients(
  p_action text, p_id uuid, p_input jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
  expiry timestamptz;
  rpm integer;
  version smallint;
  secret_id uuid;
  raw_key text;
begin
  if auth.uid() is null or not public.is_root() then
    raise exception 'root required' using errcode = '42501';
  end if;
  if p_action = 'create' then
    if p_id is null or jsonb_typeof(p_input) is distinct from 'object'
       or nullif(btrim(p_input->>'name'), '') is null
       or length(btrim(p_input->>'name')) > 100
       or (p_input->>'key_hash') is null
       or (p_input->>'key_hash') !~ '^[0-9a-f]{64}$'
       or length(coalesce(p_input->>'contact', '')) > 200
       or length(coalesce(p_input->>'notes', '')) > 1000 then
      raise exception 'invalid client' using errcode = '22023';
    end if;
    if coalesce(p_input->>'guide_version','1') not in ('1','2') then
      raise exception 'invalid guide version' using errcode='22023';
    end if;
    version:=coalesce((p_input->>'guide_version')::smallint,1);
    expiry := nullif(p_input->>'expires_at', '')::timestamptz;
    rpm := coalesce((p_input->>'requests_per_minute')::integer, 60);
    if (expiry is not null and expiry <= now()) or rpm not between 1 and 600 then
      raise exception 'invalid expiry or quota' using errcode = '22023';
    end if;
    raw_key := p_input->>'key';
    if raw_key is not null and (raw_key !~ '^rp_[0-9a-f]{64}$'
      or encode(extensions.digest(raw_key, 'sha256'), 'hex') <> p_input->>'key_hash') then
      raise exception 'invalid credential' using errcode = '22023';
    end if;
    insert into external_api_private.clients
      (id, name, key_hash, contact, notes, expires_at, requests_per_minute, created_by, guide_version)
    values (p_id, btrim(p_input->>'name'), p_input->>'key_hash',
      btrim(coalesce(p_input->>'contact', '')), btrim(coalesce(p_input->>'notes', '')),
      expiry, rpm, public.current_member_id(), version)
    on conflict (id) do nothing;
    -- Safe retry after a lost HTTP response; an ID cannot overwrite another key.
    if not exists (select 1 from external_api_private.clients
      where id = p_id and key_hash = p_input->>'key_hash' and revoked_at is null) then
      raise exception 'client conflict' using errcode = '22023';
    end if;
    -- Serialize a retry and create the encrypted copy at most once, in this transaction.
    select c.key_secret_id into secret_id from external_api_private.clients c
      where c.id = p_id for update;
    if raw_key is not null and secret_id is null then
      secret_id := vault.create_secret(raw_key);
      update external_api_private.clients set key_secret_id = secret_id where id = p_id;
    end if;
  elsif p_action = 'reveal' then
    -- No raw credentials in list/create/revoke responses. Recheck the current role above.
    select s.decrypted_secret into raw_key
    from external_api_private.clients c
    join vault.decrypted_secrets s on s.id = c.key_secret_id
    where c.id = p_id and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now());
    return to_jsonb(raw_key);
  elsif p_action = 'revoke' then
    update external_api_private.clients
      set revoked_at = coalesce(revoked_at, now()),
          revoked_by = coalesce(revoked_by, public.current_member_id())
      where id = p_id;
    if not found then raise exception 'client missing' using errcode = '22023'; end if;
  elsif p_action is distinct from 'list' then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  -- Explicit allowlist: hashes and future private fields never leave this boundary.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'contact', c.contact, 'notes', c.notes,
    'created_at', c.created_at, 'expires_at', c.expires_at, 'revoked_at', c.revoked_at,
    'requests_per_minute', c.requests_per_minute, 'scopes', c.scopes, 'guide_version',c.guide_version,
    'has_saved_key', c.key_secret_id is not null
  ) order by c.created_at desc, c.id), '[]'::jsonb) into result
  from external_api_private.clients c where p_action = 'list' or c.id = p_id;
  return result;
end;
$$;
revoke all on function external_api_private.manage_clients(text, uuid, jsonb) from public, anon, authenticated;
grant usage on schema external_api_private to authenticated;
grant execute on function external_api_private.manage_clients(text, uuid, jsonb) to authenticated;
