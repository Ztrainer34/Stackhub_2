-- +goose Up

-- Admin role. A row here lets a profile use /admin (RequireAdmin in routes.go).
-- Granted and revoked only out of band (frontend/scripts/grant-admin.mjs or the
-- SQL editor), never over HTTP. A table rather than a profiles column so no
-- existing profile query or SELECT * can expose it.
-- Safe to run twice.
--
-- PASTE ONLY THIS UP SECTION into the Supabase SQL editor. The Down section at
-- the bottom is plain SQL: pasted, it runs and drops the table.
CREATE TABLE IF NOT EXISTS admins (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS with no policies: the Supabase REST API (anon / authenticated keys) can
-- neither read nor write it. The Go backend (table owner) and the service role
-- bypass RLS. The REVOKE is belt and braces against a future permissive policy
-- and against Supabase's default grants on new tables in public.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admins FROM PUBLIC, anon, authenticated;

-- Verify after pasting (run these, do not trust the paste):
--
--   SELECT has_table_privilege('anon', 'public.admins', 'select,insert,update,delete');           -- must be false
--   SELECT has_table_privilege('authenticated', 'public.admins', 'select,insert,update,delete');  -- must be false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admins'::regclass;                    -- must be true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admins';        -- must be 0
--
-- The Go backend's database role must still be able to SELECT it: sign in to a
-- fresh session after granting yourself, then open /admin. A 500 from /admin
-- with "permission denied for table admins" in the backend log means the
-- backend role lost access.

-- +goose Down
DROP TABLE IF EXISTS admins;
