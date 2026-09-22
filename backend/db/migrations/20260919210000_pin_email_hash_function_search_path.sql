-- +goose Up

-- update_profile_email_hash() and fill_profile_email_hash() are SECURITY
-- DEFINER but pin no search_path, so they resolve `digest()` and
-- `public.profiles` against whatever search_path the *caller* happens to have.
--
-- update_profile_email_hash() is a trigger on auth.users, so its caller is
-- GoTrue, connecting as supabase_auth_admin — whose search_path is `auth`
-- alone. `digest()` lives in the extensions schema, which is not on that path,
-- so every user creation fails with:
--
--   function digest(text, unknown) does not exist (SQLSTATE 42883)
--
-- This never surfaced in production only because that database's roles happen
-- to be configured with extensions on the path. Relying on that is fragile —
-- and for a SECURITY DEFINER function it is also the classic search_path
-- injection weakness, since a caller controls which schema an unqualified name
-- resolves to while the body runs with the definer's privileges.
--
-- Pinning the path fixes both. No function body changes, so this is safe to
-- apply to a database where these functions already exist.

ALTER FUNCTION update_profile_email_hash()
    SET search_path = public, extensions, pg_temp;

ALTER FUNCTION fill_profile_email_hash()
    SET search_path = public, extensions, pg_temp;

-- +goose Down

ALTER FUNCTION update_profile_email_hash() RESET search_path;
ALTER FUNCTION fill_profile_email_hash() RESET search_path;
