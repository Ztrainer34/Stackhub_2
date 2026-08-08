-- Enable Row Level Security on every table in the public schema.
--
-- Supabase auto-exposes a REST API for public tables using the public `anon`
-- key (shipped in the browser bundle). Without RLS, anyone with that key can
-- read/write these tables directly, bypassing the Go backend entirely — most
-- critically account_claims, which holds single-use claim tokens (credentials).
--
-- We enable RLS with NO policies: the anon/authenticated roles are denied all
-- access through the REST API, while the Go backend (direct connection as table
-- owner) and service-role scripts continue to bypass RLS and work unchanged.
--
-- ENABLE (not FORCE) is deliberate so the owner/service role keep full access.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;
