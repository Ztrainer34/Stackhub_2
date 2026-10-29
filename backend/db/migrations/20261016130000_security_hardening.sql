-- +goose Up

-- Fixes from the October 2026 security audit that live in the database. Each
-- part is safe to run on production as-is, and safe to run twice.


-- 1. Username format.
--
-- Usernames had no character rule, and the notification emails put them into
-- a link — so a username containing HTML became markup inside a real StackHub
-- email. The Go handlers now enforce ^[a-z0-9_-]{3,30}$; this is the same rule
-- in the database, so nothing can bypass it.
--
-- Added only when every existing username already passes. Postgres re-checks a
-- CHECK constraint on every UPDATE of a row, so if a non-conforming username
-- existed, that user could no longer save any profile change. If this prints
-- the NOTICE instead, run block G of db/scripts/security_audit_checks.sql,
-- rename the rows it lists, and run this part again.
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_format' AND conrelid = 'public.profiles'::regclass
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username !~ '^[a-z0-9_-]{3,30}$') THEN
    RAISE NOTICE 'profiles_username_format NOT added: some usernames do not match ^[a-z0-9_-]{3,30}$';
  ELSE
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_-]{3,30}$');
  END IF;
END $$;
-- +goose StatementEnd


-- 2. custom_access_token_hook.
--
-- SECURITY DEFINER with the default EXECUTE grant to PUBLIC, so anyone could
-- call it through /rest/v1/rpc. Only Supabase Auth needs to. Its body uses
-- fully qualified names (public.profiles) and only pg_catalog functions, so an
-- empty search_path is safe and closes search-path hijacking.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = '';


-- 3. account_claims.
--
-- This table was created in the dashboard and never had a migration. The
-- CREATE is a no-op where it already exists (production), and describes it
-- for fresh databases and for sqlc.
--
-- claimant_nonce binds a claim to the browser that first submitted it. The
-- token stays live until the first sign-in so a mistyped email can be
-- corrected; before this, anyone else holding the link could also re-submit
-- in that window, and the last submission won the account.
CREATE TABLE IF NOT EXISTS public.account_claims (
    token         text PRIMARY KEY,
    user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    expires_at    timestamptz,
    claimed_at    timestamptz,
    claimed_email text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_claims ADD COLUMN IF NOT EXISTS claimant_nonce text;

-- Tokens are credentials. Only the service role (the claim route, the
-- claim-link script) touches this table; RLS with no policies denies everyone
-- else.
ALTER TABLE public.account_claims ENABLE ROW LEVEL SECURITY;


-- +goose Down

ALTER TABLE public.account_claims DROP COLUMN IF EXISTS claimant_nonce;

ALTER FUNCTION public.custom_access_token_hook(jsonb) RESET search_path;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO PUBLIC;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
